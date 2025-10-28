import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log('🧹 Cleanup stale calls function initialized');

serve(async (req) => {
  try {
    console.log('Starting cleanup of stale calls...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find calls that have been IN_PROGRESS for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: staleCalls, error: fetchError } = await supabase
      .from('calls')
      .select('id, call_sid, candidate_id, started_at')
      .eq('status', 'IN_PROGRESS')
      .lt('started_at', thirtyMinutesAgo);

    if (fetchError) {
      console.error('Error fetching stale calls:', fetchError);
      throw fetchError;
    }

    if (!staleCalls || staleCalls.length === 0) {
      console.log('✅ No stale calls found');
      return new Response(
        JSON.stringify({ message: 'No stale calls found', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${staleCalls.length} stale calls to clean up`);

    // Update stale calls to FAILED status
    const { error: updateError } = await supabase
      .from('calls')
      .update({
        status: 'FAILED',
        ended_at: new Date().toISOString(),
        error_message: 'Call timed out - exceeded 30 minute limit'
      })
      .in('id', staleCalls.map(c => c.id));

    if (updateError) {
      console.error('Error updating stale calls:', updateError);
      throw updateError;
    }

    // Update candidate statuses
    const uniqueCandidateIds = [...new Set(staleCalls.map(c => c.candidate_id))];
    await supabase
      .from('candidates')
      .update({ status: 'FAILED' })
      .in('id', uniqueCandidateIds);

    console.log(`✅ Cleaned up ${staleCalls.length} stale calls`);

    return new Response(
      JSON.stringify({ 
        message: 'Cleanup completed successfully', 
        count: staleCalls.length,
        callIds: staleCalls.map(c => c.id)
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        stack: errorStack 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});