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
  let audioQueue: any[] = []; // Buffer audio until twilioStreamSid is established
  let mediaInCount = 0;
  let audioOutCount = 0;
  const forceMuLaw = ((Deno.env.get('ELEVENLABS_FORCE_MULAW') ?? '').toLowerCase() === 'true');
  const elSampleRate = Number(Deno.env.get('ELEVENLABS_OUTPUT_SAMPLE_RATE') ?? '16000');
  let firstAudioSent = false;
  let keepAliveInterval: number | null = null;
  let keepAliveTicks = 0;

  socket.onopen = async () => {
    console.log('✓ Twilio WebSocket connected for call:', callId);

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
        console.log('✓ ElevenLabs WebSocket connected successfully');
        
        // Send custom configuration to override agent prompt
        // Note: ElevenLabs handles audio format internally, Twilio does transcoding
        const configMessage = {
          type: 'conversation_initiation_client_data',
          custom_llm_extra_body: {
            system_prompt: dynamicPrompt
          },
          tts: {
            audio_format: 'ulaw_8000'
          }
        };
        
        elevenLabsWs?.send(JSON.stringify(configMessage));
        console.log('✓ Dynamic prompt + TTS format (ulaw_8000) sent to ElevenLabs agent');
        
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
            audioOutCount++;
            const audioPreview = data.audio.substring(0, 4);
            console.log(`EL audio out #${audioOutCount}, preview: ${audioPreview}`);
            
            const payloadToSend = forceMuLaw 
              ? safeTranscodeToMuLawBase64(data.audio, elSampleRate)
              : data.audio;
            
            // Forward audio from ElevenLabs to Twilio using the correct Twilio streamSid
            if (!twilioStreamSid) {
              console.log('Buffering audio - streamSid not set yet');
              audioQueue.push(payloadToSend);
            } else {
              // Flush queue if any buffered audio
              if (audioQueue.length > 0) {
                console.log(`Flushing ${audioQueue.length} buffered audio chunks`);
                audioQueue.forEach(audio => {
                  const queuedPayload = forceMuLaw ? safeTranscodeToMuLawBase64(audio, elSampleRate) : audio;
                  socket.send(JSON.stringify({
                    event: 'media',
                    streamSid: twilioStreamSid,
                    media: { payload: queuedPayload },
                  }));
                });
                audioQueue = [];
              }
              
              // Send current audio
              socket.send(JSON.stringify({
                event: 'media',
                streamSid: twilioStreamSid,
                media: {
                  payload: payloadToSend,
                },
              }));
              
              // Mark first audio sent and stop keepalive if running
              if (!firstAudioSent) {
                firstAudioSent = true;
                if (keepAliveInterval) {
                  clearInterval(keepAliveInterval);
                  keepAliveInterval = null;
                  console.log('⏹️ Keepalive stopped (first audio sent)');
                }
              }
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
            const transcriptPreview = data.transcript.substring(0, 50);
            console.log(`EL transcript (${data.role}): ${transcriptPreview}...`);
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
        console.error('❌ ElevenLabs WebSocket error:', error);
        // Try to send error details to Twilio before closing
        try {
          socket.send(JSON.stringify({
            event: 'error',
            message: 'ElevenLabs connection failed'
          }));
        } catch (e) {
          console.error('Failed to send error to Twilio:', e);
        }
      };

      elevenLabsWs.onclose = (event) => {
        console.log('❌ ElevenLabs WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        socket.close();
      };
    } catch (error) {
      console.error('❌ Error setting up ElevenLabs connection:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
      socket.close();
    }
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      if (message.event === 'start') {
        twilioStreamSid = message.start?.streamSid || null;
        console.log('✓ Twilio stream started. streamSid:', twilioStreamSid);
        
        // Flush any buffered audio now that we have streamSid
        if (audioQueue.length > 0) {
          console.log(`Flushing ${audioQueue.length} buffered audio chunks on stream start`);
          audioQueue.forEach(audio => {
            const payload = forceMuLaw ? safeTranscodeToMuLawBase64(audio, elSampleRate) : audio;
            socket.send(JSON.stringify({
              event: 'media',
              streamSid: twilioStreamSid,
              media: { payload },
            }));
          });
          audioQueue = [];
        }

        // Start keepalive until first audio arrives (max ~3s)
        if (!keepAliveInterval) {
          console.log('▶️ Starting keepalive frames until first audio...');
          keepAliveTicks = 0;
          keepAliveInterval = setInterval(() => {
            if (firstAudioSent || keepAliveTicks >= 6 || socket.readyState !== WebSocket.OPEN) {
              if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
                console.log('⏹️ Keepalive stopped');
              }
              return;
            }
            const silence = silentMuLawFrameBase64();
            socket.send(JSON.stringify({
              event: 'media',
              streamSid: twilioStreamSid,
              media: { payload: silence },
            }));
            keepAliveTicks++;
          }, 500) as unknown as number;
        }
      } else if (message.event === 'media' && elevenLabsWs?.readyState === WebSocket.OPEN) {
        mediaInCount++;
        if (mediaInCount % 50 === 0) {
          console.log(`Twilio media in: ${mediaInCount} chunks received`);
        }
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
    console.log('❌ Twilio WebSocket closed for call:', callId);
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
      console.log('Closing ElevenLabs WebSocket...');
      elevenLabsWs.close();
    }
    
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
    console.error('❌ Twilio WebSocket error:', error);
    if (error instanceof ErrorEvent) {
      console.error('Error details:', {
        type: error.type,
        message: error.message
      });
    }
  };

  return response;
});

// ===== Audio utilities for μ-law fallback and keepalive =====
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  // deno-lint-ignore no-explicit-any
  return btoa(binary as any);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pcm16LEToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const s = view.getInt16(i * 2, true);
    out[i] = s / 32768;
  }
  return out;
}

function downsampleFloat32(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate === inRate) return input;
  const ratio = inRate / outRate;
  const newLen = Math.floor(input.length / ratio);
  const out = new Float32Array(newLen);
  let pos = 0;
  for (let i = 0; i < newLen; i++) {
    const nextPos = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; pos < nextPos && pos < input.length; pos++) {
      sum += input[pos];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function linearToMuLawSample(sample: number): number {
  // Clamp
  const MAX = 0x7FFF;
  let s = Math.max(-1, Math.min(1, sample)) * MAX;
  const BIAS = 0x84; // 132
  const CLIP = 32635;
  let sign = (s < 0) ? 0x80 : 0x00;
  if (s < 0) s = -s;
  if (s > CLIP) s = CLIP;
  s = s + BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) { /* find exponent */ }
  const mantissa = (s >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0F;
  const mu = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  return mu;
}

function floatToMuLawBytes(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = linearToMuLawSample(input[i]);
  }
  return out;
}

function safeTranscodeToMuLawBase64(b64: string, inSampleRate: number): string {
  try {
    const pcmBytes = base64ToBytes(b64);
    const float32 = pcm16LEToFloat32(pcmBytes);
    const down = downsampleFloat32(float32, inSampleRate, 8000);
    const mu = floatToMuLawBytes(down);
    return bytesToBase64(mu);
  } catch (e) {
    console.error('Transcode to μ-law failed, falling back to original audio:', e);
    return b64; // fallback
  }
}

function silentMuLawFrameBase64(): string {
  // 20ms @8kHz = 160 samples of μ-law silence (0xFF)
  const frame = new Uint8Array(160);
  frame.fill(0xFF);
  return bytesToBase64(frame);
}

/**
 * Build a conversational prompt with campaign-specific questions
 */
function buildConversationalPrompt(candidate: any, campaign: any, questions: any[]): string {
  const sortedQuestions = questions.sort((a, b) => a.sequence_order - b.sequence_order);
  
  const questionsList = sortedQuestions
    .map((q, idx) => `${idx + 1}. ${q.question_text}`)
    .join('\n');

  const companyName = campaign.company_name || candidate.current_company || 'CashKaro';
  const positionName = candidate.position || campaign.position;
  
  return `You are Kajal, an AI HR assistant from ${companyName}. You're conducting a screening call for the ${positionName} position.

CANDIDATE DETAILS:
- Name: ${candidate.full_name}
- Position Applied: ${positionName}
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
1. Start with: "Hi ${candidate.full_name}, I'm calling from ${companyName} about the ${positionName} position you applied for. Is this a good time for a quick 2-minute chat?"
2. If they agree, briefly explain this is a screening call (10-15 minutes)
3. If they say not a good time, offer to reschedule politely
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

