---
name: Call Intelligence DB schema
description: calls + sms_conversations tables, why drizzle push is blocked, and how the API merges historical + new data.
---

## Tables

### calls
id (uuid), call_sid (text), caller_number (text), called_number (text),
call_type (text: incoming|missed|transferred|callback|voicemail),
digits_pressed (text), duration_secs (integer), outcome (text),
recording_url (text), created_at (timestamptz), updated_at (timestamptz)

### sms_conversations
id (uuid), customer_number (text), direction (text: inbound|outbound),
message (text), message_id (text), status (text: received|sent|delivered|failed),
created_at (timestamptz)

## Why drizzle push is blocked
`drizzle-kit push` (and push-force) both prompt interactively about truncating
`review_platform_stats` due to a unique constraint addition on an existing table
with data. This interactive prompt fails in non-TTY environments. Workaround:
create new tables via raw SQL (`executeSql`). The Drizzle schema definitions
still exist so ORM queries work correctly.

**How to apply:** Any future new tables should be created via `executeSql` in
code_execution, not `drizzle-kit push`, until the review_platform_stats
constraint conflict is resolved.

## API data strategy
`GET /api/call-intelligence?period=today|7days|30days` sources BOTH tables:
- `calls` table → new structured call records (populated from telnyx.ts v2)
- `leads` table → historical event_type-based records (all pre-existing data)
- `sms_conversations` table → new structured SMS records
Metrics are summed from both sources; recent_activity merges + re-sorts.
This ensures the dashboard shows data from day 1 even when calls table is empty.

## Telnyx webhook → DB mapping
| Webhook | leads table | calls table | sms_conversations |
|---|---|---|---|
| /telnyx/voice (incoming) | ✅ telnyx_voice_call | ✅ incoming | — |
| /telnyx/voice/gather (digit 1) | ✅ telnyx_voice_call | ✅ transferred | — |
| /telnyx/voice/gather (digit 2) | ✅ telnyx_callback_request | ✅ callback | — |
| /telnyx/voice/gather (digit 3) | — | ✅ voicemail/pending | — |
| /telnyx/voice/recording | ✅ telnyx_voicemail | ✅ voicemail_left | — |
| /telnyx/webhook call.hangup (missed) | ✅ missed_call | ✅ missed | — |
| sendTextBack() | ✅ telnyx_textback_sent | — | ✅ outbound |
| /telnyx/sms (inbound) | ✅ sms | — | ✅ inbound |
