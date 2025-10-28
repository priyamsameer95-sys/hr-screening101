import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const upgradeHeader = req.headers.get("upgrade") || "";
  
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const url = new URL(req.url);
  const callId = url.searchParams.get('callId');
  const agentId = Deno.env.get('ELEVENLABS_AGENT_ID');
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');

  console.log('ElevenLabs stream request:', { callId, agentId: agentId?.slice(0, 10) + '...', hasApiKey: !!apiKey });

  if (!callId) {
    console.error('Missing callId parameter');
    return new Response("Missing callId parameter", { status: 400 });
  }

  if (!agentId || !apiKey) {
    console.error('Missing ElevenLabs credentials:', { hasAgentId: !!agentId, hasApiKey: !!apiKey });
    return new Response("Missing ElevenLabs credentials", { status: 500 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let elevenLabsWs: WebSocket | null = null;
  let conversationId: string | null = null;
  let twilioStreamSid: string | null = null;

  socket.onopen = async () => {
    console.log('Twilio WebSocket connected for call:', callId);

    try {
      // Fetch call details with campaign and questions
      const { data: call, error: callError } = await supabase
        .from('calls')
        .select(`
          *,
          candidate:candidates!inner(
            *,
            campaign:campaigns!inner(
              *,
              question_template:question_templates(
                *,
                questions(*)
              )
            )
          )
        `)
        .eq('id', callId)
        .single();

      if (callError || !call) {
        console.error('Call not found:', callError);
        socket.close();
        return;
      }

      const candidate = call.candidate;
      const campaign = candidate.campaign;
      const questions = campaign.question_template?.questions || [];

      console.log('Call details loaded:', {
        candidate: candidate.full_name,
        campaign: campaign.name,
        questionsCount: questions.length
      });

      // Build dynamic prompt with questions
      const dynamicPrompt = buildConversationalPrompt(candidate, campaign, questions);
      console.log('Dynamic prompt created for agent');

      // Get signed URL from ElevenLabs
      const signedUrlResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
        }
      );

      if (!signedUrlResponse.ok) {
        const errorText = await signedUrlResponse.text();
        console.error('Failed to get signed URL:', errorText);
        socket.close();
        return;
      }

      const { signed_url } = await signedUrlResponse.json();
      console.log('Got signed URL, connecting to ElevenLabs...');

      // Connect to ElevenLabs with signed URL
      elevenLabsWs = new WebSocket(signed_url);

      elevenLabsWs.onopen = () => {
        console.log('ElevenLabs WebSocket connected');
        
        // Send custom configuration to override agent prompt
        const configMessage = {
          type: 'conversation_initiation_client_data',
          custom_llm_extra_body: {
            system_prompt: dynamicPrompt
          }
        };
        
        elevenLabsWs?.send(JSON.stringify(configMessage));
        console.log('Sent dynamic prompt to ElevenLabs agent');
        
        // Update call status to IN_PROGRESS
        supabase
          .from('calls')
          .update({ 
            status: 'IN_PROGRESS',
            started_at: new Date().toISOString() 
          })
          .eq('id', callId)
          .then(() => console.log('Call status updated to IN_PROGRESS'));
      };

      elevenLabsWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('ElevenLabs message type:', data.type);

          if (data.type === 'conversation_initiation_metadata') {
            conversationId = data.conversation_id;
            console.log('Conversation started:', conversationId);
          } else if (data.type === 'audio' && data.audio) {
            // Forward audio from ElevenLabs to Twilio using the correct Twilio streamSid
            if (!twilioStreamSid) {
              console.warn('Cannot send audio to Twilio: streamSid not set yet');
            } else {
              socket.send(JSON.stringify({
                event: 'media',
                streamSid: twilioStreamSid,
                media: {
                  payload: data.audio,
                },
              }));
            }
          } else if (data.type === 'transcript' && data.transcript) {
            // Save transcript
            await supabase.from('transcripts').insert({
              call_id: callId,
              timestamp: new Date().toISOString(),
              speaker: data.role === 'agent' ? 'AGENT' : 'CANDIDATE',
              text: data.transcript,
              confidence: 0.95,
              sequence_number: Date.now(),
            });
            console.log('Transcript saved:', data.role, data.transcript);
          } else if (data.type === 'interruption') {
            console.log('User interrupted');
          } else if (data.type === 'ping') {
            elevenLabsWs?.send(JSON.stringify({ type: 'pong', event_id: data.event_id }));
          }
        } catch (error) {
          console.error('Error processing ElevenLabs message:', error);
        }
      };

      elevenLabsWs.onerror = (error) => {
        console.error('ElevenLabs WebSocket error:', error);
      };

      elevenLabsWs.onclose = () => {
        console.log('ElevenLabs WebSocket closed');
        socket.close();
      };
    } catch (error) {
      console.error('Error setting up ElevenLabs connection:', error);
      socket.close();
    }
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      if (message.event === 'start') {
        twilioStreamSid = message.start?.streamSid || null;
        console.log('Twilio stream started. streamSid:', twilioStreamSid);
      } else if (message.event === 'media' && elevenLabsWs?.readyState === WebSocket.OPEN) {
        // Forward audio from Twilio to ElevenLabs
        elevenLabsWs.send(JSON.stringify({
          user_audio_chunk: message.media.payload,
        }));
      } else if (message.event === 'stop') {
        console.log('Twilio stream stopped');
        elevenLabsWs?.close();
      }
    } catch (error) {
      console.error('Error processing Twilio message:', error);
    }
  };

  socket.onclose = async () => {
    console.log('Twilio WebSocket closed for call:', callId);
    elevenLabsWs?.close();
    
    // Update call status
    await supabase
      .from('calls')
      .update({
        status: 'COMPLETED',
        ended_at: new Date().toISOString(),
      })
      .eq('id', callId);

    // Trigger analysis
    if (conversationId) {
      await supabase.functions.invoke('analyze-response', {
        body: { callId },
      });
    }
  };

  socket.onerror = (error) => {
    console.error('Twilio WebSocket error:', error);
  };

  return response;
});

/**
 * Build a conversational prompt with campaign-specific questions
 */
function buildConversationalPrompt(candidate: any, campaign: any, questions: any[]): string {
  const sortedQuestions = questions.sort((a, b) => a.sequence_order - b.sequence_order);
  
  const questionsList = sortedQuestions
    .map((q, idx) => `${idx + 1}. ${q.question_text}`)
    .join('\n');

  return `You are Kajal, an AI HR assistant from ${campaign.company_name || 'CashKaro'}. You're conducting a screening call for the ${campaign.position} position.

CANDIDATE DETAILS:
- Name: ${candidate.full_name}
- Position Applied: ${candidate.position || campaign.position}
- Phone: ${candidate.phone_number}
${candidate.current_company ? `- Current Company: ${candidate.current_company}` : ''}
${candidate.years_experience ? `- Experience: ${candidate.years_experience} years` : ''}

YOUR ROLE:
- Be warm, professional, and conversational
- Speak naturally like a real HR professional would
- Keep responses concise (2-3 sentences max)
- Listen actively and acknowledge responses
- Ask ONE question at a time
- Let the candidate finish speaking before responding

CALL FLOW:
1. Start with a warm greeting and confirm you're speaking with ${candidate.full_name}
2. Briefly explain this is a screening call for the ${campaign.position} role (10-15 minutes)
3. Ask if now is a good time - if not, offer to reschedule
4. Go through each question below IN ORDER, naturally and conversationally
5. After each response, acknowledge briefly before moving to next question
6. At the end, thank them and mention next steps (team will review and respond in 2-3 business days)

QUESTIONS TO ASK (in this order):
${questionsList}

IMPORTANT GUIDELINES:
- If candidate asks to reschedule, be accommodating and polite
- If they're not available, thank them and end call gracefully
- For salary questions, let them share current and expected separately
- For notice period, confirm the exact duration
- Don't rush - let natural pauses happen
- Use acknowledgments like "Thank you for sharing that", "I see", "That's helpful"
- Stay on topic but be human and empathetic

RESPONSE EXTRACTION:
- Listen carefully for key information like notice period, salary figures, skills
- Don't ask follow-up questions unless response is completely unclear
- Trust the candidate's answers and move forward

Remember: You're representing ${campaign.company_name || 'the company'}, so maintain professionalism while being friendly and approachable.`;
}

