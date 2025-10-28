# 🚀 Critical Fixes Deployment Guide

## ✅ Issues Fixed

### 1. **ElevenLabs Stream Function - Enhanced Logging**
- Added comprehensive logging at function entry
- Better credential validation logging
- WebSocket connection tracking

### 2. **Twilio Status Webhook - Enhanced Logging**
- Added request logging for debugging
- Better error tracking
- Proper webhook payload logging

### 3. **Stale Call Cleanup - NEW Function**
- Automatically closes calls stuck in IN_PROGRESS > 30 minutes
- Updates candidate statuses
- Provides detailed cleanup reports

### 4. **Initiate Call - Enhanced Webhook Logging**
- Shows webhook URLs being configured
- Validates webhook accessibility
- Better error reporting

---

## 🔧 Required Configuration

### Twilio Webhook Configuration

You **MUST** configure these webhooks in your Twilio console for the system to work properly:

1. Go to: [Twilio Console](https://console.twilio.com/) → Phone Numbers → Active Numbers → [Your Number]

2. Configure these URLs:

#### **Voice Configuration**
```
A CALL COMES IN: Webhook
URL: https://kipvbsaroymehobtalsy.supabase.co/functions/v1/handle-twilio-call
HTTP: POST
```

#### **Status Callback URL**
```
Status Callback URL: https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status
Events: Select ALL:
  ☑ Initiated
  ☑ Ringing  
  ☑ Answered
  ☑ Completed
  ☑ Busy
  ☑ No Answer
  ☑ Failed
```

3. **Save Configuration**

---

## 🧪 Testing the Fixes

### Test 1: Verify ElevenLabs Stream Logs
```bash
# After initiating a call, check logs:
# Backend → Functions → elevenlabs-stream → Logs

Expected logs:
✅ "🚀 ElevenLabs stream function started"
✅ "📞 Incoming request: { method: 'GET', url: '...' }"
✅ "🔑 ElevenLabs credentials check"
✅ "✓ Twilio WebSocket connected"
```

### Test 2: Verify Twilio Status Webhook
```bash
# After call completes, check logs:
# Backend → Functions → twilio-status → Logs

Expected logs:
✅ "📞 Twilio status webhook function initialized"
✅ "📥 Webhook received: { method: 'POST' }"
✅ "📞 Twilio status webhook: { twilioStatus: 'completed', mappedStatus: 'COMPLETED' }"
```

### Test 3: Test Cleanup Function
```bash
# Manually trigger cleanup:
curl -X POST https://kipvbsaroymehobtalsy.supabase.co/functions/v1/cleanup-stale-calls

Expected response:
{
  "message": "Cleanup completed successfully",
  "count": 6,
  "callIds": ["...", "..."]
}
```

---

## 📊 Monitoring Dashboard

### Key Metrics to Track
1. **Call Completion Rate**: COMPLETED / TOTAL_CALLS
2. **Stale Call Rate**: FAILED (timeout) / TOTAL_CALLS  
3. **Webhook Success Rate**: Status updates received / Calls initiated
4. **Audio Stream Success**: WebSocket connections / Call starts

---

## 🔁 Automated Cleanup (Recommended)

### Option 1: Cron Job via GitHub Actions
Create `.github/workflows/cleanup-stale-calls.yml`:
```yaml
name: Cleanup Stale Calls
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Cleanup
        run: |
          curl -X POST https://kipvbsaroymehobtalsy.supabase.co/functions/v1/cleanup-stale-calls
```

### Option 2: Supabase Cron Extension (Recommended)
```sql
-- Run this in your Supabase SQL Editor
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every 30 minutes
SELECT cron.schedule(
  'cleanup-stale-calls',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kipvbsaroymehobtalsy.supabase.co/functions/v1/cleanup-stale-calls',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

---

## 🐛 Debugging Tips

### If ElevenLabs Stream Still Silent
1. Check ElevenLabs agent configuration:
   - Voice settings correct?
   - Language matches campaign setting?
   - Agent is public OR signed URL is being used

2. Verify WebSocket connection:
   ```bash
   # Check edge function logs for:
   "✓ Twilio WebSocket connected"
   "✓ ElevenLabs WebSocket connected successfully"
   "✓ Dynamic prompt sent to ElevenLabs agent"
   ```

3. Check audio flow:
   ```bash
   # Look for these in logs:
   "Twilio media in: X chunks received"
   "EL audio out #X, preview: ..."
   ```

### If Webhooks Not Working
1. Verify Twilio configuration (see above)
2. Test webhook manually:
   ```bash
   curl -X POST https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "CallSid=CAxxxx&CallStatus=completed&CallDuration=60"
   ```
3. Check Twilio webhook logs in Twilio Console → Monitor → Logs → Webhooks

### If Cleanup Fails
1. Check function logs for errors
2. Verify service role key has proper permissions
3. Run manual SQL query to see stale calls:
   ```sql
   SELECT id, call_sid, status, started_at, 
          NOW() - started_at as duration
   FROM calls 
   WHERE status = 'IN_PROGRESS' 
     AND started_at < NOW() - INTERVAL '30 minutes';
   ```

---

## 📈 Success Metrics

After deployment, you should see:
- ✅ 0 calls stuck in IN_PROGRESS > 30 minutes
- ✅ Webhook logs appearing in twilio-status function
- ✅ Call status updating to COMPLETED/FAILED
- ✅ AI analysis triggering after completed calls
- ✅ ElevenLabs audio streaming successfully

---

## 🆘 Support

If issues persist:
1. Check all edge function logs in Backend UI
2. Review Twilio webhook logs
3. Verify all environment variables are set
4. Test each component individually using the test commands above

---

**Last Updated**: 2025-10-28  
**Version**: 1.0.0
