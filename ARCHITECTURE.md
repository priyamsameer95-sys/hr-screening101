# HR Screening Platform - Architecture Documentation

## Overview
This platform automates HR screening calls using ElevenLabs Conversational AI and Twilio telephony, with intelligent conversation flow management and AI-powered analysis.

## Architecture Components

### 1. Call Initiation Flow
```
Frontend (Campaign Detail) 
  → initiate-call Edge Function
  → Twilio API (makes outbound call)
  → handle-twilio-call (returns TwiML)
  → elevenlabs-stream (WebSocket proxy)
```

### 2. Real-time Conversation Flow
```
Candidate Phone
  ↕ (audio)
Twilio
  ↕ (WebSocket)
elevenlabs-stream (Edge Function)
  ↕ (WebSocket)
ElevenLabs Conversational AI Agent
```

### 3. Post-Call Analysis
```
Call Ends
  → analyze-response Edge Function
  → Lovable AI (GPT/Gemini)
  → Structured Data Extraction
  → Database Updates
```

## Key Improvements Implemented

### 1. Dynamic Conversation Prompting
**Problem**: ElevenLabs agent wasn't aware of campaign-specific questions.

**Solution**: The `elevenlabs-stream` function now:
- Fetches campaign details, questions, and candidate info when call connects
- Builds a comprehensive prompt with:
  - Candidate context (name, experience, current company)
  - Campaign details (position, company)
  - Ordered list of questions to ask
  - Conversation flow guidelines
  - Response extraction instructions
- Sends this prompt to ElevenLabs agent via WebSocket on connection

```typescript
// Example prompt structure
You are Kajal, an AI HR assistant from CashKaro...
CANDIDATE: ${candidate.full_name}
QUESTIONS TO ASK (in order):
1. Could you introduce yourself?
2. What is your notice period?
3. What is your current and expected salary?
...
```

### 2. Structured Response Extraction
**Problem**: Raw transcripts weren't being analyzed for structured data.

**Solution**: Enhanced `analyze-response` function:
- Uses Lovable AI (Gemini 2.5 Flash) for intelligent extraction
- Extracts structured fields:
  - Notice period (value, unit, immediate flag)
  - Current/Expected CTC (amount, currency)
  - Skills array
  - Work preferences
  - Technical experience
- Provides per-question assessment
- Calculates multiple scores (engagement, communication, qualification)

### 3. Intelligent Call Flow
**Features**:
- Natural conversation pacing (one question at a time)
- Acknowledgment of responses before next question
- Handling of special cases:
  - Reschedule requests
  - "Not a good time" scenarios
  - Silence detection
- Graceful call conclusion with next steps

### 4. Comprehensive Analytics
**Extracted Data**:
```json
{
  "notice_period": { "value": 30, "unit": "days", "immediate": false },
  "current_ctc": { "amount": 1200000, "currency": "INR" },
  "expected_ctc": { "amount": 1500000, "currency": "INR" },
  "key_skills": ["JavaScript", "React", "Node.js"],
  "engagement_score": 8,
  "communication_score": 9,
  "qualification_score": 7,
  "overall_score": 8,
  "recommendation": "PROCEED"
}
```

## Database Schema

### Tables Used
1. **campaigns** - Campaign configuration
2. **candidates** - Candidate information
3. **calls** - Call records and status
4. **transcripts** - Real-time conversation transcription
5. **structured_responses** - Extracted structured data
6. **ai_recommendations** - AI analysis results
7. **question_templates** - Question sets
8. **questions** - Individual questions

## Edge Functions

### 1. initiate-call
- **Purpose**: Start outbound calls via Twilio
- **Auth**: Requires JWT (authenticated users only)
- **Flow**:
  - Validates candidate
  - Creates call record
  - Initiates Twilio call
  - Returns call ID

### 2. handle-twilio-call
- **Purpose**: Handle Twilio webhook when call connects
- **Auth**: Public (Twilio webhook)
- **Returns**: TwiML to establish WebSocket stream

### 3. elevenlabs-stream (Enhanced ✨)
- **Purpose**: WebSocket proxy between Twilio and ElevenLabs
- **Auth**: Public (used by Twilio)
- **Key Features**:
  - **Dynamic prompt injection** - Configures agent with campaign questions
  - **Bidirectional audio streaming** - Routes audio between services
  - **Real-time transcription** - Saves agent and candidate transcripts
  - **Call state management** - Updates database in real-time

### 4. analyze-response (Enhanced ✨)
- **Purpose**: AI-powered call analysis
- **Auth**: Requires JWT
- **Key Features**:
  - **Lovable AI integration** - Uses Gemini 2.5 Flash
  - **Multi-dimensional scoring** - Engagement, communication, qualification
  - **Structured extraction** - Notice period, salary, skills, etc.
  - **Recommendation engine** - PROCEED / REVIEW / REJECT
  - **Per-question analysis** - Maps responses to specific questions

### 5. twilio-status
- **Purpose**: Handle Twilio status webhooks
- **Auth**: Public (Twilio webhook)
- **Updates**: Call status, duration, completion

## WebSocket Communication

### Twilio → elevenlabs-stream
```json
// Start event
{ "event": "start", "start": { "streamSid": "..." } }

// Audio chunks (μ-law 8kHz)
{ "event": "media", "media": { "payload": "base64..." } }

// Stop event
{ "event": "stop" }
```

### elevenlabs-stream → ElevenLabs
```json
// Configuration (on connect)
{
  "type": "conversation_initiation_client_data",
  "custom_llm_extra_body": {
    "system_prompt": "..."
  }
}

// Audio from candidate
{ "user_audio_chunk": "base64..." }

// Pong (keepalive)
{ "type": "pong", "event_id": "..." }
```

### ElevenLabs → elevenlabs-stream
```json
// Conversation start
{
  "type": "conversation_initiation_metadata",
  "conversation_id": "..."
}

// Agent audio
{
  "type": "audio",
  "audio": "base64..." // PCM/μ-law audio
}

// Transcripts
{
  "type": "transcript",
  "role": "agent|user",
  "transcript": "text..."
}

// Ping (keepalive)
{ "type": "ping", "event_id": "..." }
```

## Configuration Requirements

### Environment Variables (Already Set)
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ELEVENLABS_AGENT_ID` - Agent ID from ElevenLabs dashboard
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number
- `LOVABLE_API_KEY` - Auto-configured for AI analysis

### Twilio Configuration
1. **Phone Number Setup**:
   - Go to Twilio Console → Phone Numbers
   - Select your phone number
   - Set Voice webhook to: `https://kipvbsaroymehobtalsy.supabase.co/functions/v1/handle-twilio-call?callId={callId}`
   - **Note**: Replace `{callId}` dynamically when initiating calls

2. **Status Callback**:
   - Set to: `https://kipvbsaroymehobtalsy.supabase.co/functions/v1/twilio-status`
   - Events: `initiated, ringing, answered, completed`

### ElevenLabs Agent Configuration
1. **Voice Settings**:
   - Output format: `ulaw_8000` (for Twilio compatibility)
   - Language: English (or as needed)
   - Voice ID: Select appropriate voice

2. **Agent Behavior**:
   - Enable conversation mode
   - Set reasonable response times
   - Configure interruption handling

## Best Practices

### 1. Call Quality
- Use `ulaw_8000` audio format for Twilio compatibility
- Handle network issues gracefully
- Implement retry logic for failed calls

### 2. Conversation Flow
- Keep agent responses concise (2-3 sentences)
- Allow natural pauses
- Acknowledge candidate responses
- One question at a time

### 3. Error Handling
- Log all errors with context
- Update call status on failures
- Provide graceful fallbacks
- Save partial transcripts

### 4. Data Quality
- Validate extracted data
- Set confidence scores
- Flag incomplete responses
- Handle edge cases (missing data, unclear answers)

### 5. Performance
- Use WebSocket for real-time streaming
- Batch database updates when possible
- Cache campaign/question data
- Monitor API rate limits

## Monitoring & Debugging

### Key Metrics
- Call success rate
- Average call duration
- Transcript completeness
- AI analysis accuracy
- Response extraction confidence

### Debugging Tools
1. **Edge Function Logs**:
   ```bash
   # View logs in Lovable Cloud console
   # Or check Supabase dashboard
   ```

2. **Database Queries**:
   ```sql
   -- Recent calls
   SELECT * FROM calls ORDER BY created_at DESC LIMIT 10;
   
   -- Transcripts for a call
   SELECT * FROM transcripts WHERE call_id = '...' ORDER BY sequence_number;
   
   -- AI recommendations
   SELECT * FROM ai_recommendations WHERE call_id = '...';
   ```

3. **Network Analysis**:
   - Check browser dev tools for WebSocket messages
   - Monitor Twilio console for call logs
   - Review ElevenLabs dashboard for usage

## Troubleshooting

### Call Not Connecting
1. Verify Twilio webhook URL is correct
2. Check ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID
3. Ensure phone number is formatted correctly (+country code)
4. Review Twilio debugger for errors

### Audio Issues
1. Confirm ElevenLabs agent uses `ulaw_8000` format
2. Check WebSocket connection stability
3. Verify audio payload encoding/decoding

### Missing Transcripts
1. Check if ElevenLabs agent has transcription enabled
2. Verify database write permissions
3. Review edge function logs for errors

### Poor AI Analysis
1. Check transcript quality and completeness
2. Verify Lovable AI API key is configured
3. Adjust AI prompt for better extraction
4. Review extracted data confidence scores

## Future Enhancements

### Planned Features
1. **Multi-language Support** - Dynamic language detection
2. **Call Recording** - Store audio files in Supabase Storage
3. **Real-time Dashboard** - Live call monitoring
4. **Advanced Analytics** - Sentiment analysis, keyword tracking
5. **A/B Testing** - Test different conversation flows
6. **Integration APIs** - Connect to ATS systems
7. **Custom Questions** - Per-campaign question customization

### Performance Optimizations
1. Connection pooling for database
2. Caching frequently accessed data
3. Parallel processing for batch operations
4. WebSocket message batching

## Security Considerations

### Current Security Measures
- JWT authentication for user-facing functions
- Service role key for internal operations
- CORS headers properly configured
- Environment variables for secrets

### Recommended Additional Security
1. Rate limiting on public endpoints
2. IP whitelisting for Twilio webhooks
3. Request signing validation
4. Audit logging for sensitive operations
5. Data encryption at rest

## Conclusion

This architecture provides a robust, scalable solution for automated HR screening calls. The key innovations are:

1. **Dynamic conversation configuration** - Each call is customized based on campaign and candidate
2. **Intelligent analysis** - AI extracts structured data and provides recommendations
3. **Real-time processing** - Transcripts and updates happen during the call
4. **Comprehensive data model** - All aspects of the call are captured and analyzed

The system is production-ready and can handle multiple concurrent calls while maintaining high-quality conversations and accurate data extraction.
