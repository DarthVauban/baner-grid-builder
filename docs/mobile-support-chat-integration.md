# MT Workspace support chat — mobile contract v1

Backend/web implementation lives in `baner-grid-builder`. Flutter changes belong
to `MT-workspace-app`. Account key: `deploymentId:userId`. Device bearer credentials
are account/deployment specific; never derive the target account from the active tab.
Keep Android application ID and iOS bundle ID `sbs.mtpanel.app`.

## Defaults and authorization

- Explicit opt-in; absent preference means disabled, unconfigured, version 0.
- All approved, subscribed operators with effective `online_support` access are
  recipients, regardless of assignee. Tool access includes current 2FA policy.
- Read scope is **team**, not per operator. Push eligibility does not depend on
  team read state or working hours. Working hours still control automatic replies.
- Push expires 15 minutes after the visitor message's persisted `created_at`.
- No runtime LLM, recommendation engine, external search, or new inbox category.

Base: `/api/mobile/support-chat`. All routes require
`Authorization: Bearer <deviceAccessToken>`. Bootstrap and own preference routes
work without tool access; all conversation/count/stream routes additionally require
`online_support`. Server obtains user/device/deployment identity from authentication.
Enable preference checks current tool access; disable remains available without it.
An admin's tool/2FA restriction cannot be bypassed by changing a preference or
registering an FCM token. Only the authenticated user can change this preference;
there is no endpoint accepting another user's ID or a mobile-editable admin policy.
An explicit successful preference PUT is the only opt-in operation. OS permission,
FCM token registration, resume, pairing and browser localStorage cannot opt in.
Application-form subscriptions are independent.

## DTOs (JSON; every listed field is present)

`UUID` and `Timestamp` are strings. Timestamps denote UTC instants and serialize
as ISO 8601. Sequence is an unsigned decimal **string**, never a JSON number.
Empty visitor/contact/product strings mean unavailable; arrays are never null.

```ts
type Status = 'NEW' | 'OPEN' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
type Sender = 'visitor' | 'operator' | 'system';
type Preference = {
  enabled: boolean; configured: boolean; version: number; updatedAt: Timestamp | null;
};
type ReadState = {
  scope: 'team'; lastReadMessageId: UUID | null; lastReadSequence: string;
};
type Visitor = {
  id: UUID; name: string; email: string; phone: string;
  firstPageUrl: string; lastPageUrl: string; lastPageTitle: string;
  createdAt: Timestamp; lastSeenAt: Timestamp;
};
type ProductCard = {
  id: UUID; productId: UUID; modificationId: UUID | null;
  title: string; sku: string; brand: string; price: string; oldPrice: string;
  currency: string; availability: string; visible: boolean; active: boolean;
  imageUrl: string; url: string; source: 'message' | 'page';
};
type Message = {
  id: UUID; conversationId: UUID; senderType: Sender;
  senderUserId: UUID | null; senderName: string; body: string;
  clientMessageId: UUID | null; sequence: string;
  productCards: ProductCard[]; createdAt: Timestamp;
};
type Conversation = {
  id: UUID; status: Status; assignedUser: {id: UUID; name: string} | null;
  visitor: Visitor;
  lastMessage: {body: string; senderType: Sender; createdAt: Timestamp} | null;
  unreadCount: number; firstResponseAt: Timestamp | null;
  createdAt: Timestamp; updatedAt: Timestamp; readState: ReadState;
};
type Page<T> = {items: T[]; nextCursor: string | null; hasMore: boolean};
type Bootstrap = {
  contractVersion: 1;
  workspace: {deploymentId: string; environment: string; displayName: string;
    webOrigin: string; apiBaseUrl: string};
  userId: UUID; deviceId: UUID;
  access: {allowed: boolean; reason: null | 'TOOL_ACCESS_DENIED' | 'TOOL_2FA_REQUIRED'};
  readScope: 'team'; notificationPreference: Preference;
};
```

Mobile Message.sequence is always non-null after lazy history initialization.
Legacy public/web payloads can contain null for history not yet initialized.
Product price strings must not be parsed as binary floats for display. Body is
plain text; accept only http(s) product/page links. Missing/deleted products may
produce an empty productCards array without hiding the message.

## HTTP

Success envelope is `{ "data": T }`; 204 has no body. Errors are
`{"error":{"code":"...","message":"...","details"?:...}}`.

| Route relative to base | Input | Success |
|---|---|---|
| GET /bootstrap | — | 200 `{data: Bootstrap}` |
| GET /notification-preference | — | 200 `{data: Preference}` |
| PUT /notification-preference | `{enabled:boolean, expectedVersion:integer>=0}` | 200 `{data: Preference}` |
| GET /conversations | status?, search?, limit?, cursor? | 200 `{data: Page<Conversation>}` |
| GET /conversations/:id | — | 200 `{data: Conversation}` |
| GET /conversations/:id/messages | limit?, cursor? | 200 `{data: Page<Message>}` |
| GET /unread-count | — | 200 `{"data":3}` (message count, CLOSED excluded) |
| POST /conversations/:id/read | `{lastReadMessageId: UUID}` | 200 `{data: ReadState}` |
| POST /conversations/:id/claim | empty body | 200 `{data: Conversation}` |
| PATCH /conversations/:id/customer | `{name,email,phone}` | 200 `{data: Conversation}` |
| PATCH /conversations/:id/status | `{status: Status}` | 200 `{data: Conversation}` |
| POST /conversations/:id/messages | `{body,clientMessageId:UUID}` | 201 `{data: Message}`; replay 200, same envelope |
| GET /stream | SSE | text/event-stream |

All contact fields are required, strings; empty clears. Limits: name 160, email
320 and valid email or empty, phone 40. Body trimmed, 1–5000 UTF-16 code units
(same validation as web). Search trimmed, max 160; searches name/email/phone/page
title. Status empty/omitted means all. Limit defaults to 50, range 1–100.

Create clientMessageId once per logical send; persist pending ID/body per account
and reuse after timeout. Matching conversation + key + operator + normalized body
returns the same persisted row without changing status, read state or emitting a
new event. Another sender/body with that key returns 409. Assignment does not add
an owner-only restriction absent from the existing web tool.

Messages: fetch latest N, return ascending sequence. nextCursor fetches strictly
older messages. Example with sequences 1..4, limit 2:

```text
GET /conversations/<id>/messages?limit=2
=> {data:{items:[Message(sequence="3"),Message(sequence="4")],hasMore:true,nextCursor:"C1"}}
GET /conversations/<id>/messages?limit=2&cursor=C1
=> {data:{items:[Message(sequence="1"),Message(sequence="2")],hasMore:false,nextCursor:null}}
```

Conversations sort updated_at DESC, id DESC; follow nextCursor with identical
filters. This is a live queue, not a frozen snapshot: restart first-page pagination
on invalidation/resume and deduplicate by ID. Cursors are opaque signed,
versioned, deployment/resource/filter-bound base64url JSON. Message positions use
decimal sequence strings. Queue positions use PostgreSQL `to_char(updated_at,
'YYYY-MM-DD HH24:MI:SS.USOF')` directly, preserving all six fractional digits and
offset; never reconstruct a cursor timestamp from a JS Date or displayed DTO.

Stable errors: 401 INVALID_DEVICE_TOKEN / DEVICE_REVOKED; 403 TOOL_ACCESS_DENIED /
TOOL_2FA_REQUIRED; 404 SUPPORT_CONVERSATION_NOT_FOUND; 409
SUPPORT_CONVERSATION_ALREADY_ASSIGNED / SUPPORT_CLIENT_MESSAGE_CONFLICT /
SUPPORT_NOTIFICATION_PREFERENCE_CONFLICT; 422 VALIDATION_ERROR /
SUPPORT_INVALID_CURSOR / SUPPORT_READ_MESSAGE_INVALID; 503 SERVICE_UNAVAILABLE /
SUPPORT_NOTIFICATION_BUSY (gate busy; opt-out has not committed).
On preference conflict GET current state; do not silently retry the stale choice.
404 bootstrap on an older/disabled backend hides the feature, not the account.

## Read boundary and commit order

Read is a monotonically increasing team prefix through a message ID belonging to
that conversation. Acknowledge only after a fetched latest transcript has rendered
in a visible foreground screen. Do not acknowledge an optimistic/send-response
message appended across a gap: refresh the transcript first. Scrolling away from
the tail must not mark newly fetched unseen messages as read.

All visitor/operator/system inserts and read operations take FOR UPDATE on the
conversation **before** allocating ordinal from its transactional counter.
This serializes commit order for that conversation, including a transaction that
started earlier (created_at/NOW alone would be unsafe). Read resolves the supplied
ID to its ordinal under the same lock and advances only via a greater boundary.
Newer messages arriving between GET and read remain unread; a delayed lower
read cannot move the boundary backwards. No per-operator read table is added.

Migration adds nullable message_sequence and an initialization flag/counter to
conversations. First access numbers pre-existing history by created_at,id under
the same lock and seeds its read prefix from legacy operator_last_read_at in the
same transaction. No history is deleted. Normal allocation is O(1) after this
one-time backfill. All writers must be upgraded together before v1 API activation.

Updated web sends the same boundary; existing read response remains 204. Cached
old web bodyless read receives 204 without advancing. Send no longer implicitly
marks newly arrived messages read. Web refresh is required for bounded read;
this is an intentional correction of the old NOW() race, preserving team scope.

## Foreground stream and refresh

`event: connected`, data `{"contractVersion":1}`. `event: support` data has type
message/conversation/contact/read/settings/notification_preference/heartbeat plus
optional conversationId/messageId/senderType. Mobile receives no preview/contacts.
Preference events are filtered to the authenticated user. Access is checked on
every delivery and 25-second heartbeat; access_revoked carries `{code}` then closes.

No event IDs/replay/Last-Event-ID. Reload queue, count, preference and active latest
transcript after connect/reconnect/resume; poll every 30 seconds in foreground.
Use exponential reconnect backoff with jitter; stop on 401/403/account change.
Current EventEmitter is process-local; polling is required across API replicas.
Bootstrap/preference can work while support stream is forbidden: GET on resume,
account selection, opening settings and after own PUT is sufficient. No new
unauthorized global stream is needed. Clear history cursors on account/resume reload.

## Push registration, delivery and downgrade

Extend existing PUT `/api/mobile/devices/:deviceId/push-token` with optional
`supportChatContractVersion: 0 | 1`, default **0 on every call**; response stays 204.
New Flutter sends 1 together with its normal token registration. Old calls omit
the field and clear the declaration. New pairing defaults to 0. Do not opt in the
user as a side effect. A capability declaration is not proof of installed binary:
after downgrade/backup, stale declaration may exist until the old client registers
its token. Such a client can receive an alert with the notification preview; it cannot open support UI.
Current old Flutter handles an unknown kind by refreshing data and, on tap,
possibly selecting the correctly routed account; it does not revoke it. New Flutter
must ignore unknown kinds before any navigation. No claim is made that stale
capabilities absolutely prevent delivery to downgraded binaries.

FCM `notification.title` is `<visitor label>: <short message excerpt>`; `notification.body`
is a longer excerpt of that same visitor message. This explicitly replaces the
previous generic-only notification copy. The worker reads the visitor and the
exact outbox `support_message_id` only after the current device/user/tool/2FA,
subscription, lease and expiry checks under the delivery gate; it never selects
the conversation's latest message. Missing/non-visitor source messages cancel
the delivery rather than showing content from another message.

The label uses the visitor's name, or `Відвідувач <first 6 characters of visitor UUID>`
when the normalized name is empty; email and phone are not used as fallbacks.
Name/label, title excerpt and body have limits of **40 / 60 / 180 graphemes**,
including a terminal `…` when truncated. Text is NFC-normalized; whitespace,
control and bidi-control characters, zero-width spaces and BOMs become single
spaces, with leading/trailing spaces removed. Emoji ZWJ sequences, flags, skin
tones and combined accents are not split. Malformed UTF-16 becomes U+FFFD.
Additional JSON-escaped UTF-8 content caps of **256 / 512 / 1536 bytes** leave
room for routing within [FCM's 4096-byte payload limit](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type). If a single grapheme cannot
fit, use the anonymous label or `Нове повідомлення`; normalized empty message
text also uses `Нове повідомлення`. For example: title `Олександр: Підкажіть наявність…`.

Names and message excerpts belong only to `notification.title/body`, never to
`data`, SSE, outbox payloads or logs. Flutter may retain the received notification
title/body for display, and must use the same copy for its foreground local alert
after its existing access/subscription checks; navigation still uses only IDs.
Before live rollout, new Flutter must create AndroidNotificationChannel `support_chat_v1` («Онлайн-підтримка», importance high) so support foreground and background notifications use the same channel (`android.notification.channelId` in Admin format, `android.notification.channel_id` in HTTP v1).
Data values are strings:

```json
{"kind":"support_chat_message","schemaVersion":"1","pushId":"<outbox UUID>",
 "deploymentId":"<deployment>","environment":"<environment>",
 "targetDeviceId":"<device UUID>","conversationId":"<conversation UUID>",
 "messageId":"<message UUID>","expiresAt":"<UTC ISO timestamp>"}
```

Use deploymentId + targetDeviceId to resolve AccountVault, never active account.
On tap, refresh auth/access and conversation via that account. Handle cold-start
getInitialMessage and background onMessageOpenedApp. Unknown account/404 must
not open a conversation in another account.

Only newly inserted visitor messages enqueue, in that transaction. Uniqueness is
device_id + support_message_id; FCM tokens shared by distinct accounts are not
globally deduplicated. Before each send/retry recheck actual device/token, user,
tool/2FA access, preference, expiry and lease attempt. DB/eligibility failure
defers sending; never fail open. Retry cannot extend persisted expiry.

Worker and preference PUT share a PostgreSQL session advisory lock per user on a
dedicated pooled connection. Worker holds it through eligibility, awaited FCM send
and conditional finalize. PUT waits, commits disabled + cancellation of pending/
retry/processing rows, then returns. Lock acquisition waits at most five seconds;
a busy response does not claim a successful opt-out. Successful opt-out means no **new send attempt**
starts afterwards; an already started/accepted FCM request cannot be recalled.
Crash drops the session lock. Unlock failure destroys the connection rather than
returning a possibly locked session to the pool. No Promise.race timeout releases
the gate while work continues. Support transport refreshes the Admin credential
outside the gate (30-second wait limit), then performs one FCM HTTP v1 request
with AbortSignal.timeout(30 seconds), with no SDK internal send retries. Existing
push kinds retain their current Admin transport. DB gate statements time out at
five seconds. Lease is renewed under the gate before sending; finalize checks
attempt ownership. Crash can still leave an accepted external request ambiguous.

FCM is not exactly-once: crash after acceptance before DB ack can cause retry.
pushId stays identical. Android tag and APNs collapse ID are `mt-sc-` + base64url
SHA256(deploymentId + ':' + deviceId + ':' + pushId). Foreground local notifications
use the same stable identity and persistent pushId dedup through expiry. The OS
can replace an existing notification, but dismissal/retry can still re-alert;
do not promise exactly-once display or receipt. SSE never independently alerts.

## Flags, rollout, rollback and verification

- MOBILE_SUPPORT_CHAT_API_ENABLED defaults true; set false during coordinated rollout.
- MOBILE_SUPPORT_CHAT_PUSH_ENQUEUE_ENABLED defaults false.
- MOBILE_SUPPORT_CHAT_PUSH_SEND_ENABLED defaults false.
- Existing MOBILE_PUSH_ENABLED is also required for the live Firebase worker.

Stop/drain all old API writers/workers, migrate, deploy new backend + web with push
flags false. Test v1 API, web, capability registration, then deploy Flutter. Verify
**all** workers explicitly understand the new kind (old worker falls back to
device_revoked). Enable send on every worker first, then enqueue on every producer.
No new support rows may exist while an old worker can claim them.

Rollback: disable enqueue on all producers and drain active transactions; disable
send and stop/join workers; cancel all unsent support rows before any old worker
starts. Keep additive schema and use the compatible release with features off as
the rollback target. Arbitrary pre-v1 API writers are not a supported rolling
rollback for ordinal/read semantics; v1 API must be off if they are used. Never
edit an applied migration or discard message/preference data.

Required tests: auth and 2FA changes, opt-out across web/mobile, no auto opt-in,
duplicate visitor/operator requests, long history/cursor scope/microseconds,
shared bounded read and out-of-order acknowledgments, safe old registration,
multi-account routing, retry expiry/invalid token, flags, lease fencing and
crash-after-send stable IDs. Real PostgreSQL tests must prove row/advisory lock
blocking and commit ordering; pg-mem cannot validate those properties.

Run the PostgreSQL suite only against a disposable loopback database whose name
starts with `mt_support_contract`; it resets test subscription/outbox state:

```powershell
$env:SUPPORT_TEST_DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:<test-port>/mt_support_contract'
node --import ./tests/test-env.js --test tests/support-chat-concurrency.postgres.test.js
```

The shared-token/two-account recipient assertion runs on real PostgreSQL (including
an unassigned operator). Browser E2E `tests/e2e/online-support.spec.ts` independently
checks visitor send, operator reply and session restore on desktop and mobile with
each surface's UA + viewport. Embedded DOM/selectors are unchanged. A real Android
foreground/background/terminated delivery check belongs to the Flutter integration
stage; no live Firebase delivery or deployment is performed by these tests.
