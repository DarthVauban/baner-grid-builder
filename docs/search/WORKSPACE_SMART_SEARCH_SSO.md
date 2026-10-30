# MT Workspace provider for Smart Search

The provider implements the separate Search client's `WORKSPACE_AUTH_INTEGRATION.md`
contract. Analytics, the Search repository/database/deployment, and public storefront
search remain outside this change. Implementation and local contract verification do
not constitute live integration acceptance or production approval.

## Development registration and operator handoff

The repository's development deployment origin is **https://dev.mt-panel.sbs**
(`.github/workflows/deploy.yml` selects `/opt/mt-workspace/dev`, `mt-panel-dev`, port
3101; the documented development origin is also used by mobile configuration).
This is the intended provider origin, not a claim of a completed live SSO test.

Provision the following **server-only** Workspace settings through the deployment
operator's approved secret mechanism:

```dotenv
SMART_SEARCH_SSO_CLIENT_ID=smart-search-dev
SMART_SEARCH_SSO_CLIENT_SECRET=<dedicated random 32-byte base64url secret>
SMART_SEARCH_SSO_REDIRECT_URI=https://smart-search.mt-panel.sbs/auth/workspace/callback
```

The provider source does not generate, print or install a client secret. Operational
provisioning is separate; its verified dev status is recorded in the handoff below.
Operators must deliver the same dedicated value to both services using an approved
secret channel. Never commit or print it, or reuse JWT/database/Horoshop credentials.
The existing Workspace Compose app already reads server settings through its env
file; no Compose or server resources need changing for this implementation.

Client IDs must match `[A-Za-z0-9_-]{3,100}`, and secrets must match
`[A-Za-z0-9_-]{43,128}`. The configured callback must be canonical HTTPS with exact
path `/auth/workspace/callback`, without credentials, query, or fragment. An absent,
partial, or malformed registration closes SSO with 503 and leaves ordinary Workspace
login/tools available. There is one explicitly configured client per deployment;
development registration never creates a production client. Production requires a
separate ID, secret, exact callback, and explicit acceptance.

The Search operator separately supplies these exact settings in its owner-only,
mode-600, regular non-symlink `.search-platform-workspace-auth.env` in the audited
marker-owned Search directory:

```dotenv
WORKSPACE_AUTH_ORIGIN=https://dev.mt-panel.sbs
WORKSPACE_AUTH_CLIENT_ID=smart-search-dev
WORKSPACE_AUTH_CLIENT_SECRET=<the same dedicated secret>
```

The Search file must contain exactly these three newline-terminated, unquoted lines.
The existing Search database/encryption secrets file must remain unchanged. This
handoff does not authorize edits to Search or a production deployment.

## Transport and UI contract

All provider endpoints use the Workspace origin above:

| Method | Path | Authentication |
| --- | --- | --- |
| GET | `/api/integrations/smart-search/authorize` | Full Workspace login |
| POST | `/api/integrations/smart-search/token` | Dedicated HTTP Basic client |
| POST | `/api/integrations/smart-search/introspect` | Dedicated HTTP Basic client |
| POST | `/api/integrations/smart-search/revoke` | Dedicated HTTP Basic client |
| GET | `/api/integrations/smart-search/entry` | Full Workspace login |

Authorize accepts exactly seven unique scalar query parameters: `response_type=code`,
registered `client_id`, exact `redirect_uri`, `scope=smart-search:admin`, 43-character
base64url `state`, `code_challenge_method=S256`, and 43-character base64url
`code_challenge`. Invalid input is a local 400, never an untrusted redirect. Anonymous
requests continue through `/login?returnTo=...`, retaining only the validated local
authorize path. The client repeats this strict local-path validation and performs
document navigation only after full password/2FA/passkey/mobile/QR authentication.
State/challenge survive unchanged; challenge JWTs cannot authorize.

Back-channel endpoints accept only `application/x-www-form-urlencoded` with exactly
the documented fields and `Authorization: Basic base64(client_id:client_secret)`.
They never require a Workspace cookie or redirect to login. Responses are unwrapped,
small JSON with `Cache-Control: no-store`; credentials fail with 401, invalid grants
with 400, and dependency failures with 503. Introspection returns only `active`,
`client_id`, stable string `sub`, `aud=smart-search-admin`, `scope=smart-search:admin`,
and integer Unix `exp`, or only `{ "active": false }`. Revoke returns an idempotent
empty 200 and cannot revoke another client's records or Workspace sessions.

Forms and authorize query input are limited to 4 KiB and an exact parameter count.
Authorize/token/revoke are limited to 120 requests per IP per minute, introspection
to 1200. No credentialed browser CORS is installed on these routes. Basic credentials
are compared through constant-time SHA-256 digests. SSO error handlers log fixed
event names only, never raw DB exceptions, request queries, forms, headers, or tokens.
No request logger exists in the application; the external proxy was not changed.
Before enabling live SSO, its operator must audit ownership and disable/redact query
strings on authorize, login `returnTo`, and Search callback access logs, including
upstream error logs. Do not enable request/body/header debug logging.

Every approved, fully logged-in user can see the separate **Розумний пошук** entry on
the tools page. No new tool grant or admin-only restriction is added. Existing tool
2FA requirements remain unchanged. The entry API returns standard Workspace
`{ data: { url } }` with only the configured HTTPS Search `/auth/workspace/login`
URL, or null while unconfigured. It never exposes a client secret or starts a provider
flow without Search's state/PKCE transaction.

## Durable session binding and revocation

Migration **103_smart_search_sso.sql** adds sessions, codes, tokens, and a safe audit
table, with FK/check constraints and hash/client/expiry indexes. The migration runner
wraps it transactionally. No existing migrations or user runtime data are changed.

The parent is SHA-256 of the verified full login JWT, bound to its subject and signed
expiry. New full login JWTs carry `purpose=workspace_access`, `aud=mt-workspace`, and a
random `jti`, so simultaneous new logins in separate browsers are distinct. Existing
full login JWTs without purpose/audience remain valid; challenge JWTs and tokens
without a trusted expiry are rejected. Legacy identical JWTs issued for the same
user in the same second cannot retrospectively be distinguished; subsequent logins
use unique IDs. Host-only HTTP-only Workspace cookie scope remains unchanged.

Authorize and logout insert/lock the same parent row. Exchange locks the parent
before locking/consuming the code. Logout persists a tombstone even before the first
SSO use, revokes that parent's children, and retains the tombstone until parent expiry.
Thus replay cannot recreate a live binding, and concurrent code/token issuance cannot
survive a committed logout. Logout of one distinct parent leaves other browsers live.
A failed durable revocation returns 503 and preserves the cookie so logout can be
retried. The UI also retains the authenticated state, reports the failure, and
leaves logout available for retry. Anonymous and repeated successful logout remain
idempotent.

Only random codes/tokens are sent to Search. Durable storage contains their SHA-256
hashes. Codes live at most 60 seconds. Tokens live at most 3600 seconds, rounded down
to the remaining parent lifetime; no refresh token is issued. Each introspection
joins the current approved user and unexpired/unrevoked parent and token. There is
no positive authorization cache, including after account blocking. Errors fail closed.
PostgreSQL transactions use 2-second statement and 1-second lock timeouts.

A once-per-minute worker removes at most 100 expired codes, tokens, child-free
parents, and audit entries older than 90 days per table/run. Tombstones are not
removed before signed parent expiry. Internal audit actions have only action names,
actor IDs, and record IDs, without free-form secret/PII payloads.

## Verification and remaining acceptance

Run the standard `npm run verify`. Focused provider/JWT contract coverage:

```powershell
node --import ./tests/test-env.js --test tests/jwt.test.js tests/smart-search-sso.integration.test.js
```

The default isolated pg-mem suite exercises HTTP S256/Basic/form encoding, unwrapped
JSON, full TOTP login, validation, replay/expiry, blocking, logout/tombstones and browser
isolation, safe serialization/errors, configuration failures, bounded cleanup, and
fresh-application access to persisted records. pg-mem does not prove PostgreSQL row
locks or process-restart durability. The PostgreSQL-only cases exercise concurrent
exchange/logout races and introspection from independent Node processes before and
after logout and parent-JWT replay. To run all cases, provide an **empty disposable
PostgreSQL database**:

```powershell
$env:SMART_SEARCH_SSO_TEST_DATABASE_URL = '<disposable PostgreSQL connection URL>'
node --import ./tests/test-env.js --test tests/smart-search-sso.integration.test.js
```

The runner applies all migrations and creates test records; never point it at a
shared/development/production database. Coordinated live browser login, parent
logout/account block causing the next Search API 401, and anonymous
storefront-widget independence must still be accepted with both services configured.
Production gate remains pending until these checks and proxy log redaction pass.

Local verification on 2026-10-30: all **22 provider tests passed on PostgreSQL 16.15**,
including actual concurrent requests, independent processes, and deleted-account
logout. The final pg-mem run passed all 19 applicable cases with three PostgreSQL-only
cases skipped. The broader server suite passed 327 tests with zero failures before
the final deleted-account case was added. All 99 frontend suites / 377 tests passed
with `npm run test:web -- --maxWorkers=2`; the initial parallel `verify` run had one
10-second timeout in the unchanged `PopupBannersPage` test. Lint/TypeScript passed;
the existing PopupBannersPage hook warning and jsdom CSS parse warnings remain.
Build validation directs Vite output to a new task-owned `tmp/` directory using
`npm run build -- --outDir ../tmp/<unique-build-directory>` to preserve `dist/`.

## Dev operator preflight and acceptance handoff (2026-10-30)

This is a preparation report, not live acceptance. No real SSO login, account
blocking, secret generation, or Search-side mutation was performed during this
preflight. Production configuration and its gate remain unchanged.

Verified live target:

- Origin: `https://dev.mt-panel.sbs`, resolving to `45.88.191.194` at audit time.
- Physical directory: `/opt/mt-workspace/dev`, no symlink, owned by root, mode 2770.
- Deployment user: `mtdeploy`, UID 1000. Runtime `.env` belongs to this user, is a
  regular non-symlink file, and has mode 600. Its contents were never printed.
- Docker socket: `/run/user/1000/docker.sock`; labels identify project
  `mt-panel-dev`, service `app`, working directory `/opt/mt-workspace/dev`, and
  config `/opt/mt-workspace/dev/docker-compose.yml`.
- App bind: `127.0.0.1:3101` to container port 3000. `/api/health` returns 200 and
  build SHA `16bc011f800295674d933d44c6f73a18b5edaf23`.
- Public `/api/auth/login/qr/config` returns deployment environment `development`.
  This check does not create a login challenge.
- Migration 103's ledger row has not been directly queried. Automatic approval
  review rejected read-only container execution, referring to the separate Search
  repository's container restriction. The later approved external operator checks
  instead verified the configured, restarted provider through real database-backed
  introspection, code lookup and revocation HTTP paths. Schema availability is
  verified through those paths; the ledger row is not claimed as directly read.
  No alternative container-entry route was used.

Provisioning is **DEV WORKSPACE + SEARCH CONFIGURED / VERIFIED**. The initial
audit found all three `SMART_SEARCH_SSO_*` keys absent. The user subsequently
authorized direct coordination with the existing Smart Search agent. Both sides
confirmed no installed dedicated secret and agreed an operator-controlled channel:
one short-lived root-owned regular file (mode 600, no symlink/hardlink) inside a new
root-owned mode-700 directory under the audited Workspace dev directory, outside
Git. Search accepted read-only access to that exact transfer file through its
existing strict-known-host root SSH connection. It does not read Workspace `.env`,
database, other credentials or containers. Neither the value nor its hash is sent
in chat, argv, stdout, logs or screenshots. Verified import and bounded cleanup
have both completed; the temporary transfer file and its empty private directory
no longer exist.

Search first completed its own isolated callback logging and guarded app-only
readiness update, then explicitly paused all mutations. Only after that READY and
the Workspace preflight passed was **one** new dedicated value generated using
host Node `crypto.randomBytes(32).toString('base64url')`. Protected source metadata,
format and unchanged container snapshots passed. No second value was generated.

The existing Compose app consumes the server runtime `.env`; exporting host
variables or using Compose `--env-file` for interpolation alone does not inject new
keys into the running app. The operator procedure added exactly the three agreed
keys to `/opt/mt-workspace/dev/.env`, preserving every original byte, UID/GID
1000:1000, mode 600 and extended attributes. A root-only mode-700 backup directory
with a mode-600 original is retained under
`/opt/mt-workspace/dev/.sso-runtime-backup-51bbafbb-f654-4f43-9327-71a8c0636058/`.
The repository `.env` and all Search resources remain outside this agent's writes.

The current app image and public health build before/after provisioning are
`25551f52db55f34e6872cf9c6f78b7a538c65931`, a documentation-only successor of the
provider implementation. The only app recreation used the exact audited Compose
file/project and `up -d --no-deps --no-build --pull never app`, pinning that same
existing image and image ID. All 14 non-app containers retained their exact IDs,
images, StartedAt, health and ports around backup, env update and app recreation.
No database/Telegram/production/Search container was recreated by Workspace.

Compose 5.3.1's direct `config --hash` does not resolve `env_file` like `up`.
Before any generation or write, a read-only diagnostic proved one exact matching
resolved app model using canonical JSON passed through stdin, with no config or
hash output. An installed-CLI synthetic literal-dollar probe verified that escaped
values survive two different synthetic environments, while an unescaped negative
control changes the hash. The source-native escaped-model round trip was selected.
Only workflow-defined Telegram mode candidates were examined; the default model
matched, so **no Telegram override or other setting changed**. The same exact
resolved-model equality guarded apply, post-check and rollback. This method follows
the versioned [Compose config implementation](https://github.com/docker/compose/blob/v5.3.1/cmd/compose/config.go)
and [ServiceHash implementation](https://github.com/docker/compose/blob/v5.3.1/pkg/compose/hash.go).

Initial unauthenticated live smoke before provisioning:

| Check | Observed result |
| --- | --- |
| Workspace health | 200, expected provider build |
| Workspace token/introspect/revoke, synthetic form | 503 `temporarily_unavailable`, JSON, no-store, no redirect |
| Workspace `/api/auth/me` | 401 |
| Workspace SSO entry | 401, no-store |
| Search health | 200 |
| Search session | 401 `workspace_auth_required` |
| Search login | 503 while SSO is unconfigured |

Post-provisioning external HTTPS smoke is **PASS**. Basic credentials are read
only in process memory from the protected source, never command arguments/output:

| Check | Observed result |
| --- | --- |
| Correct Basic, random 43-character unknown token | 200, exactly `{ "active": false }`, real database lookup |
| Missing / wrong Basic credentials | 401 `invalid_client` |
| Correct Basic, valid-format unknown code/verifier | 400 `invalid_grant` |
| Correct Basic, unknown token revoke | 200, empty body |
| All back-channel smoke responses | no-store, expected unwrapped contract, no login redirect |
| Health and public native QR config | 200, expected same build, development native identity |
| Anonymous authorize with synthetic S256/state | 302 to exact local login/authorize return path; state/challenge preserved |
| Unregistered callback / duplicate state | Local 400 without redirect |

Short `unknown` strings were intentionally not used for introspection: they would
be rejected before the actual database lookup. No real user session, authorization
code, Search access token, native phone approval or account mutation was created by
these synthetic provider checks.

The active dev proxy is `/etc/nginx/sites-enabled/dev.mt-panel.sbs`, resolving to
root-owned `/etc/nginx/sites-available/dev.mt-panel.sbs` (mode 644). It contains only
the two dev HTTP/HTTPS server blocks and proxies to `http://127.0.0.1:3101`.
Before hardening, both blocks inherited combined access logging (`$request` and
Referer) and the shared error log. Three synthetic canary requests produced three
access-log matches; only counts were emitted, never raw logs.

Dev logging hardening is **APPLIED / PASS**. Only the two dev server blocks received:

```nginx
access_log off;
error_log /dev/null crit;
```

The policy covers both HTTP/HTTPS and inherited locations, preventing query strings
and Referer from reaching shared logs. Other dev proxy/TLS directives are byte-for-byte
preserved. Whole-vhost suppression also covers errors before an auth location is
selected; dev request/error diagnostics at Nginx are intentionally disabled.
Application audit records and fixed safe SSO event logging remain available.

The active master was verified as `/usr/sbin/nginx` with no custom config/prefix.
The guarded change passed ownership, exact-source-hash, extension-logging and
configuration checks; a root-only original and metadata backup is retained at:
`/opt/mt-workspace/dev/.sso-log-hardening-666586c8-a6eb-4b10-a778-6a88c0f9ef79/`.
That directory is mode 700; its original config and metadata files are mode 600.
The original file SHA-256 is
`71f748520828d4c69da4d6863ee05c9072e03ee7b7ae887a73c162ef4f7e80a6`;
the applied file SHA-256 is
`c5a5c88654128466f1859e0552b52215caf20f7f5151b6f950a1e92d3a829a6d`.

`nginx -t`, graceful reload, and the expected-build dev health check passed.
Before/after snapshots around backup, replacement, and reload confirmed all 15
running containers unchanged, including IDs, images, state, health, ports and
StartedAt. All 11 other loaded Nginx configurations retained their exact metadata
and hashes, including production and Search. No Docker exec or container mutation
was used for this hardening. The guard's 16 synthetic local checks also passed.

After reload, four synthetic requests covering authorize query, login returnTo,
HTTP redirect, and a Referer-bearing health request returned 503/200/301/200;
canary matches were **0 in access log / 0 in error log**. Effective-config audit
confirmed `off` / `/dev/null` on both dev vhosts and their locations. Raw configuration
and auth log lines were never emitted. Canary checks did not simulate an upstream
outage; error-log safety is established by its effective null destination.

Coordinated Search completion, reported and verified by its authorized agent:

- Audited dev directory `/home/mtdeploy/search-platform/dev`, user `mtdeploy`
  UID/GID 1000, project `search-platform-dev`, service `app`, loopback port 3201.
- Only its new `.search-platform-workspace-auth.env` was provisioned: regular,
  no symlink/hardlink, UID/GID 1000, mode 600, exactly the three agreed
  newline-terminated unquoted settings. Its existing database/encryption secrets
  were not changed. Workspace did not write any Search file.
- Guarded app-only deployment completed on Search build
  `e44e7540a2a504f31374a756af92767aa8374e4d`. Runtime SSO settings are active;
  its actual app's Basic-authenticated, random 43-character unknown-token lookup
  returned exactly 200 `{ "active": false }`. Missing/wrong client returned 401,
  unknown grant 400, revoke empty 200, with no-store. This confirms both installed
  clients use the same dedicated value without exposing or comparing it in chat.
- Own readiness CLI reported ready/catalog indexes ready with one store. Its
  guarded deployment preserved all 14 non-app containers and all 12 loaded Nginx
  configurations. The Search agent reported all 177 local checks passing.
- After its explicit verified-import/runtime ACK and renewed mutation pause,
  Workspace removed only the exact source file with its recorded inode/owner/mode,
  then its verified empty private parent. No content was read during cleanup.
  Separate before/after snapshots for unlink and rmdir preserved all 15 containers,
  including StartedAt, images, health and ports. No recursive deletion or secret
  rotation occurred. Each service retains only its required protected runtime copy.

Independent external anonymous Search protocol smoke also passed: health 200,
session 401/no-store, and login 302/no-store to the exact dev Workspace authorize
origin/path with registered client/callback/scope, valid state length and S256.
No cookies, query values, authorization headers or full response bodies were
printed, and no authenticated user login was performed.

Search's authorized operator subsequently confirmed its own **LOGGING PASS**:
only the two dev-domain blocks in `/etc/nginx/conf.d/smart-search.conf` were
hardened to the same off/null policy; nginx test, graceful reload, public health
and synthetic callback canary passed with zero matches. Its before/after guard
verified all 15 containers and all 11 other loaded config files unchanged. Workspace
did not edit any Search resource. Both sides' standard access/error-log verification
is therefore complete; real user sign-in remains a separate phone-assisted step.

The user clarified that **there is no test mailbox and sign-in uses only the
proprietary MT Workspace authenticator**. The earlier mailbox/TOTP preparation
assumption is withdrawn. Do not create email/TOTP test users, change authentication
policy, emulate phone signing, or introduce a fallback to complete acceptance.
Historical password/TOTP contract-test coverage above is not the live sign-in plan.

The user confirmed an existing **DEV profile is available in the proprietary
authenticator**. Account preparation still needs verified identities/roles for
non-admin approved A and a separate approved admin B, plus the phone owner's
participation. No account identity, 2FA readiness, or usable browser session has
yet been established by the agents. Native pairing binds an existing user; it does not create
one. No supported native mailbox-free user-creation endpoint was found, so missing
profiles require the existing approved onboarding process rather than a workaround.

The current firm-auth preparation/acceptance contract is:

- Confirm `GET /api/auth/login/qr/config`: QR enabled, deployment
  `mt-workspace-development`, environment `development`, webOrigin
  `https://dev.mt-panel.sbs`. This metadata read creates no challenge.
- Browser `POST /api/auth/login/qr` creates the short-lived challenge. The owner
  scans the normal page QR with the proprietary app and selects the dev profile.
  Phone `/api/mobile/qr-login/preview` and `/approve` require its active device and
  an ES256 signature bound to the deployment, action, challenge and nonce. Do not
  extract or simulate the phone's credentials.
- Browser `/api/auth/login/qr/status` remains pending/scanned without a full cookie.
  `/api/auth/login/qr/consume` creates the full session only after native approval
  and rechecking the active device/current approved user. Create two independent
  fresh native-approved browser logins; never copy cookies between contexts.
- From an existing permitted session, project only safe fields from
  `GET /api/auth/me`, `GET /api/users/profile/2fa`, and
  `GET /api/users/profile/mobile-devices`: internal IDs, role, status, enabled
  method, active-device count and QR-signing support. A must use method
  `mt_workspace` and have an active QR-capable device. Do not print full profiles,
  device tokens, live QR data or any credential/recovery response.
- Later block/restore from admin B: `PATCH /api/admin/users/<A_UUID>/status` with
  `{ "status": "rejected" }`, then `{ "status": "approved" }`. There is no
  `blocked` status, and self-blocking is rejected. Do not block A during preparation.
- A non-approved status revokes **all** mobile grants and cancels pending pairings,
  mobile approvals and approved QR challenges. Restoring approved restores account
  status only. Do not run the block test against an employee's real profile.
- An unexpired A browser cookie can authenticate again after approved is restored,
  but cannot by itself restore a revoked phone. Supported own-account
  `POST /api/users/profile/mobile-pairings` with `purpose=add_device` requires a
  valid code from the existing firm-app account secret or an unused recovery code.
  No supported admin device-reactivation/2FA-reset override was found. Whether the
  app retains/displays its confirmation code after revocation is not established
  by this repository. Keep block/restore acceptance **BLOCKED** until a dedicated
  dev profile has a proven approved recovery procedure; do not assume a second
  phone, pre-created pairing, or restoring status alone is sufficient.

Local preparation checks passed: 44 JWT/provider/deployment tests, zero failures;
three PostgreSQL-specific cases were explicitly skipped in this pg-mem run. The
previous real-PostgreSQL provider evidence remains the separate 22/22 result above.
The current native QR and mobile-security cleanup suites also passed all 15 tests
with zero failures; these isolated test fixtures do not replace phone approval.
Full Search login/logout, other-browser isolation, blocking/restoration, Search
revoke, and interactive storefront-widget acceptance remain pending. Reported
public HTTP widget/config/query smokes are distinct from that browser acceptance.
The owner must complete normal QR approval with the proprietary DEV profile for
the first real sign-in. Phone approval, account IDs/roles and recovery capability
must not be inferred from service-to-service smoke results.

The final documentation-only handoff commit uses `[skip ci]` to avoid starting
another automatic deployment during the coordinated freeze/phone-assisted handoff.
That commit changes only documentation; application and workflow source are unchanged. See
[GitHub's push-workflow skip documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).
