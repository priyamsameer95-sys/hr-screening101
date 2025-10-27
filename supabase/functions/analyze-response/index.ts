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

    const { callId } = await req.json();

    // Get full transcript
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('*')
      .eq('call_id', callId)
      .order('sequence_number');

    if (!transcripts || transcripts.length === 0) {
      throw new Error('No transcripts found');
    }

    // Combine transcripts into conversation
    const conversation = transcripts.map(t => 
      `${t.speaker}: ${t.text}`
    ).join('\n');

    // Use OpenAI to extract structured data
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    
    const analysisPrompt = `Analyze this HR screening call transcript and extract structured information:

${conversation}

Extract the following information:
1. Notice Period (days/months)
2. Current CTC (salary)
3. Expected CTC (salary)
4. Reason for job change
5. Key skills mentioned
6. Years of experience
7. Current company
8. Availability for interviews
9. Any red flags or concerns
10. Overall engagement score (1-10)
11. Qualification score (1-10)
12. Recommendation (PROCEED/REJECT/MAYBE)

Return as JSON with these exact fields.`;

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an AI assistant that analyzes HR screening calls.' },
          { role: 'user', content: analysisPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    const aiResponse = await response.json();
    const analysis = JSON.parse(aiResponse.choices[0].message.content);

    // Save AI recommendation
    await supabase.from('ai_recommendations').insert({
      call_id: callId,
      recommendation: analysis.recommendation,
      reasoning: analysis.reason_for_change || 'See full transcript',
      engagement_score: analysis.engagement_score,
      qualification_score: analysis.qualification_score,
      red_flags: analysis.red_flags || [],
      strengths: analysis.key_skills || [],
      suggested_next_steps: analysis.recommendation === 'PROCEED' 
        ? 'Schedule technical interview within 1 week'
        : 'Review transcript and reconsider',
    });

    // Save structured responses
    const responseData = {
      notice_period: analysis.notice_period,
      current_ctc: analysis.current_ctc,
      expected_ctc: analysis.expected_ctc,
      reason_for_change: analysis.reason_for_change,
      key_skills: analysis.key_skills,
      years_experience: analysis.years_experience,
      current_company: analysis.current_company,
      availability: analysis.availability,
    };

    await supabase.from('structured_responses').insert({
      call_id: callId,
      question_id: null,
      question_text: 'Full Interview Analysis',
      raw_response: conversation,
      extracted_value: responseData,
      confidence_score: 0.85,
      red_flags: analysis.red_flags || [],
    });

    // Update call status
    await supabase
      .from('calls')
      .update({ status: 'COMPLETED' })
      .eq('id', callId);

    console.log('Analysis completed for call:', callId);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing response:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
