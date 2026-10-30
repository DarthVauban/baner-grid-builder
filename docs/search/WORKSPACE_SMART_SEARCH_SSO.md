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

No secret is generated, printed, committed, or installed by this change. An operator
must generate the dedicated secret and deliver the same value to both services using
an approved secret channel. Do not reuse JWT, database, or Horoshop credentials.
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
- Migration 103 has not been directly queried in the live database. Automatic
  approval review rejected read-only container execution, referring to the separate
  Search repository's container restriction. No alternative container-entry route
  was used. Direct verification remains an operator/approval dependency.

Provisioning is **BLOCKED pending coordination**. All three `SMART_SEARCH_SSO_*`
keys are absent from the audited dev runtime file. This does not establish whether
an uninstalled dedicated secret already exists in an operator's secret manager.
No approved transfer channel, receiving Search operator, or credential/TOTP vault
has been confirmed. Do not generate a new secret until those prerequisites hold,
and do not rotate a previously issued dedicated secret unilaterally.

The existing Compose app consumes the runtime `.env`; exporting host variables or
using Compose `--env-file` for interpolation alone does not inject new keys into
the running app. The operator must preserve unrelated runtime settings and use an
approved scoped dev provisioning/recreate procedure. The repository `.env` and all
Search resources remain outside this agent's provisioning scope.

Unauthenticated live smoke:

| Check | Observed result |
| --- | --- |
| Workspace health | 200, expected provider build |
| Workspace token/introspect/revoke, synthetic form | 503 `temporarily_unavailable`, JSON, no-store, no redirect |
| Workspace `/api/auth/me` | 401 |
| Workspace SSO entry | 401, no-store |
| Search health | 200 |
| Search session | 401 `workspace_auth_required` |
| Search login | 503 while SSO is unconfigured |

The authenticated Basic smoke with an unknown synthetic token must still be run
after provisioning: expected 200 with only `{ "active": false }`, unwrapped and
no-store. Never place the Basic value in command arguments or diagnostic output.

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

Search callback-log redaction is separately **UNCONFIRMED** and belongs to its
operator. Real SSO must not start until both sides pass logging verification.

Dedicated account preparation is **BLOCKED** until controlled dev account ownership,
inbox access, an authorized admin session, and secure password/TOTP storage are
confirmed. No account IDs, roles, 2FA readiness, or usable browser sessions have
been claimed or changed. The exact existing preparation/acceptance contract is:

- Register through `POST /api/auth/register`, then `POST /api/auth/register/verify`
  with the code delivered to the controlled inbox. Development deployments do not
  expose a test verification code. The current default role is `content_manager`,
  a non-admin role, and verified registration becomes approved.
- Use a separate authorized admin B. If a dedicated admin must be created, its
  promotion uses the existing `PATCH /api/admin/users/<UUID>/role` contract with
  `{ "role": "admin" }` after normal registration; never use direct SQL.
- Account A uses real TOTP via the current `/profile` flow. Setup/confirmation
  responses contain seeds, QR data, or recovery codes and must not be printed,
  captured in screenshots, or stored outside the approved credential vault.
- Safe 2FA status: `GET /api/users/profile/2fa`. Password login returns 202 without
  a full cookie while a second factor is pending; successful
  `POST /api/auth/login/2fa` completes the session. Create two independent fresh
  browser logins, never copy a session cookie.
- Later block/restore from admin B: `PATCH /api/admin/users/<A_UUID>/status` with
  `{ "status": "rejected" }`, then `{ "status": "approved" }`. There is no
  `blocked` status, and self-blocking is rejected. Do not block A during preparation.
- A non-approved status also revokes mobile access, and restoring approved does
  not restore mobile grants. A must therefore be a dedicated TOTP test account
  without paired mobile devices. Record/restore its initial approved status during
  the separate coordinated acceptance run.

Local preparation checks passed: 44 JWT/provider/deployment tests, zero failures;
three PostgreSQL-specific cases were explicitly skipped in this pg-mem run. The
previous real-PostgreSQL provider evidence remains the separate 22/22 result above.
Full Search login/logout, other-browser isolation, blocking/restoration, Search
revoke, and anonymous widget acceptance remain pending.
