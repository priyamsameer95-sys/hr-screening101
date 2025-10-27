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

  socket.onopen = async () => {
    console.log('Twilio WebSocket connected for call:', callId);

    try {
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
      };

      elevenLabsWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('ElevenLabs message type:', data.type);

          if (data.type === 'conversation_initiation_metadata') {
            conversationId = data.conversation_id;
            console.log('Conversation started:', conversationId);
          } else if (data.type === 'audio' && data.audio) {
            // Forward audio from ElevenLabs to Twilio
            socket.send(JSON.stringify({
              event: 'media',
              streamSid: callId,
              media: {
                payload: data.audio,
              },
            }));
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
        console.log('Twilio stream started');
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
