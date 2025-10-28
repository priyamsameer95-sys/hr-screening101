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
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaignId');

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all candidates with their call data and AI recommendations
    const { data: candidates } = await supabase
      .from('candidates')
      .select(`
        *,
        calls!inner(
          id,
          status,
          duration_seconds,
          started_at,
          ended_at,
          ai_recommendations(
            recommendation,
            overall_score,
            extracted_data,
            engagement_score,
            communication_score,
            qualification_score,
            key_strengths,
            concerns,
            next_steps
          )
        )
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No candidates found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format data for Excel export (CSV format)
    const csvRows = [
      // Header row
      [
        'Name',
        'Phone',
        'Email',
        'Position',
        'Call Status',
        'Call Duration (sec)',
        'Overall Score',
        'Recommendation',
        'Notice Period',
        'Current CTC',
        'Expected CTC',
        'Key Skills',
        'Engagement Score',
        'Communication Score',
        'Qualification Score',
        'Strengths',
        'Concerns',
        'Next Steps'
      ].join(',')
    ];

    // Data rows
    for (const candidate of candidates) {
      const call = candidate.calls?.[0];
      const ai = call?.ai_recommendations?.[0];
      const extracted = ai?.extracted_data || {};

      const noticePeriod = extracted.notice_period 
        ? `${extracted.notice_period.value} ${extracted.notice_period.unit}`
        : 'N/A';
      
      const currentCtc = extracted.current_ctc?.amount 
        ? `${extracted.current_ctc.currency} ${extracted.current_ctc.amount}`
        : 'N/A';
      
      const expectedCtc = extracted.expected_ctc?.amount 
        ? `${extracted.expected_ctc.currency} ${extracted.expected_ctc.amount}`
        : 'N/A';

      const skills = extracted.skills?.join('; ') || 'N/A';
      const strengths = ai?.key_strengths?.join('; ') || 'N/A';
      const concerns = ai?.concerns?.join('; ') || 'N/A';
      const nextSteps = ai?.next_steps?.join('; ') || 'N/A';

      csvRows.push([
        candidate.full_name,
        candidate.phone_number,
        candidate.email,
        candidate.position,
        call?.status || 'PENDING',
        call?.duration_seconds || '0',
        ai?.overall_score || 'N/A',
        ai?.recommendation || 'N/A',
        noticePeriod,
        currentCtc,
        expectedCtc,
        skills,
        ai?.engagement_score || 'N/A',
        ai?.communication_score || 'N/A',
        ai?.qualification_score || 'N/A',
        strengths,
        concerns,
        nextSteps
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
    }

    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="campaign_${campaignId}_results.csv"`
      }
    });

  } catch (error) {
    console.error('Error exporting results:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
