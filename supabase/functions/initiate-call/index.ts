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
    console.log('Initiating call for candidate:', candidateId);

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
      console.error('Candidate fetch error:', candidateError);
      throw new Error('Candidate not found');
    }

    console.log('Candidate found:', {
      name: candidate.full_name,
      phone: candidate.phone_number,
      status: candidate.status
    });

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

    if (callError) {
      console.error('Call record creation error:', callError);
      throw callError;
    }

    console.log('Call record created:', call.id);

    // Initiate Twilio call
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const BASE_URL = Deno.env.get('SUPABASE_URL');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio credentials');
    }

    console.log('Twilio config:', {
      accountSid: TWILIO_ACCOUNT_SID?.substring(0, 10) + '...',
      from: TWILIO_PHONE_NUMBER,
      to: candidate.phone_number
    });

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    
    const twilioParams = new URLSearchParams({
      To: candidate.phone_number,
      From: TWILIO_PHONE_NUMBER,
      Url: `${BASE_URL}/functions/v1/handle-twilio-call?callId=${call.id}`,
      StatusCallback: `${BASE_URL}/functions/v1/twilio-status`,
      StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'].join(' '),
      StatusCallbackMethod: 'POST',
      Record: 'true',
      RecordingStatusCallback: `${BASE_URL}/functions/v1/twilio-recording`,
    });

    console.log('Making Twilio API call...');
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioParams.toString(),
    });

    const twilioResponseText = await twilioResponse.text();
    
    if (!twilioResponse.ok) {
      console.error('Twilio API error:', {
        status: twilioResponse.status,
        response: twilioResponseText
      });
      throw new Error(`Twilio error: ${twilioResponseText}`);
    }

    const twilioCall = JSON.parse(twilioResponseText);
    console.log('Twilio call created:', twilioCall.sid);

    // Update call with Twilio SID
    await supabase
      .from('calls')
      .update({
        call_sid: twilioCall.sid,
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
      })
      .eq('id', call.id);

    console.log('Call initiated successfully:', {
      callId: call.id,
      candidateId,
      candidateName: candidate.full_name,
      phoneNumber: candidate.phone_number,
      twilioSid: twilioCall.sid,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callId: call.id,
        twilioSid: twilioCall.sid,
        candidateName: candidate.full_name,
        phoneNumber: candidate.phone_number
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error initiating call:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
