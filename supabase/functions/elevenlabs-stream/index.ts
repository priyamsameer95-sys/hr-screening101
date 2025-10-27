import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  const url = new URL(req.url);
  const callId = url.searchParams.get('callId');
  const apiKey = url.searchParams.get('apiKey');
  const candidateName = url.searchParams.get('candidateName');
  const position = url.searchParams.get('position');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let elevenLabsWs: WebSocket | null = null;
  let transcriptSequence = 0;

  socket.onopen = async () => {
    console.log('Twilio WebSocket connected for call:', callId);

    // Connect to ElevenLabs Conversational AI
    const elevenLabsUrl = 'wss://api.elevenlabs.io/v1/convai/conversation';
    elevenLabsWs = new WebSocket(elevenLabsUrl, {
      headers: {
        'xi-api-key': apiKey!,
      },
    });

    elevenLabsWs.onopen = () => {
      console.log('ElevenLabs WebSocket connected');
      
      // Configure the conversation
      const config = {
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: `You are Kajal, a professional HR representative from CashKaro conducting a screening interview with ${candidateName} for the ${position} role.`,
              llm: 'gpt-4o-mini',
              temperature: 0.7,
            },
            first_message: `Hello! This is Kajal from CashKaro's HR team. Am I speaking with ${candidateName}? Great! I'm calling regarding your application for the ${position} role. This call will take about 10-15 minutes. Is this a good time to talk?`,
            language: 'en',
          },
          tts: {
            voice_id: '21m00Tcm4TlvDq8ikWAM', // Kajal's voice
            model_id: 'eleven_turbo_v2_5',
            optimize_streaming_latency: 3,
          },
          stt: {
            provider: 'elevenlabs',
            language: 'en',
          },
        },
      };
      
      elevenLabsWs!.send(JSON.stringify(config));
    };

    elevenLabsWs.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      // Handle different message types
      if (data.type === 'audio') {
        // Forward audio from ElevenLabs to Twilio
        socket.send(JSON.stringify({
          event: 'media',
          streamSid: 'stream_sid',
          media: {
            payload: data.audio_event.audio_base_64,
          },
        }));
      } else if (data.type === 'transcript') {
        // Save transcript to database
        transcriptSequence++;
        await supabase.from('transcripts').insert({
          call_id: callId,
          timestamp: new Date().toISOString(),
          speaker: data.role === 'agent' ? 'AGENT' : 'CANDIDATE',
          text: data.transcript,
          confidence: 0.95,
          sequence_number: transcriptSequence,
        });
        
        console.log('Transcript saved:', data.role, data.transcript);
      } else if (data.type === 'conversation_end') {
        // Conversation ended
        console.log('Conversation ended');
        socket.close();
      }
    };

    elevenLabsWs.onerror = (error) => {
      console.error('ElevenLabs WebSocket error:', error);
    };

    elevenLabsWs.onclose = () => {
      console.log('ElevenLabs WebSocket closed');
      socket.close();
    };
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      if (message.event === 'media' && elevenLabsWs?.readyState === WebSocket.OPEN) {
        // Forward audio from Twilio to ElevenLabs
        elevenLabsWs.send(JSON.stringify({
          type: 'audio',
          audio_event: {
            audio_base_64: message.media.payload,
            encoding: 'mulaw',
            sample_rate: 8000,
          },
        }));
      } else if (message.event === 'stop') {
        // Call ended
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
  };

  socket.onerror = (error) => {
    console.error('Twilio WebSocket error:', error);
  };

  return response;
});
