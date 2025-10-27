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

    // Get call and candidate details
    const { data: call } = await supabase
      .from('calls')
      .select(`
        *,
        candidate:candidates(
          *,
          campaign:campaigns(*)
        )
      `)
      .eq('id', callId)
      .single();

    if (!call) {
      throw new Error('Call not found');
    }

    const candidate = call.candidate;

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
    const transcript = transcripts.map(t => 
      `${t.speaker}: ${t.text}`
    ).join('\n');

    // Analyze with Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiPrompt = `Analyze this recruitment screening call and extract structured information:

Candidate: ${candidate.full_name}
Position: ${candidate.position}
Current Company: ${candidate.current_company || 'N/A'}
Experience: ${candidate.years_experience || 'N/A'} years

TRANSCRIPT:
${transcript}

Extract and return a JSON object with these exact fields:
{
  "notice_period": "number of days or months",
  "current_ctc": "current salary",
  "expected_ctc": "expected salary", 
  "reason_for_change": "brief reason",
  "key_skills": ["skill1", "skill2"],
  "years_experience": number,
  "current_company": "company name",
  "availability": "availability info",
  "engagement_score": number (1-10),
  "qualification_score": number (1-10),
  "recommendation": "PROCEED|REJECT|MAYBE",
  "red_flags": ["flag1", "flag2"] or [],
  "reasoning": "brief explanation"
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert HR analyst. Extract structured information from call transcripts and return valid JSON only.' },
          { role: 'user', content: aiPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI analysis failed:', errorText);
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    
    // Parse the JSON from the AI response
    const analysis = JSON.parse(analysisText.replace(/```json\n?|\n?```/g, ''));

    // Save AI recommendation
    await supabase.from('ai_recommendations').insert({
      call_id: callId,
      recommendation: analysis.recommendation,
      reasoning: analysis.reasoning || 'See full transcript',
      engagement_score: analysis.engagement_score,
      qualification_score: analysis.qualification_score,
      red_flags: analysis.red_flags || [],
      strengths: analysis.key_skills || [],
      suggested_next_steps: analysis.recommendation === 'PROCEED' 
        ? ['Schedule technical interview', 'Send assessment link']
        : analysis.recommendation === 'MAYBE'
        ? ['Review transcript in detail', 'Consult with hiring manager']
        : ['Send rejection email', 'Add to talent pool for future roles'],
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
      raw_response: transcript,
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
