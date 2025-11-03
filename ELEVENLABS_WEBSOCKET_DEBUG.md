# ElevenLabs WebSocket Connection Debugging Guide

## Issue Summary
The ElevenLabs WebSocket stream is not connecting during calls, resulting in no voice output even though the call connects successfully.

## Current Status
- ✅ `initiate-call` edge function works correctly
- ✅ `handle-twilio-call` edge function generates TwiML correctly  
- ✅ Twilio makes the call and it connects
- ❌ `elevenlabs-stream` edge function receives NO requests (no logs at all)
- ❌ No audio is played during the call

## Diagnosis
The `elevenlabs-stream` function is not being invoked by Twilio at all. This indicates a connection issue between Twilio and the Supabase WebSocket endpoint.

## Root Cause Analysis

### Potential Issues:
1. **WebSocket URL Format**: The URL might not be correctly formatted for Twilio's `<Stream>` element
2. **Network/Firewall**: Twilio might not be able to reach the Supabase WebSocket endpoint
3. **Authentication**: WebSocket connections might require different auth than HTTP
4. **TwiML Configuration**: The `<Stream>` element might need additional configuration

## Testing Steps

### 1. Test Edge Function Reachability
```bash
# Test if the function is deployed and reachable
curl "https://kipvbsaroymehobtalsy.supabase.co/functions/v1/elevenlabs-stream?health=check"

# Expected response:
# {"status":"healthy","timestamp":"...","function":"elevenlabs-stream"}
```

### 2. Check Twilio Stream Configuration
Verify in Twilio Console > Calls > Recent Calls > Call Details:
- Does the call show a Stream connection attempt?
- Are there any Stream connection errors?
- What's the Stream status?

### 3. Verify WebSocket URL Format
Current URL: `wss://kipvbsaroymehobtalsy.supabase.co/functions/v1/elevenlabs-stream?callId={id}`

Required format per Twilio docs:
- Must use `wss://` protocol ✓
- Must be a valid WebSocket endpoint ✓
- Should respond to WebSocket upgrade requests ✓

### 4. Check Edge Function Logs
```bash
# Look for ANY logs from elevenlabs-stream
# Currently: NO LOGS AT ALL (function not being called)
```

## Recent Changes Made

### 1. Added Health Check Endpoint
Added a simple HTTP endpoint to test if the function is reachable:
```typescript
if (url.searchParams.get('health') === 'check') {
  return new Response(JSON.stringify({ status: 'healthy' }));
}
```

### 2. Enhanced Logging
- Added timestamp to all logs
- Added CORS headers
- Log all incoming request details
- Log all headers when WebSocket upgrade fails

### 3. Updated TwiML Generation
- Added `<Parameter>` tag to pass callId
- Enhanced logging for debugging

## Next Steps

1. **Test Health Check**: Make a curl request to verify the function is deployed
2. **Check Twilio Logs**: Look for Stream connection errors in Twilio console
3. **Verify WebSocket Upgrade**: Ensure Supabase Edge Functions support WebSocket upgrades
4. **Test Direct WebSocket Connection**: Try connecting with a WebSocket client tool
5. **Review Supabase Config**: Check if `verify_jwt = false` is correct for WebSocket endpoints

## Configuration Reference

### Supabase Config (config.toml)
```toml
[functions.elevenlabs-stream]
verify_jwt = false  # Required for Twilio WebSocket connections
```

### Environment Variables Required
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Possible Solutions

### Solution 1: Use HTTP Polling Instead of WebSocket
If WebSocket connections are blocked, switch to HTTP polling for audio streaming.

### Solution 2: Use Twilio Functions as Proxy
Deploy a Twilio Function that acts as a proxy between Twilio and Supabase.

### Solution 3: Check Supabase WebSocket Support
Verify that Supabase Edge Functions fully support WebSocket connections and that there are no additional configuration requirements.

### Solution 4: Alternative Architecture
Consider using Twilio's native AI services or a different real-time communication approach.

## Reference Links
- [Twilio Stream Documentation](https://www.twilio.com/docs/voice/twiml/stream)
- [Supabase Edge Functions WebSocket Support](https://supabase.com/docs/guides/functions)
- [ElevenLabs Conversational AI](https://elevenlabs.io/docs/api-reference/conversational-ai)
