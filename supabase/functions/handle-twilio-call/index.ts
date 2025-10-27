import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get call details with candidate and campaign info
    const { data: call } = await supabase
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

    if (!call) {
      throw new Error('Call not found');
    }

    const candidate = call.candidate;
    const campaign = candidate.campaign;
    const questions = campaign.question_template.questions.sort(
      (a: any, b: any) => a.sequence_order - b.sequence_order
    );

    // Generate TwiML to connect to ElevenLabs via WebSocket
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const BASE_URL = Deno.env.get('SUPABASE_URL')?.replace('https://', 'wss://');

    // Generate conversation prompt
    const systemPrompt = `You are Kajal, a professional HR representative from CashKaro conducting a screening interview with ${candidate.full_name} for the ${campaign.position} role.

INTERVIEW QUESTIONS (ask in order):
${questions.map((q: any, i: number) => `${i + 1}. ${q.question_text}`).join('\n')}

GUIDELINES:
- Be professional, friendly, and clear
- Ask one question at a time
- Listen carefully and acknowledge responses
- If response is unclear, ask for clarification once
- Keep the interview focused and efficient
- After all questions, thank the candidate and explain next steps`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${BASE_URL}/functions/v1/elevenlabs-stream?callId=${callId}&apiKey=${ELEVENLABS_API_KEY}&candidateName=${encodeURIComponent(candidate.full_name)}&position=${encodeURIComponent(campaign.position)}">
      <Parameter name="systemPrompt" value="${encodeURIComponent(systemPrompt)}" />
    </Stream>
  </Connect>
</Response>`;

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
