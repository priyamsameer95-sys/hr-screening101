import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');

    console.log('Handling Twilio call for callId:', callId);

    if (!callId) {
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
      console.error('Call not found:', callError);
      throw new Error('Call not found');
    }

    console.log('Call found for candidate:', call.candidate.full_name);

    // Generate WebSocket stream URL - use HTTPS for Twilio to establish the WebSocket
    const BASE_URL = Deno.env.get('SUPABASE_URL');
    const streamUrl = `${BASE_URL}/functions/v1/elevenlabs-stream?callId=${callId}`;

    console.log('Generating TwiML with stream URL:', streamUrl);
    console.log('Call ID being passed:', callId);

    // Generate TwiML to connect to ElevenLabs via WebSocket
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

    console.log('TwiML generated successfully');

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Error handling Twilio call:', error);
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
