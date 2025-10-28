# Complete Webhook & Data Extraction Flow

## Overview
This document explains how call data flows from Twilio → ElevenLabs → Database → Excel Export.

## Flow Diagram

```
┌─────────────────┐
│  Initiate Call  │
│   (Frontend)    │
└────────┬────────┘
         │
         v
┌─────────────────────────────────┐
│  initiate-call                   │
│  - Creates call record in DB     │
│  - Initiates Twilio call         │
│  - Sets status: SCHEDULED        │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  Twilio connects call            │
│  - Candidate answers phone       │
│  - Twilio requests TwiML         │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  handle-twilio-call              │
│  - Returns TwiML with WebSocket  │
│  - URL: elevenlabs-stream        │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  elevenlabs-stream (WebSocket)   │
│  - Connects to ElevenLabs AI     │
│  - Sends dynamic prompt with:    │
│    • Candidate name              │
│    • Company name (CashKaro)     │
│    • Position applied for        │
│    • Campaign questions          │
│  - Intro: "Hi {{name}}, I'm     │
│    calling from {{company}}      │
│    about {{position}}..."        │
│  - Streams conversation          │
│  - Saves transcripts to DB       │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  Call in progress...             │
│  - AI asks questions             │
│  - Candidate responds            │
│  - Transcripts saved real-time   │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  Call ends                       │
│  - Twilio sends status webhook   │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  twilio-status (Webhook)         │
│  - Updates call status           │
│  - Records duration              │
│  - Sets ended_at timestamp       │
│  - Triggers analyze-response     │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  analyze-response                │
│  - Fetches all transcripts       │
│  - Sends to Lovable AI (Gemini)  │
│  - Extracts structured data:     │
│    • Notice period               │
│    • Current CTC                 │
│    • Expected CTC                │
│    • Key skills                  │
│    • Scores (1-10):              │
│      - Engagement                │
│      - Communication             │
│      - Qualification             │
│      - Overall                   │
│    • Recommendation:             │
│      - PROCEED / REVIEW / REJECT │
│    • Strengths & concerns        │
│  - Saves to ai_recommendations   │
│  - Saves to structured_responses │
│  - Updates candidate status      │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  Data ready in database          │
│  ✓ Transcripts saved             │
│  ✓ AI analysis complete          │
│  ✓ Structured data extracted     │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│  export-results (Frontend)       │
│  - User clicks Export button     │
│  - Fetches all candidates        │
│  - Joins with calls & AI data    │
│  - Generates CSV with:           │
│    • Candidate info              │
│    • Call status & duration      │
│    • All extracted data          │
│    • Scores & recommendation     │
│  - Downloads as CSV file         │
└─────────────────────────────────┘
```

## Data Extraction Format

### Excel/CSV Columns
| Column | Source | Example |
|--------|--------|---------|
| Name | candidates.full_name | "Kartik" |
| Phone | candidates.phone_number | "+919058010369" |
| Email | candidates.email | "kartik@example.com" |
| Position | candidates.position | "Product Manager" |
| Call Status | calls.status | "COMPLETED" |
| Call Duration | calls.duration_seconds | "65" |
| Overall Score | ai_recommendations.overall_score | "8" |
| Recommendation | ai_recommendations.recommendation | "PROCEED" |
| Notice Period | extracted_data.notice_period | "30 days" |
| Current CTC | extracted_data.current_ctc | "INR 1500000" |
| Expected CTC | extracted_data.expected_ctc | "INR 2000000" |
| Key Skills | extracted_data.skills | "React; Node.js; AWS" |
| Engagement Score | ai_recommendations.engagement_score | "9" |
| Communication Score | ai_recommendations.communication_score | "8" |
| Qualification Score | ai_recommendations.qualification_score | "7" |
| Strengths | ai_recommendations.key_strengths | "Strong technical skills; Good communication" |
| Concerns | ai_recommendations.concerns | "Notice period slightly long" |
| Next Steps | ai_recommendations.next_steps | "Schedule technical round" |

## Webhook Configuration

### Twilio Webhooks (Configure in Twilio Console)

**Status Callback URL:**
```
https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status
```

**Events to track:**
- initiated
- ringing
- answered
- completed
- busy
- no-answer
- failed

**Call URL (set by initiate-call function):**
```
https://kipvbsaroymehobtalsy.supabase.co/functions/v1/handle-twilio-call
```

## Testing the Flow

### 1. Test Call Initiation
```bash
# Frontend calls
POST /functions/v1/initiate-call
Body: { "candidateId": "uuid" }

# Should return:
{
  "success": true,
  "callId": "uuid",
  "twilioSid": "CAxxxx",
  "candidateName": "Kartik",
  "phoneNumber": "+919058010369"
}
```

### 2. Verify Webhook Receives Status
```bash
# Twilio automatically posts to:
POST /functions/v1/twilio-status

# With form data:
CallSid=CAxxxx
CallStatus=completed
CallDuration=65
```

### 3. Check Analysis Triggered
```bash
# twilio-status automatically calls:
POST /functions/v1/analyze-response
Body: { "callId": "uuid" }

# Check database for:
# - ai_recommendations row created
# - structured_responses rows created
# - candidate status updated
```

### 4. Export Results
```bash
# Frontend calls
GET /functions/v1/export-results?campaignId=uuid
Authorization: Bearer <session_token>

# Should download CSV file with all extracted data
```

## Debugging

### Check Call Status
```sql
SELECT id, status, duration_seconds, started_at, ended_at 
FROM calls 
WHERE candidate_id = 'uuid'
ORDER BY created_at DESC;
```

### Check Transcripts
```sql
SELECT speaker, text, confidence, timestamp
FROM transcripts
WHERE call_id = 'uuid'
ORDER BY sequence_number;
```

### Check AI Analysis
```sql
SELECT 
  recommendation,
  overall_score,
  extracted_data,
  key_strengths,
  concerns
FROM ai_recommendations
WHERE call_id = 'uuid';
```

### Check Structured Responses
```sql
SELECT 
  question_text,
  raw_response,
  extracted_value,
  confidence_score
FROM structured_responses
WHERE call_id = 'uuid'
ORDER BY created_at;
```

## Common Issues

### 1. Webhook not triggered
- Check Twilio console for webhook URL
- Verify edge function is deployed
- Check edge function logs

### 2. Analysis not running
- Verify LOVABLE_API_KEY secret is set
- Check analyze-response logs
- Ensure transcripts exist for call

### 3. Export fails
- Verify user authentication
- Check if campaign has completed calls
- Ensure ai_recommendations exist

### 4. Data extraction incomplete
- Review AI prompt in analyze-response
- Check transcript quality
- Verify question template is complete

## Environment Variables Required

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1234567890

# ElevenLabs
ELEVENLABS_API_KEY=sk_xxxx
ELEVENLABS_AGENT_ID=xxxx

# Lovable AI (auto-configured)
LOVABLE_API_KEY=xxxx

# Supabase (auto-configured)
SUPABASE_URL=https://kipvbsaroymehobtalsy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxx
SUPABASE_ANON_KEY=xxxx
```

## Security Notes

- All webhooks use HTTPS
- Twilio status webhook doesn't require JWT (Twilio authentication)
- ElevenLabs stream doesn't require JWT (WebSocket upgrade)
- Export requires user authentication (JWT)
- Analyze-response requires authentication
- All data queries respect RLS policies
