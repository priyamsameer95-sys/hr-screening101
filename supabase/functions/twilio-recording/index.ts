import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // Twilio sends application/x-www-form-urlencoded by default
    let form: FormData | null = null;
    try {
      form = await req.formData();
    } catch (_) {
      // Fallback: if Twilio sends JSON (unlikely), try parsing
      try {
        const json = await req.json();
        form = new FormData();
        Object.entries(json).forEach(([k, v]) => form!.append(k, String(v)));
      } catch (e) {
        console.error('Recording webhook: unable to parse body', e);
      }
    }

    const get = (k: string) => form?.get(k)?.toString();

    const payload = {
      CallSid: get('CallSid'),
      CallStatus: get('CallStatus'),
      RecordingSid: get('RecordingSid'),
      RecordingStatus: get('RecordingStatus'),
      RecordingUrl: get('RecordingUrl'),
      RecordingDuration: get('RecordingDuration'),
      Timestamp: new Date().toISOString(),
      ContentType: contentType,
    };

    console.log('🎧 Twilio Recording Webhook received:', payload);

    // Intentionally not writing to DB yet — schema may vary between projects.
    // This endpoint primarily acknowledges the callback to avoid 404s and captures logs for debugging.

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Recording webhook error:', error);
    return new Response('Error', { status: 500, headers: corsHeaders });
  }
});