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
    
    const aiPrompt = `You are an expert HR analyst. Analyze this recruitment screening call transcript.

CANDIDATE: ${candidate.full_name}
POSITION: ${candidate.position || campaign.position}
PHONE: ${candidate.phone_number}
EMAIL: ${candidate.email}

QUESTIONS ASKED:
${questionsList || 'Standard screening questions'}

CONVERSATION TRANSCRIPT:
${transcript}

Analyze communication quality, extract key information (notice period, salary expectations, skills, experience), identify strengths and red flags, and provide hiring recommendation.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert HR analyst providing structured call analysis.' },
          { role: 'user', content: aiPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_call_analysis",
            description: "Save structured analysis of recruitment screening call",
            parameters: {
              type: "object",
              properties: {
                notice_period: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string", enum: ["days", "weeks", "months"] },
                    immediate: { type: "boolean" }
                  }
                },
                current_ctc: {
                  type: "object",
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "string" }
                  }
                },
                expected_ctc: {
                  type: "object",
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "string" }
                  }
                },
                reason_for_change: { type: "string" },
                key_skills: { type: "array", items: { type: "string" } },
                technical_experience: { type: "string" },
                years_experience: { type: "number" },
                current_company: { type: "string" },
                current_role: { type: "string" },
                work_preference: { type: "string" },
                engagement_score: { type: "integer", minimum: 1, maximum: 10 },
                qualification_score: { type: "integer", minimum: 1, maximum: 10 },
                overall_score: { type: "integer", minimum: 1, maximum: 10 },
                recommendation: { type: "string", enum: ["PROCEED", "REVIEW", "REJECT"] },
                red_flags: { type: "array", items: { type: "string" } },
                strengths: { type: "array", items: { type: "string" } },
                concerns: { type: "array", items: { type: "string" } },
                reasoning: { type: "string" },
                next_steps: { type: "array", items: { type: "string" } },
                question_responses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                      assessment: { type: "string" },
                      red_flags: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              },
              required: ["recommendation", "reasoning", "engagement_score", "qualification_score", "overall_score"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "save_call_analysis" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      if (aiResponse.status === 429) {
        console.error('Rate limit exceeded');
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 402) {
        console.error('Payment required');
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      console.error('AI analysis failed:', errorText);
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response structure:', JSON.stringify(aiData, null, 2));
    
    // Extract structured data from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No tool call in response:', aiData);
      throw new Error('AI did not return structured analysis');
    }

    const analysis = typeof toolCall.function.arguments === 'string' 
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

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
