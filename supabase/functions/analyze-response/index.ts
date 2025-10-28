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

    // Get call with all related data including questions
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
    const questions = campaign.question_template?.questions || [];

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

    console.log(`Analyzing ${transcripts.length} transcript segments for call ${callId}`);

    // Build comprehensive analysis prompt with questions
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const questionsList = questions
      .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      .map((q: any, idx: number) => `${idx + 1}. ${q.question_text}`)
      .join('\n');
    
    const aiPrompt = `You are an expert HR analyst. Analyze this recruitment screening call transcript and extract comprehensive structured information.

CANDIDATE INFORMATION:
- Name: ${candidate.full_name}
- Position Applied: ${candidate.position || campaign.position}
- Phone: ${candidate.phone_number}
- Email: ${candidate.email}
${candidate.current_company ? `- Current Company: ${candidate.current_company}` : ''}
${candidate.years_experience ? `- Years Experience: ${candidate.years_experience}` : ''}

QUESTIONS ASKED (in order):
${questionsList || 'Standard screening questions'}

FULL CONVERSATION TRANSCRIPT:
${transcript}

ANALYSIS TASKS:
1. Extract specific answers for each question asked
2. Identify key qualifications, skills, and experience mentioned
3. Assess candidate's communication quality and engagement
4. Detect any red flags or concerns
5. Provide an overall recommendation

Return a JSON object with these EXACT fields (use null for missing data):
{
  "notice_period": { "value": number, "unit": "days|weeks|months", "immediate": boolean },
  "current_ctc": { "amount": number, "currency": "INR" },
  "expected_ctc": { "amount": number, "currency": "INR" },
  "reason_for_change": "detailed reason for job change",
  "key_skills": ["skill1", "skill2", "skill3"],
  "technical_experience": "summary of technical background",
  "years_experience": number,
  "current_company": "company name",
  "current_role": "current job title",
  "availability": "availability for interviews/joining",
  "work_preference": "remote|hybrid|office|flexible",
  "engagement_score": number (1-10, assess responsiveness and enthusiasm),
  "communication_score": number (1-10, assess clarity and professionalism),
  "qualification_score": number (1-10, assess fit for role),
  "overall_score": number (1-10, overall assessment),
  "recommendation": "PROCEED|REVIEW|REJECT",
  "red_flags": ["flag1", "flag2"] or [],
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"] or [],
  "reasoning": "2-3 sentence explanation for recommendation",
  "next_steps": ["action1", "action2"],
  "question_responses": [
    {
      "question": "question text",
      "answer": "candidate's answer",
      "assessment": "your assessment of the answer"
    }
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown or explanation.`;

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
    
    // Parse the JSON from the AI response (remove markdown if present)
    let analysis;
    try {
      const cleanJson = analysisText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      throw new Error('Invalid AI response format');
    }

    console.log('AI Analysis complete:', {
      recommendation: analysis.recommendation,
      overallScore: analysis.overall_score,
      skillsCount: analysis.key_skills?.length || 0
    });

    // Calculate duration if not already set
    let durationSeconds = call.duration_seconds;
    if (!durationSeconds && call.started_at) {
      const startTime = new Date(call.started_at).getTime();
      const endTime = Date.now();
      durationSeconds = Math.floor((endTime - startTime) / 1000);
    }

    // Save comprehensive AI recommendation
    const recommendationData = {
      call_id: callId,
      recommendation: analysis.recommendation,
      overall_score: analysis.overall_score || 5,
      key_strengths: analysis.strengths || analysis.key_skills || [],
      concerns: analysis.concerns || analysis.red_flags || [],
      extracted_data: {
        notice_period: analysis.notice_period,
        current_ctc: analysis.current_ctc,
        expected_ctc: analysis.expected_ctc,
        skills: analysis.key_skills,
        experience: analysis.technical_experience,
        work_preference: analysis.work_preference,
        current_company: analysis.current_company,
        current_role: analysis.current_role,
      },
      summary: analysis.reasoning || 'Screening call completed and analyzed',
      engagement_score: analysis.engagement_score,
      communication_score: analysis.communication_score,
      qualification_score: analysis.qualification_score,
      next_steps: analysis.next_steps || [],
    };

    await supabase.from('ai_recommendations').insert(recommendationData);

    // Save individual question responses if provided
    if (analysis.question_responses && Array.isArray(analysis.question_responses)) {
      const structuredResponses = analysis.question_responses.map((qr: any, idx: number) => ({
        call_id: callId,
        question_id: questions[idx]?.id || null,
        question_text: qr.question,
        raw_response: qr.answer,
        extracted_value: { assessment: qr.assessment },
        confidence: 0.85,
      }));

      if (structuredResponses.length > 0) {
        await supabase.from('structured_responses').insert(structuredResponses);
      }
    }

    // Also save consolidated response with all extracted data
    await supabase.from('structured_responses').insert({
      call_id: callId,
      question_id: null,
      question_text: 'Comprehensive Interview Analysis',
      raw_response: transcript,
      extracted_value: analysis,
      confidence: 0.85,
    });

    // Update candidate status based on recommendation
    const candidateStatus = analysis.recommendation === 'PROCEED' 
      ? 'QUALIFIED'
      : analysis.recommendation === 'REJECT'
      ? 'REJECTED'
      : 'REVIEW';

    await supabase
      .from('candidates')
      .update({ status: candidateStatus })
      .eq('id', candidate.id);

    // Update call with final data
    await supabase
      .from('calls')
      .update({ 
        status: 'COMPLETED',
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
      })
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
