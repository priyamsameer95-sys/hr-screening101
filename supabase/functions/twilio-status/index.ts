import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    const callDuration = formData.get('CallDuration');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'initiated': 'SCHEDULED',
      'ringing': 'IN_PROGRESS',
      'in-progress': 'IN_PROGRESS',
      'answered': 'IN_PROGRESS',
      'completed': 'COMPLETED',
      'busy': 'BUSY',
      'no-answer': 'NO_ANSWER',
      'failed': 'FAILED',
      'canceled': 'FAILED',
    };

    const ourStatus = statusMap[callStatus?.toString().toLowerCase() || ''] || 'FAILED';

    // Update call record
    const updateData: any = {
      status: ourStatus,
    };

    if (callDuration) {
      updateData.duration_seconds = parseInt(callDuration.toString());
      updateData.ended_at = new Date().toISOString();
    }

    await supabase
      .from('calls')
      .update(updateData)
      .eq('call_sid', callSid);

    // If call completed, trigger analysis
    if (ourStatus === 'COMPLETED') {
      const { data: call } = await supabase
        .from('calls')
        .select('id')
        .eq('call_sid', callSid)
        .single();

      if (call) {
        // Trigger analysis function
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ callId: call.id }),
        });
      }
    }

    console.log('Twilio status update:', { callSid, callStatus, ourStatus });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling Twilio status:', error);
    return new Response('Error', { status: 500 });
  }
});
