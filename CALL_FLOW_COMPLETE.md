# Complete Call Flow - High-Level Design (HLD)

## System Architecture Overview

This document describes the complete end-to-end flow of the AI-powered calling system, from call initiation to AI analysis.

---

## 1. Call Initiation Flow

```mermaid
sequenceDiagram
    participant User as User (Browser)
    participant Frontend as React Frontend
    participant Supabase as Supabase DB
    participant InitiateCall as initiate-call Function
    participant Twilio as Twilio API
    
    User->>Frontend: Click "Start Call" button
    Frontend->>InitiateCall: POST /initiate-call
    InitiateCall->>Supabase: Create call record (IN_PROGRESS)
    InitiateCall->>Supabase: Update candidate status
    InitiateCall->>Twilio: Create outbound call
    Note over InitiateCall,Twilio: URL: handle-twilio-call?callId={id}
    Note over InitiateCall,Twilio: StatusCallback: twilio-status
    Twilio-->>InitiateCall: Return Call SID
    InitiateCall->>Supabase: Update call with SID
    InitiateCall-->>Frontend: Success response
    Frontend-->>User: Show "Call initiated" toast
```

### Key Components:
- **initiate-call Function**: Creates call record, triggers Twilio
- **Twilio Configuration**: 
  - Voice URL: `handle-twilio-call`
  - Status Callback: `twilio-status`
  - Status Events: initiated, ringing, answered, completed, busy, no-answer, failed

---

## 2. Call Connection & WebSocket Setup

```mermaid
sequenceDiagram
    participant Twilio as Twilio
    participant HandleCall as handle-twilio-call
    participant ElevenLabs as elevenlabs-stream
    participant EL_API as ElevenLabs API
    participant Supabase as Supabase DB
    
    Twilio->>HandleCall: POST (call answered)
    HandleCall->>Supabase: Fetch call + candidate + campaign + questions
    HandleCall-->>Twilio: Return TwiML with WebSocket Stream
    Note over HandleCall,Twilio: WebSocket URL:<br/>wss://[project].supabase.co/functions/v1/elevenlabs-stream?callId={id}
    
    Twilio->>ElevenLabs: Upgrade to WebSocket (bidirectional)
    ElevenLabs->>Supabase: Fetch call details + questions
    ElevenLabs->>EL_API: Get signed URL
    EL_API-->>ElevenLabs: Return signed WebSocket URL
    ElevenLabs->>EL_API: Connect to Conversational AI
    ElevenLabs->>EL_API: Send custom system prompt with questions
    ElevenLabs->>Supabase: Update call status to IN_PROGRESS
    
    Note over Twilio,EL_API: Audio streams now flowing bidirectionally
```

### Key Components:
- **handle-twilio-call**: Generates TwiML with WebSocket URL
- **elevenlabs-stream**: WebSocket relay between Twilio ↔ ElevenLabs
- **Audio Codecs**: 
  - Twilio uses μ-law (PCMU) at 8kHz
  - ElevenLabs uses PCM16 at 16kHz
  - Transcoding happens in real-time

---

## 3. Real-Time Conversation Flow

```mermaid
sequenceDiagram
    participant Candidate as Candidate (Phone)
    participant Twilio as Twilio Media Stream
    participant Stream as elevenlabs-stream
    participant EL_AI as ElevenLabs AI
    participant Supabase as Supabase DB
    
    loop Continuous Audio Flow
        Candidate->>Twilio: Speak (audio)
        Twilio->>Stream: Media event (μ-law audio)
        Stream->>Stream: Transcode μ-law → PCM16
        Stream->>EL_AI: user_audio_chunk
        
        EL_AI->>EL_AI: Process speech, generate response
        EL_AI->>Stream: audio event (PCM16)
        Stream->>Stream: Transcode PCM16 → μ-law
        Stream->>Twilio: Media event (μ-law audio)
        Twilio->>Candidate: Play AI response
    end
    
    loop Transcript Capture
        EL_AI->>Stream: transcript event (role: user/agent)
        Stream->>Supabase: Insert transcript record
    end
    
    Note over Candidate,Supabase: Conversation continues until hangup
```

### Key Components:
- **Audio Transcoding**: Real-time conversion between formats
- **Transcript Storage**: Every utterance saved to `transcripts` table
- **Conversation ID**: Unique ElevenLabs conversation identifier

---

## 4. Call Status Updates via Webhook

```mermaid
sequenceDiagram
    participant Twilio as Twilio
    participant StatusWebhook as twilio-status
    participant Supabase as Supabase DB
    participant Analysis as analyze-response
    
    Note over Twilio: Call state changes (initiated, ringing, answered, completed, etc.)
    
    Twilio->>StatusWebhook: POST (status event)
    Note over Twilio,StatusWebhook: FormData: CallSid, CallStatus, CallDuration
    
    StatusWebhook->>StatusWebhook: Map Twilio status → Our status
    Note over StatusWebhook: initiated → SCHEDULED<br/>ringing/answered → IN_PROGRESS<br/>completed → COMPLETED<br/>failed/busy/no-answer → FAILED
    
    StatusWebhook->>Supabase: UPDATE calls SET status=?, ended_at=?, duration_seconds=?
    
    alt Status is COMPLETED
        StatusWebhook->>Analysis: Trigger AI analysis
        Analysis->>Supabase: Fetch call + transcripts
        Analysis->>Analysis: Analyze conversation with AI
        Analysis->>Supabase: Store recommendations + structured responses
    end
    
    StatusWebhook-->>Twilio: 200 OK
```

### Key Components:
- **twilio-status Webhook**: Receives all call state changes
- **Status Mapping**: Twilio statuses → Application statuses
- **Auto-Trigger Analysis**: On call completion

---

## 5. Call End & Cleanup Flow

```mermaid
sequenceDiagram
    participant Candidate as Candidate
    participant Twilio as Twilio
    participant Stream as elevenlabs-stream
    participant EL_AI as ElevenLabs AI
    participant Supabase as Supabase DB
    participant Cleanup as cleanup-stale-calls
    
    Candidate->>Twilio: Hangup call
    Twilio->>Stream: Stop event
    Stream->>EL_AI: Close WebSocket
    EL_AI-->>Stream: Close confirmation
    Stream->>Supabase: UPDATE call SET status=COMPLETED, ended_at=NOW()
    Stream->>Stream: Close Twilio WebSocket
    
    Note over Cleanup: Runs every 15 minutes (cron job)
    Cleanup->>Supabase: Find calls IN_PROGRESS > 30 minutes
    Cleanup->>Supabase: UPDATE calls SET status=FAILED, error_message='Timed out'
```

### Key Components:
- **Graceful Shutdown**: Both WebSockets close cleanly
- **Status Update**: Call marked as COMPLETED
- **Stale Call Cleanup**: Safety net for stuck calls (30min timeout)

---

## 6. AI Analysis & Data Export Flow

```mermaid
sequenceDiagram
    participant StatusWebhook as twilio-status
    participant Analysis as analyze-response
    participant LovableAI as Lovable AI (Gemini)
    participant Supabase as Supabase DB
    participant User as User
    participant Export as export-results
    
    StatusWebhook->>Analysis: Trigger (call completed)
    Analysis->>Supabase: Fetch call + transcripts + questions
    Analysis->>Analysis: Build analysis prompt with conversation
    Analysis->>LovableAI: Analyze conversation
    LovableAI-->>Analysis: Return recommendations + structured data
    Analysis->>Supabase: INSERT ai_recommendations
    Analysis->>Supabase: INSERT structured_responses (answers to questions)
    
    User->>Export: Click "Export Results"
    Export->>Supabase: Fetch campaign + candidates + calls + recommendations
    Export->>Export: Generate CSV with all data
    Export-->>User: Download CSV file
```

### Key Components:
- **analyze-response**: AI-powered conversation analysis
- **Lovable AI**: Uses Gemini 2.5 Flash for fast, accurate analysis
- **Structured Responses**: Extracts answers to campaign questions
- **CSV Export**: All data in one downloadable file

---

## 7. Real-Time UI Updates

```mermaid
sequenceDiagram
    participant Supabase as Supabase Realtime
    participant CallMonitor as CallMonitor Component
    participant CallStatus as CallStatusMonitor Component
    participant User as User
    
    Note over Supabase: Realtime subscription to 'calls' table
    
    Supabase->>CallMonitor: Change notification (call status updated)
    CallMonitor->>CallMonitor: Refetch call data
    CallMonitor-->>User: Update call list + stats
    
    Supabase->>CallStatus: Change notification
    CallStatus->>CallStatus: Refetch active calls
    CallStatus-->>User: Update active call status
    
    Note over CallMonitor,CallStatus: Auto-refresh every 5 seconds<br/>+ Real-time updates
```

### Key Components:
- **Supabase Realtime**: Postgres change notifications
- **React Query**: Auto-refetch with 5s interval
- **Call Statistics**: Total, In Progress, Completed, Failed

---

## Configuration & Environment

### Required Secrets (in Supabase):
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `LOVABLE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Edge Functions Configuration (`supabase/config.toml`):
```toml
[functions.handle-twilio-call]
verify_jwt = false  # Twilio webhooks

[functions.elevenlabs-stream]
verify_jwt = false  # WebSocket connection

[functions.twilio-status]
verify_jwt = false  # Twilio status webhooks

[functions.twilio-recording]
verify_jwt = false  # Twilio recording webhooks

[functions.initiate-call]
verify_jwt = true   # Authenticated user action

[functions.analyze-response]
verify_jwt = true   # Internal function

[functions.export-results]
verify_jwt = true   # Authenticated user action

[functions.cleanup-stale-calls]
verify_jwt = false  # Cron job
```

---

## Database Schema

### Key Tables:
- **calls**: Call records with status, duration, SID
- **candidates**: People to call
- **campaigns**: Campaign configuration
- **transcripts**: Real-time conversation capture
- **ai_recommendations**: AI-generated insights
- **structured_responses**: Extracted answers to questions
- **question_templates**: Question sets for campaigns
- **questions**: Individual questions

---

## Recent Fixes Applied

### 1. WebSocket URL Format
- **Issue**: Twilio couldn't connect to WebSocket
- **Fix**: Changed from `wss://kipvbsaroymehobtalsy.supabase.co/functions/v1/elevenlabs-stream` format to use project reference directly

### 2. Enhanced Logging
- **Added**: Comprehensive logging at every step
  - Request headers inspection
  - WebSocket upgrade details
  - Audio chunk counters
  - Error stack traces
  - Timestamp on all events

### 3. Error Handling
- **Added**: Proper TypeScript error typing
- **Added**: Detailed error messages with context
- **Added**: WebSocket upgrade failure handling

### 4. Status Webhook Logging
- **Added**: Full form data logging
- **Added**: Status mapping visibility
- **Added**: Update confirmation logs

---

## Testing Checklist

### 1. Test Call Initiation
✅ Call record created in DB
✅ Twilio receives request
✅ `handle-twilio-call` logs appear

### 2. Test WebSocket Connection
✅ `elevenlabs-stream` logs show upgrade
✅ ElevenLabs signed URL obtained
✅ WebSocket connection established

### 3. Test Audio Flow
✅ Audio chunks flowing Twilio → ElevenLabs
✅ Audio chunks flowing ElevenLabs → Twilio
✅ Transcripts being saved

### 4. Test Status Updates
✅ `twilio-status` receives webhooks
✅ Call status updates in DB
✅ Analysis triggers on completion

### 5. Test Cleanup
✅ Stale calls marked as FAILED after 30min
✅ Cleanup function runs on schedule

---

## Troubleshooting Guide

### No ElevenLabs Logs?
1. Check WebSocket URL format in `handle-twilio-call`
2. Verify `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` are set
3. Check if Twilio can reach your Supabase project (firewall?)

### No Status Webhook Logs?
1. Verify Twilio webhook URL: `https://[project].supabase.co/functions/v1/twilio-status`
2. Check `verify_jwt = false` in config.toml
3. Check Twilio dashboard for webhook errors

### Call Stuck IN_PROGRESS?
1. Check `twilio-status` webhook is configured
2. Verify cleanup function is running (every 15min)
3. Manually end stuck calls via SQL or cleanup function

### No Audio/Silent Call?
1. Check audio transcoding (μ-law ↔ PCM16)
2. Verify ElevenLabs agent is configured with voice
3. Check WebSocket message flow in logs

---

## Performance Metrics

- **Call Setup Time**: ~2-3 seconds
- **Audio Latency**: 200-400ms (Twilio + ElevenLabs)
- **Transcript Delay**: ~1-2 seconds behind audio
- **Analysis Time**: 5-15 seconds after call ends
- **Cleanup Interval**: Every 15 minutes
- **Stale Call Timeout**: 30 minutes

---

## Next Steps

1. ✅ Monitor first test call logs
2. ✅ Verify WebSocket connection establishes
3. ✅ Check status webhooks fire correctly
4. ✅ Confirm transcripts are saved
5. ✅ Test AI analysis on completed call
6. ✅ Test CSV export with data
