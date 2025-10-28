# Testing the Complete Webhook Flow

## Quick Test Checklist

### ✅ Step 1: Verify Environment Variables
Check that all required secrets are configured in Supabase:

```bash
# Required secrets (already configured):
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN  
- TWILIO_PHONE_NUMBER
- ELEVENLABS_API_KEY
- ELEVENLABS_AGENT_ID
- LOVABLE_API_KEY (auto-configured)
```

### ✅ Step 2: Test Call Initiation

1. Go to your campaign detail page
2. Click "Initiate Test Call" button
3. Expected outcome:
   - Toast notification: "Call initiated successfully"
   - Your phone should ring within 5-10 seconds
   - Database should show new call record with status "IN_PROGRESS"

**Verify in Database:**
```sql
-- Check latest call
SELECT id, candidate_id, status, call_sid, started_at
FROM calls
ORDER BY created_at DESC
LIMIT 1;

-- Should show:
-- status: IN_PROGRESS or COMPLETED
-- call_sid: CAxxxxxxxxxxxx (Twilio ID)
-- started_at: timestamp
```

### ✅ Step 3: Test Conversation Flow

1. Answer the phone call
2. You should hear: "Hi [Your Name], I'm calling from CashKaro about the [Position] position you applied for. Is this a good time for a quick 2-minute chat?"
3. Respond with "Yes"
4. The AI should ask the campaign questions in sequence
5. Answer each question naturally

**Verify Transcripts Being Saved:**
```sql
-- Check transcripts during call
SELECT speaker, text, confidence, timestamp
FROM transcripts
WHERE call_id = '[your-call-id]'
ORDER BY sequence_number;

-- Should show alternating:
-- AGENT: "Hi Kartik, I'm calling..."
-- CANDIDATE: "Yes, this is a good time"
-- AGENT: "Great! Could you tell me..."
-- CANDIDATE: "I have 6 years experience..."
```

### ✅ Step 4: Test Webhook Status Updates

After hanging up, check webhook logs:

```sql
-- Check call status updates
SELECT status, duration_seconds, ended_at
FROM calls
WHERE id = '[your-call-id]';

-- Should show:
-- status: COMPLETED (or NO_ANSWER/FAILED)
-- duration_seconds: actual call length
-- ended_at: timestamp when call ended
```

**Check Edge Function Logs:**
```bash
# In Lovable, check logs for:
# - twilio-status function
# - Should show: "Call status update: completed"
# - Should show: "Triggering analysis for completed call"
```

### ✅ Step 5: Test AI Analysis

Wait 10-20 seconds after call ends for analysis to complete.

**Verify AI Analysis Completed:**
```sql
-- Check AI recommendations
SELECT 
  recommendation,
  overall_score,
  engagement_score,
  communication_score,
  qualification_score,
  extracted_data->>'notice_period' as notice_period,
  extracted_data->>'current_ctc' as current_ctc,
  extracted_data->>'expected_ctc' as expected_ctc,
  extracted_data->'skills' as skills,
  key_strengths,
  concerns
FROM ai_recommendations
WHERE call_id = '[your-call-id]';

-- Should show:
-- recommendation: PROCEED/REVIEW/REJECT
-- overall_score: 1-10
-- All scores populated
-- Extracted data from your responses
```

**Check Structured Responses:**
```sql
-- Check individual question responses
SELECT 
  question_text,
  raw_response,
  extracted_value,
  confidence_score
FROM structured_responses
WHERE call_id = '[your-call-id]'
ORDER BY created_at;

-- Should show one row per question with:
-- - Your actual spoken response
-- - Extracted structured data
-- - Confidence score
```

### ✅ Step 6: Test Excel Export

1. Go to campaign detail page
2. Click "Export Results" button
3. Expected outcome:
   - CSV file downloads automatically
   - Filename: `campaign_[campaign-name]_results.csv`

**Verify CSV Contents:**
Open the CSV file and check it includes:

| Column | Expected Data |
|--------|---------------|
| Name | Your full name |
| Phone | Your phone number |
| Email | Your email |
| Position | Position you applied for |
| Call Status | COMPLETED |
| Call Duration | Actual seconds (e.g., "65") |
| Overall Score | 1-10 score |
| Recommendation | PROCEED/REVIEW/REJECT |
| Notice Period | Extracted from your answer |
| Current CTC | Extracted salary (if mentioned) |
| Expected CTC | Extracted salary (if mentioned) |
| Key Skills | List of skills you mentioned |
| Engagement Score | 1-10 |
| Communication Score | 1-10 |
| Qualification Score | 1-10 |
| Strengths | List of identified strengths |
| Concerns | List of concerns (if any) |
| Next Steps | Recommended next steps |

## Troubleshooting Common Issues

### Issue: Call doesn't connect
**Check:**
1. Verify phone number format: Must include country code (e.g., +919058010369)
2. Check Twilio account balance
3. Verify Twilio credentials are correct
4. Check edge function logs for `initiate-call`

**Fix:**
```sql
-- Update phone number format if needed
UPDATE candidates
SET phone_number = '+919058010369'  -- Add country code
WHERE phone_number = '9058010369';
```

### Issue: Webhook not triggering
**Check:**
1. Edge function logs for `twilio-status`
2. Twilio console → Call logs → Status callbacks

**Verify webhook URL:**
```
https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status
```

### Issue: AI not speaking correctly
**Check:**
1. Edge function logs for `elevenlabs-stream`
2. Verify ELEVENLABS_AGENT_ID is correct
3. Check ELEVENLABS_API_KEY is valid

**Test ElevenLabs connection:**
```bash
curl -X GET \
  "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}"

# Should return: {"signed_url": "wss://..."}
```

### Issue: Analysis not running
**Check:**
1. Edge function logs for `analyze-response`
2. Verify LOVABLE_API_KEY exists
3. Check if transcripts exist

**Manual trigger analysis:**
```bash
curl -X POST \
  "https://kipvbsaroymehobtalsy.supabase.co/functions/v1/analyze-response" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"callId": "your-call-id"}'
```

### Issue: Export fails or empty
**Check:**
1. Verify calls have status "COMPLETED"
2. Check ai_recommendations table has data
3. Verify user authentication token

**Test export URL:**
```
https://kipvbsaroymehobtalsy.supabase.co/functions/v1/export-results?campaignId=your-campaign-id
```

## Complete Flow Verification Script

Run this after a test call to verify everything worked:

```sql
-- 1. Check call was created and completed
SELECT 
  c.id,
  c.status,
  c.duration_seconds,
  c.call_sid,
  c.started_at,
  c.ended_at,
  cand.full_name as candidate_name
FROM calls c
JOIN candidates cand ON cand.id = c.candidate_id
WHERE c.created_at > NOW() - INTERVAL '1 hour'
ORDER BY c.created_at DESC
LIMIT 1;

-- 2. Check transcripts were saved
SELECT COUNT(*) as transcript_count,
       COUNT(CASE WHEN speaker = 'AGENT' THEN 1 END) as agent_messages,
       COUNT(CASE WHEN speaker = 'CANDIDATE' THEN 1 END) as candidate_messages
FROM transcripts
WHERE call_id = (
  SELECT id FROM calls 
  ORDER BY created_at DESC LIMIT 1
);

-- 3. Check AI analysis exists
SELECT 
  recommendation,
  overall_score,
  JSONB_PRETTY(extracted_data) as extracted_data,
  key_strengths,
  concerns
FROM ai_recommendations
WHERE call_id = (
  SELECT id FROM calls 
  ORDER BY created_at DESC LIMIT 1
);

-- 4. Check structured responses
SELECT 
  question_text,
  LEFT(raw_response, 100) as response_preview,
  extracted_value
FROM structured_responses
WHERE call_id = (
  SELECT id FROM calls 
  ORDER BY created_at DESC LIMIT 1
);
```

## Expected Results After Successful Test

✅ **Call Record:** Status = COMPLETED, Duration > 0
✅ **Transcripts:** Multiple rows with AGENT and CANDIDATE speakers
✅ **AI Recommendations:** Row with scores and extracted data
✅ **Structured Responses:** One row per question answered
✅ **CSV Export:** Downloads with all data populated

## Performance Benchmarks

- Call connection: < 10 seconds
- Conversation latency: < 1 second per response
- Transcript saving: Real-time (during call)
- Analysis completion: 10-20 seconds after call ends
- Export generation: < 3 seconds for 100 candidates

## Next Steps After Successful Test

1. ✅ Test with multiple candidates
2. ✅ Test retry logic (no answer scenario)
3. ✅ Test campaign pause/resume
4. ✅ Export with larger datasets
5. ✅ Test concurrent calls (if applicable)

## Support

If issues persist after following this guide:
1. Check all edge function logs in order of execution
2. Verify database RLS policies allow required operations
3. Ensure all secrets are correctly configured
4. Review network logs in browser dev tools
5. Contact support with specific error messages and call IDs
