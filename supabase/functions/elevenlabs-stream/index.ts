import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log('🚀 [ElevenLabs] Function initialized');

serve(async (req) => {
  const requestTimestamp = new Date().toISOString();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeValue = req.headers.get("upgrade");
  const connectionValue = req.headers.get("connection");
  
  console.log(`📞 [ElevenLabs] ${requestTimestamp} - Incoming request:`, { 
    method: req.method, 
    url: req.url,
    upgrade: upgradeValue,
    connection: connectionValue,
    userAgent: req.headers.get("user-agent"),
    origin: req.headers.get("origin"),
    allHeaders: Object.fromEntries(req.headers.entries())
  });

  // Add health check endpoint for testing
  const url = new URL(req.url);
  if (url.searchParams.get('health') === 'check') {
    console.log('✅ [ElevenLabs] Health check - OK');
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: requestTimestamp,
      function: 'elevenlabs-stream'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  
  if (upgradeHeader.toLowerCase() !== "websocket") {
    const errorMsg = `Not a WebSocket request. Upgrade header: '${upgradeHeader}'. Expected 'websocket'`;
    console.error(`❌ [ElevenLabs] ${errorMsg}`);
    console.error(`❌ [ElevenLabs] Full request details:`, {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    });
    return new Response(JSON.stringify({ 
      error: errorMsg,
      received_upgrade: upgradeHeader,
      expected_upgrade: "websocket",
      hint: "This endpoint only accepts WebSocket connections"
    }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const callId = url.searchParams.get('callId');
  const agentId = Deno.env.get('ELEVENLABS_AGENT_ID');
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');

  console.log(`🔑 [ElevenLabs] Call ${callId} - Credentials check:`, { 
    callId, 
    hasAgentId: !!agentId,
    hasApiKey: !!apiKey,
  });

  if (!callId) {
    console.error('❌ [ElevenLabs] Missing callId parameter');
    return new Response("Missing callId parameter", { status: 400 });
  }

  if (!agentId || !apiKey) {
    console.error('❌ [ElevenLabs] Missing credentials');
    return new Response("Missing ElevenLabs credentials", { status: 500 });
  }

  console.log(`🔄 [ElevenLabs] Call ${callId} - Attempting WebSocket upgrade...`);
  
  let socket: WebSocket;
  let response: Response;
  
  try {
    const upgrade = Deno.upgradeWebSocket(req);
    socket = upgrade.socket;
    response = upgrade.response;
    console.log(`✅ [ElevenLabs] Call ${callId} - WebSocket upgrade successful`);
  } catch (error) {
    console.error(`❌ [ElevenLabs] Call ${callId} - WebSocket upgrade failed:`, error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      error: "WebSocket upgrade failed",
      details: errorMsg
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let elevenLabsWs: WebSocket | null = null;
  let conversationId: string | null = null;
  let twilioStreamSid: string | null = null;
  let audioQueue: any[] = []; 
  let mediaInCount = 0;
  let audioOutCount = 0;
  const forceMuLaw = ((Deno.env.get('ELEVENLABS_FORCE_MULAW') ?? 'true').toLowerCase() === 'true');
  const elSampleRate = Number(Deno.env.get('ELEVENLABS_OUTPUT_SAMPLE_RATE') ?? '16000');
  let firstAudioSent = false;
  let keepAliveInterval: number | null = null;
  let keepAliveTicks = 0;

  socket.onopen = async () => {
    console.log(`✅ [Twilio→ElevenLabs] Call ${callId} - WebSocket opened at ${new Date().toISOString()}`);

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
        console.error(`❌ [ElevenLabs] Call ${callId} not found:`, callError);
        socket.close();
        return;
      }

      const candidate = call.candidate;
      const campaign = candidate.campaign;
      const questions = campaign.question_template?.questions || [];

      console.log(`✅ [ElevenLabs] Call ${callId} details:`, {
        candidate: candidate.full_name,
        campaign: campaign.name,
        company: campaign.company_name,
        agent: campaign.agent_name,
        questionsCount: questions.length
      });

      // Build dynamic prompt with questions
      const dynamicPrompt = buildConversationalPrompt(candidate, campaign, questions);
      console.log(`📝 [ElevenLabs] Call ${callId} - Dynamic prompt created`);

      // Get signed URL from ElevenLabs
      console.log(`🔗 [ElevenLabs] Call ${callId} - Requesting signed URL...`);
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
        console.error(`❌ [ElevenLabs] Call ${callId} - Failed to get signed URL:`, errorText);
        socket.close();
        return;
      }

      const { signed_url } = await signedUrlResponse.json();
      console.log(`✅ [ElevenLabs] Call ${callId} - Signed URL obtained, connecting...`);

      // Connect to ElevenLabs with signed URL
      elevenLabsWs = new WebSocket(signed_url);

      elevenLabsWs.onopen = () => {
        console.log(`✅ [ElevenLabs] Call ${callId} - Connected to ElevenLabs AI`);
        
        // Send custom configuration to override agent prompt
        const configMessage = {
          type: 'conversation_initiation_client_data',
          custom_llm_extra_body: {
            system_prompt: dynamicPrompt
          }
        };
        
        elevenLabsWs?.send(JSON.stringify(configMessage));
        console.log(`📤 [ElevenLabs] Call ${callId} - Configuration sent to AI`);
        
        // Update call status to IN_PROGRESS
        supabase
          .from('calls')
          .update({ 
            status: 'IN_PROGRESS',
            started_at: new Date().toISOString() 
          })
          .eq('id', callId)
          .then(() => console.log(`✅ [ElevenLabs] Call ${callId} - Status updated to IN_PROGRESS`));
      };

      elevenLabsWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Only log non-audio messages to avoid spam
          if (data.type !== 'audio') {
            console.log(`📨 [ElevenLabs] Call ${callId} - Message type: ${data.type}`);
          }

          if (data.type === 'conversation_initiation_metadata') {
            conversationId = data.conversation_id;
            console.log(`🆔 [ElevenLabs] Call ${callId} - Conversation ID: ${conversationId}`);
          } else if (data.type === 'audio' && data.audio) {
            audioOutCount++;
            if (audioOutCount % 100 === 0) {
              console.log(`🔊 [ElevenLabs→Twilio] Call ${callId} - ${audioOutCount} audio chunks sent`);
            }
            
            const payloadToSend = forceMuLaw 
              ? safeTranscodeToMuLawBase64(data.audio, elSampleRate)
              : data.audio;
            
            // Forward audio from ElevenLabs to Twilio
            if (!twilioStreamSid) {
              audioQueue.push(payloadToSend);
            } else {
              // Flush queue if any buffered audio
              if (audioQueue.length > 0) {
                console.log(`📦 [ElevenLabs] Call ${callId} - Flushing ${audioQueue.length} buffered chunks`);
                audioQueue.forEach(audio => {
                  socket.send(JSON.stringify({
                    event: 'media',
                    streamSid: twilioStreamSid,
                    media: { payload: audio },
                  }));
                });
                audioQueue = [];
              }
              
              // Send current audio
              socket.send(JSON.stringify({
                event: 'media',
                streamSid: twilioStreamSid,
                media: { payload: payloadToSend },
              }));
              
              // Mark first audio sent and stop keepalive
              if (!firstAudioSent) {
                firstAudioSent = true;
                if (keepAliveInterval) {
                  clearInterval(keepAliveInterval);
                  keepAliveInterval = null;
                  console.log(`⏹️ [ElevenLabs] Call ${callId} - Keepalive stopped (audio flowing)`);
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
            const preview = data.transcript.substring(0, 50);
            console.log(`💬 [ElevenLabs] Call ${callId} - ${data.role}: ${preview}...`);
          } else if (data.type === 'interruption') {
            console.log(`⚠️ [ElevenLabs] Call ${callId} - User interrupted`);
          } else if (data.type === 'ping') {
            elevenLabsWs?.send(JSON.stringify({ type: 'pong', event_id: data.event_id }));
          }
        } catch (error) {
          console.error(`❌ [ElevenLabs] Call ${callId} - Error processing message:`, error);
        }
      };

      elevenLabsWs.onerror = (error) => {
        console.error(`❌ [ElevenLabs] Call ${callId} - WebSocket error:`, error);
      };

      elevenLabsWs.onclose = (event) => {
        console.log(`🔌 [ElevenLabs] Call ${callId} - Connection closed:`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        socket.close();
      };
    } catch (error) {
      console.error(`❌ [ElevenLabs] Call ${callId} - Setup error:`, error);
      socket.close();
    }
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      if (message.event === 'start') {
        twilioStreamSid = message.start?.streamSid || null;
        console.log(`✅ [Twilio] Call ${callId} - Stream started. SID: ${twilioStreamSid}`);
        
        // Flush any buffered audio
        if (audioQueue.length > 0) {
          console.log(`📦 [Twilio] Call ${callId} - Flushing ${audioQueue.length} buffered chunks`);
          audioQueue.forEach(audio => {
            socket.send(JSON.stringify({
              event: 'media',
              streamSid: twilioStreamSid,
              media: { payload: audio },
            }));
          });
          audioQueue = [];
        }

        // Start keepalive until first audio arrives
        if (!keepAliveInterval) {
          console.log(`▶️ [Twilio] Call ${callId} - Starting keepalive frames...`);
          keepAliveTicks = 0;
          keepAliveInterval = setInterval(() => {
            if (firstAudioSent || keepAliveTicks >= 6 || socket.readyState !== WebSocket.OPEN) {
              if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
              }
              return;
            }
            socket.send(JSON.stringify({
              event: 'media',
              streamSid: twilioStreamSid,
              media: { payload: silentMuLawFrameBase64() },
            }));
            keepAliveTicks++;
          }, 500) as unknown as number;
        }
      } else if (message.event === 'media' && elevenLabsWs?.readyState === WebSocket.OPEN) {
        mediaInCount++;
        if (mediaInCount % 100 === 0) {
          console.log(`🎤 [Twilio→ElevenLabs] Call ${callId} - ${mediaInCount} audio chunks received`);
        }
        // Forward audio from Twilio to ElevenLabs
        const pcm16b64 = transcodeTwilioMuLawToPCM16B64(message.media.payload);
        elevenLabsWs.send(JSON.stringify({
          user_audio_chunk: pcm16b64,
        }));
      } else if (message.event === 'stop') {
        console.log(`🛑 [Twilio] Call ${callId} - Stream stopped`);
        elevenLabsWs?.close();
      }
    } catch (error) {
      console.error(`❌ [Twilio] Call ${callId} - Error processing message:`, error);
    }
  };

  socket.onclose = async () => {
    console.log(`🔌 [Twilio] Call ${callId} - Connection closed at ${new Date().toISOString()}`);
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
      console.log(`🔌 [ElevenLabs] Call ${callId} - Closing connection...`);
      elevenLabsWs.close();
    }
    
    // Update call status
    console.log(`✅ [DB] Call ${callId} - Updating status to COMPLETED...`);
    await supabase
      .from('calls')
      .update({
        status: 'COMPLETED',
        ended_at: new Date().toISOString(),
      })
      .eq('id', callId);

    // Trigger analysis
    if (conversationId) {
      console.log(`🔍 [Analysis] Call ${callId} - Triggering AI analysis...`);
      await supabase.functions.invoke('analyze-response', {
        body: { callId },
      });
    }
  };

  socket.onerror = (error) => {
    console.error(`❌ [Twilio] Call ${callId} - WebSocket error at ${new Date().toISOString()}:`, error);
    if (error instanceof ErrorEvent) {
      console.error(`❌ [Twilio] Call ${callId} - Error details:`, {
        type: error.type,
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno
      });
    }
  };

  return response;
});

// ===== Audio utilities =====
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
  const MAX = 0x7FFF;
  let s = Math.max(-1, Math.min(1, sample)) * MAX;
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = (s < 0) ? 0x80 : 0x00;
  if (s < 0) s = -s;
  if (s > CLIP) s = CLIP;
  s = s + BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) { /* */ }
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
    console.error('Transcode to μ-law failed:', e);
    return b64;
  }
}

function silentMuLawFrameBase64(): string {
  const frame = new Uint8Array(160);
  frame.fill(0xFF);
  return bytesToBase64(frame);
}

function muLawByteToLinearSample(u8: number): number {
  const BIAS = 0x84;
  u8 = ~u8 & 0xff;
  const sign = (u8 & 0x80) ? -1 : 1;
  const exponent = (u8 >> 4) & 0x07;
  const mantissa = u8 & 0x0f;
  let linear = (mantissa << 3) + BIAS;
  linear <<= exponent;
  return (sign * (linear - BIAS)) / 32768;
}

function muLawBytesToFloat32(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = muLawByteToLinearSample(bytes[i]);
  }
  return out;
}

function upsampleFloat32(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate === inRate) return input;
  const ratio = outRate / inRate;
  const newLen = Math.floor(input.length * ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i / ratio;
    const lower = Math.floor(srcIdx);
    const upper = Math.min(lower + 1, input.length - 1);
    const frac = srcIdx - lower;
    out[i] = input[lower] * (1 - frac) + input[upper] * frac;
  }
  return out;
}

function float32ToPCM16LE(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const int16 = (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0;
    view.setInt16(i * 2, int16, true);
  }
  return out;
}

function transcodeTwilioMuLawToPCM16B64(muLawBase64: string): string {
  try {
    const muBytes = base64ToBytes(muLawBase64);
    const float32_8k = muLawBytesToFloat32(muBytes);
    const float32_16k = upsampleFloat32(float32_8k, 8000, 16000);
    const pcm16 = float32ToPCM16LE(float32_16k);
    return bytesToBase64(pcm16);
  } catch (e) {
    console.error('Transcode from μ-law failed:', e);
    return muLawBase64;
  }
}

function buildConversationalPrompt(candidate: any, campaign: any, questions: any[]): string {
  return `You are ${campaign.agent_name || 'an AI Recruiter'} from ${campaign.company_name || 'the company'}. You are conducting a screening call with ${candidate.full_name} for the ${campaign.position} position.

CAMPAIGN: ${campaign.name}
${campaign.description ? `ABOUT: ${campaign.description}` : ''}

YOUR ROLE:
- Be warm, professional, and conversational
- Introduce yourself and the company
- Ask the screening questions naturally in conversation
- Listen actively and ask follow-up questions when appropriate
- Take note of any red flags or concerns

SCREENING QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q.question_text}`).join('\n')}

Remember: This is a real person's career opportunity. Be thoughtful, respectful, and human in your approach.`;
}
