import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');

    console.log(`📞 [Twilio-Handler] Incoming request at ${timestamp}:`, {
      callId,
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers.get('user-agent'),
        'content-type': req.headers.get('content-type')
      }
    });

    if (!callId) {
      console.error('❌ [Twilio-Handler] Missing callId parameter');
      throw new Error('Call ID is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get call details with candidate and campaign info
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select(`
        *,
        candidate:candidates(
          *,
          campaign:campaigns(
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
      console.error(`❌ [Twilio-Handler] Call not found:`, { callId, error: callError });
      throw new Error('Call not found');
    }

    console.log(`✅ [Twilio-Handler] Call found:`, {
      callId: call.id,
      candidateName: call.candidate.full_name,
      campaignName: call.candidate.campaign.name
    });

    // Generate WebSocket stream URL (Twilio requires wss scheme)
    const baseHttps = Deno.env.get('SUPABASE_URL') ?? '';
    const wsBase = baseHttps.replace('https://', 'wss://');
    const streamUrl = `${wsBase}/functions/v1/elevenlabs-stream?callId=${callId}`;
    
    console.log(`🔗 [Twilio-Handler] WebSocket URL for call ${callId}:`, {
      streamUrl,
      baseHttps,
      wsBase,
      timestamp
    });

    // Generate TwiML to connect to ElevenLabs via WebSocket (bidirectional audio)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="both_tracks">
      <Parameter name="callId" value="${callId}" />
    </Stream>
  </Connect>
</Response>`;

    console.log(`✅ [Twilio-Handler] TwiML generated for call ${callId}:`, {
      track: 'both_tracks',
      streamUrl,
      hasCallIdParameter: true
    });
    
    console.log(`📄 [Twilio-Handler] Full TwiML:\n${twiml}`);

    console.log(`✅ [Twilio-Handler] Returning TwiML response for call ${callId}`);
    
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error(`❌ [Twilio-Handler] Error:`, error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
    return new Response(errorTwiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});
