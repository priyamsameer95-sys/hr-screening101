# 🧪 TEST EXECUTION PLAN - Post-Fix Validation

## ✅ CRITICAL FIXES DEPLOYED

### 1. WebSocket URL Format - FIXED ✅
**Before:** `wss://kipvbsaroymehobtalsy.functions.supabase.co/elevenlabs-stream`  
**After:** `wss://kipvbsaroymehobtalsy.supabase.co/functions/v1/elevenlabs-stream`

**Files Modified:**
- `supabase/functions/handle-twilio-call/index.ts` (Line 46-52)
- `supabase/functions/elevenlabs-stream/index.ts` (Line 61-66)

### 2. Real-Time Call Monitoring - ADDED ✅
**New Component:** `src/components/calls/CallStatusMonitor.tsx`
**Features:**
- Live call status updates via Supabase Realtime
- Shows IN_PROGRESS calls with duration counter
- Displays FAILED calls with retry button
- Auto-refresh every 10 seconds
- Real-time database subscription

**Integration:** Added to Campaign Detail page "Calls & Monitoring" tab

### 3. Enhanced Logging - DEPLOYED ✅
**Edge Functions Updated:**
- `handle-twilio-call`: Added WebSocket URL logging
- `elevenlabs-stream`: Enhanced connection logging with timestamps

---

## 🧪 TEST EXECUTION SEQUENCE

### Phase 1: Smoke Tests (5 minutes)
**Objective:** Verify system is operational after deployment

#### Test 1.1: Edge Function Deployment
```bash
# Expected: All functions deployed successfully
✅ handle-twilio-call
✅ elevenlabs-stream  
✅ twilio-status
✅ initiate-call
✅ analyze-response
✅ cleanup-stale-calls
```

#### Test 1.2: Database Connectivity
```sql
-- Verify database is accessible
SELECT COUNT(*) FROM campaigns;
SELECT COUNT(*) FROM candidates;
SELECT COUNT(*) FROM calls;

-- Expected: Queries return without errors
```

#### Test 1.3: Frontend Loading
- Navigate to Campaign Detail page
- Verify "Calls & Monitoring" tab loads
- Confirm CallStatusMonitor component renders
- Expected: No console errors

**Success Criteria:** All components load without errors

---

### Phase 2: Integration Tests (15 minutes)
**Objective:** Test end-to-end call flow

#### Test 2.1: Call Initiation
**Steps:**
1. Navigate to Campaign Detail page (campaign: cd671952-0e64-4592-94fa-0c303ab31c2a)
2. Click on a candidate's "Call" button
3. Monitor edge function logs

**Expected Results:**
```
✅ initiate-call function triggered
✅ Call record created in database
✅ Twilio API called successfully
✅ Call status: SCHEDULED → IN_PROGRESS
```

**Validation Query:**
```sql
SELECT id, status, started_at, call_sid 
FROM calls 
ORDER BY created_at DESC 
LIMIT 1;
```

#### Test 2.2: WebSocket Connection
**Steps:**
1. Wait for Twilio to connect (5-10 seconds after call initiation)
2. Check elevenlabs-stream logs

**Expected Logs:**
```
✅ CRITICAL FIX DEPLOYED: Twilio WebSocket connected for call: [callId]
✅ Connection details: { callId, timestamp, readyState: 1 }
✅ Call details loaded: { candidate, campaign, questionsCount }
✅ Dynamic prompt created for agent
✅ Got signed URL, connecting to ElevenLabs...
✅ ElevenLabs WebSocket connected successfully
✅ Dynamic prompt sent to ElevenLabs agent
```

**Validation:**
- elevenlabs-stream logs should appear (previously: 0 logs)
- WebSocket connection established
- No "Not a WebSocket request" errors

#### Test 2.3: Audio Streaming
**Steps:**
1. Answer the test call on your phone
2. Listen for AI voice
3. Speak responses
4. Monitor logs for audio exchange

**Expected Logs:**
```
✅ EL audio out #1, preview: [base64]
✅ Flushing buffered audio chunks
✅ Media in count: [number]
✅ Transcript saved: [text]
```

**Validation Query:**
```sql
SELECT call_id, speaker, text, timestamp 
FROM transcripts 
WHERE call_id = '[current_call_id]' 
ORDER BY timestamp ASC;
```

**Expected:** At least 2+ transcript records (user + agent)

#### Test 2.4: Call Completion
**Steps:**
1. Complete the conversation
2. Hang up the call
3. Wait 30 seconds
4. Check twilio-status logs

**Expected Logs:**
```
✅ Received Twilio status webhook: [CallSid]
✅ Status: completed, Duration: [seconds]
✅ Call status updated to COMPLETED
✅ Triggering AI analysis for call: [callId]
✅ Analysis response: 200
```

**Validation Query:**
```sql
SELECT c.id, c.status, c.duration_seconds, c.ended_at,
       COUNT(t.id) as transcript_count
FROM calls c
LEFT JOIN transcripts t ON t.call_id = c.id
WHERE c.id = '[current_call_id]'
GROUP BY c.id;
```

**Expected:**
- status: COMPLETED
- duration_seconds: > 0
- ended_at: timestamp
- transcript_count: > 0

#### Test 2.5: AI Analysis
**Steps:**
1. Wait 30-60 seconds after call completion
2. Check analyze-response logs
3. Query AI recommendations

**Expected Logs:**
```
✅ Starting AI analysis for call: [callId]
✅ Call details retrieved
✅ Transcript retrieved: [word count] words
✅ Sending to AI API...
✅ AI analysis completed
✅ Saved [N] responses and 1 recommendation
```

**Validation Queries:**
```sql
-- Check AI Recommendation
SELECT call_id, recommendation, qualification_score, engagement_score
FROM ai_recommendations 
WHERE call_id = '[current_call_id]';

-- Check Structured Responses
SELECT question_text, extracted_value, confidence_score
FROM structured_responses 
WHERE call_id = '[current_call_id]';
```

**Expected:**
- 1 record in ai_recommendations
- Multiple records in structured_responses (one per question)

---

### Phase 3: UI/UX Tests (10 minutes)
**Objective:** Verify user-facing features work correctly

#### Test 3.1: Real-Time Status Updates
**Steps:**
1. Open Campaign Detail page
2. Navigate to "Calls & Monitoring" tab
3. Initiate a test call
4. Keep the page open

**Expected Behavior:**
- CallStatusMonitor appears with "Active Calls (1)"
- Call status shows "IN_PROGRESS" with animated phone icon
- Duration counter updates every second
- When call completes, status updates automatically to "COMPLETED"
- No page refresh required

#### Test 3.2: Failed Call Retry
**Steps:**
1. Identify a FAILED call in the UI
2. Click "Retry" button
3. Monitor call initiation

**Expected:**
- Toast notification: "Call Retry Initiated"
- New call record created
- Original failed call remains in database
- New call appears in active calls list

#### Test 3.3: Export Functionality
**Steps:**
1. Complete at least 1 successful call
2. Click "Export Results" button
3. Open downloaded CSV

**Expected:**
- CSV file downloads
- Contains candidate info, call details, AI scores, responses
- Data matches database records

---

### Phase 4: Error Handling Tests (10 minutes)
**Objective:** Verify system handles failures gracefully

#### Test 4.1: No Answer Scenario
**Steps:**
1. Initiate call to a phone that won't answer
2. Let it ring until Twilio gives up
3. Check twilio-status logs

**Expected:**
- Call status updates to NO_ANSWER
- Candidate status remains eligible for retry
- No errors in logs

#### Test 4.2: ElevenLabs API Failure
**Steps:**
1. Temporarily invalidate ELEVENLABS_API_KEY
2. Initiate a call
3. Check logs

**Expected:**
- elevenlabs-stream logs error: "Failed to get signed URL"
- Call marked as FAILED
- Error message saved in calls.error_message
- User sees failed call in UI with error details

#### Test 4.3: Stale Call Cleanup
**Steps:**
1. Identify calls stuck IN_PROGRESS for >30 minutes
2. Manually trigger cleanup-stale-calls function
3. Verify results

**Expected:**
- Stale calls marked as FAILED
- Error message: "Call timed out - exceeded 30 minute limit"
- Candidate status updated appropriately

---

### Phase 5: Scale Tests (15 minutes)
**Objective:** Verify system handles concurrent calls

#### Test 5.1: Concurrent Call Initiation
**Steps:**
1. Initiate 5 calls simultaneously
2. Monitor edge function logs
3. Check database state

**Expected:**
- All 5 calls created successfully
- No deadlocks or race conditions
- Each call has unique call_sid
- All WebSocket connections establish

**Validation Query:**
```sql
SELECT status, COUNT(*) 
FROM calls 
WHERE created_at > NOW() - INTERVAL '5 minutes'
GROUP BY status;
```

#### Test 5.2: Database Load
**Steps:**
1. Run multiple concurrent operations:
   - Initiate calls
   - Stream transcripts
   - Run AI analysis
2. Monitor database performance

**Expected:**
- Query response time < 100ms
- No connection pool exhaustion
- No deadlocks or timeout errors

---

## 📊 SUCCESS CRITERIA

### Critical Metrics (Must Pass)
- ✅ WebSocket connection success rate: 100%
- ✅ Call completion rate: >80%
- ✅ Transcript capture rate: 100% (for completed calls)
- ✅ AI analysis success rate: 100% (for completed calls)
- ✅ elevenlabs-stream logs present: Yes
- ✅ twilio-status logs present: Yes

### Performance Metrics (Should Pass)
- ⚡ Call initiation time: <3 seconds
- ⚡ WebSocket connection time: <5 seconds
- ⚡ AI analysis completion: <60 seconds
- ⚡ UI update latency: <2 seconds

### Quality Metrics (Nice to Have)
- 📈 User experience rating: Positive
- 📈 Error message clarity: Clear & actionable
- 📈 Log verbosity: Sufficient for debugging

---

## 🚨 ROLLBACK PLAN

### If Critical Tests Fail:
1. **Immediate Actions:**
   - Document exact failure point
   - Capture logs and error messages
   - Check Supabase status page

2. **Investigation:**
   - Review edge function logs
   - Check database queries
   - Verify environment variables
   - Test WebSocket URL format manually

3. **Escalation Path:**
   - If WebSocket still fails → Check Supabase WebSocket support
   - If Twilio webhooks fail → Verify webhook configuration
   - If database errors → Check RLS policies

### Rollback Command:
```bash
# Revert to previous version (if needed)
git revert HEAD
# Redeploy
```

---

## 📋 TEST EXECUTION LOG

### Test Run Information
**Date:** 2025-10-28  
**Tester:** [Your Name]  
**Environment:** Production  
**Campaign ID:** cd671952-0e64-4592-94fa-0c303ab31c2a

### Phase 1: Smoke Tests
- [ ] Test 1.1: Edge Function Deployment
- [ ] Test 1.2: Database Connectivity
- [ ] Test 1.3: Frontend Loading

### Phase 2: Integration Tests
- [ ] Test 2.1: Call Initiation
- [ ] Test 2.2: WebSocket Connection
- [ ] Test 2.3: Audio Streaming
- [ ] Test 2.4: Call Completion
- [ ] Test 2.5: AI Analysis

### Phase 3: UI/UX Tests
- [ ] Test 3.1: Real-Time Status Updates
- [ ] Test 3.2: Failed Call Retry
- [ ] Test 3.3: Export Functionality

### Phase 4: Error Handling Tests
- [ ] Test 4.1: No Answer Scenario
- [ ] Test 4.2: ElevenLabs API Failure
- [ ] Test 4.3: Stale Call Cleanup

### Phase 5: Scale Tests
- [ ] Test 5.1: Concurrent Call Initiation
- [ ] Test 5.2: Database Load

---

## 📞 NEXT STEPS

### User Action Required:
1. **Configure Twilio Webhooks** (Critical)
   - Voice URL: `https://kipvbsaroymehobtalsy.supabase.co/functions/v1/handle-twilio-call?callId={callId}`
   - Status Callback URL: `https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status`
   - Status Callback Events: `initiated, ringing, answered, completed, busy, no-answer, failed`

2. **Run Test Call**
   - Use the test number from campaign
   - Monitor logs in real-time
   - Verify complete flow works

3. **Review Results**
   - Check all database tables have data
   - Verify export functionality
   - Confirm UI updates in real-time

### Validation Complete When:
- ✅ Test call completes successfully
- ✅ Transcripts saved in database
- ✅ AI analysis completes
- ✅ Export contains correct data
- ✅ All edge functions show logs
- ✅ No errors in console

**Status:** READY FOR USER TESTING 🚀
