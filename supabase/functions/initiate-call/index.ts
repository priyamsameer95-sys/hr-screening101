import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { candidateId } = await req.json();

    // Get candidate details
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select(`
        *,
        campaign:campaigns(
          *,
          question_template:question_templates(
            *,
            questions(*)
          )
        )
      `)
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      throw new Error('Candidate not found');
    }

    // Update candidate status
    await supabase
      .from('candidates')
      .update({ status: 'SCHEDULED' })
      .eq('id', candidateId);

    // Create call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert({
        candidate_id: candidateId,
        attempt_number: 1,
        status: 'SCHEDULED',
      })
      .select()
      .single();

    if (callError) throw callError;

    // Initiate Twilio call
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const BASE_URL = Deno.env.get('SUPABASE_URL')?.replace('https://', 'https://');

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: candidate.phone_number,
        From: TWILIO_PHONE_NUMBER!,
        Url: `${BASE_URL}/functions/v1/handle-twilio-call?callId=${call.id}`,
        StatusCallback: `${BASE_URL}/functions/v1/twilio-status`,
        StatusCallbackEvent: 'completed',
        Record: 'true',
        RecordingStatusCallback: `${BASE_URL}/functions/v1/twilio-recording`,
      }).toString(),
    });

    if (!twilioResponse.ok) {
      const error = await twilioResponse.text();
      throw new Error(`Twilio error: ${error}`);
    }

    const twilioCall = await twilioResponse.json();

    // Update call with Twilio SID
    await supabase
      .from('calls')
      .update({
        call_sid: twilioCall.sid,
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
      })
      .eq('id', call.id);

    console.log('Call initiated:', {
      callId: call.id,
      candidateId,
      twilioSid: twilioCall.sid,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callId: call.id,
        twilioSid: twilioCall.sid 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error initiating call:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
