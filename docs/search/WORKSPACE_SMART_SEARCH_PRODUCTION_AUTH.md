# Production Workspace identity source for Smart Search

Operational evidence date: 2026-10-30. Workspace provisioning and provider checks
and Search configuration cutover are complete. Phone-assisted browser acceptance
and one-time source cleanup are tracked separately below.

## Scope and contract

The owner's later direct request in the Smart Search chat authorized switching
the existing Search service to production Workspace authentication. It superseded
the earlier dev-only integration scope for this authentication change. This is
not a full production promotion of Search: its deployment remains development,
and its production-readiness gate remains blocked.

- Identity provider: `https://mt-panel.sbs`.
- Dedicated client: `smart-search-prod`.
- Exact callback: `https://smart-search.mt-panel.sbs/auth/workspace/callback`.
- Search address: `https://smart-search.mt-panel.sbs`.
- Workspace's separate dev registration and dedicated dev key are preserved.
- Sign-in uses the normal proprietary MT Workspace authenticator. Do not create
  mailbox/TOTP users, copy browser cookies, or simulate phone approval.
- The existing contract permits approved users with a full authenticated
  Workspace session; it does not add an admin-only or tool-grant-only gate.

The production registration uses only `SMART_SEARCH_SSO_CLIENT_ID`,
`SMART_SEARCH_SSO_CLIENT_SECRET`, and `SMART_SEARCH_SSO_REDIRECT_URI`. Its new
dedicated secret was generated once on the server and never printed, hashed into
chat, placed in Git, or delivered to the browser. A protected one-time server
file is retained until the Search owner verifies import and the effective runtime.
Only its safe path/inode/ownership/mode/size metadata is exchanged operationally.

## Workspace release evidence

The provider was absent from the original production build
`d5f33f76a7abdcaabb045023b9b0ceb3247850c8`. The isolated candidate
`56c5c934a5b9b0725f8fb0bf69ead14e5418f5aa` adds the provider and its required
JWT/full-session/logout dependencies to that exact base. Source is persisted on
`main` through `01fa071de05f652a183c431bfbe0a1da9c18986f`; that source-only
commit uses `[skip ci]` and did not invoke the normal deployment workflow.

Build-only run `41089703172`, attempt 1, passed quality, E2E, and image-build gates,
including the PostgreSQL 16.14 upgrade check and Nginx 1.24 fixture. The downloaded
artifact, archive framing, configuration digest, and every layer payload were
verified. The candidate retains all ten original base layers and the original
runtime image configuration apart from build identity. CI and server Docker image
IDs were not assumed equal across different image-store implementations.

The guarded rollout recreated only Workspace's production app, retaining the old
image and private recovery state. It preserved all existing effective settings
apart from build identity and the three dedicated SSO settings. All fourteen other
containers and all twelve loaded proxy files were unchanged during app phases.
The standard deployment workflow was not used: its dependency, Telegram, storage,
and pruning operations exceed this limited authentication rollout.

Live read-only PostgreSQL checks confirmed the original exact ledger `001–101`,
then the exact candidate ledger `001–101 + 103`, no migration `102`, no pending
migrations, and all four SSO tables. These metadata probes used the existing own
database client and Unix socket; they did not extract passwords or read user rows.

## Logging and controlled verification stops

Only the production Workspace vhost logging policy changed. Its dedicated access
format excludes query arguments, Referer, Authorization, cookies, and request
bodies. TLS, routing, and all eleven other loaded configuration files were
preserved. Its vhost error log is suppressed with `/dev/null crit`; safe access
metrics and application/audit diagnostics remain. This does not claim universal
redaction of arbitrary URL paths or global/pre-vhost errors.

Three fresh-connection canaries recorded their synthetic path twice and query and
Referer markers zero times. All seven original Nginx worker identities were
preserved in the protected proof and subsequently confirmed exited. No workers
were forcibly terminated; registration rechecked actual drain before enabling SSO.

Strict operational checks stopped on three nonfunctional differences: natural
retirement of an old Nginx worker before reload, two Compose execution metadata
labels from `--no-deps` and `--env-file /dev/null`, and the ordering of three
identical unique bind entries. Each was diagnosed read-only and resolved using an
exact reviewed recovery. Prior shapes and explicit adoption records remain in
private state. No blanket metadata normalization, secret rotation, or extra app
restart was used for state completion. Actual mount details, environment, network,
permissions, and all unrelated resources remained equal.

## Live provider evidence and remaining acceptance

HTTPS health returned the candidate build and matching build header. Effective
runtime credentials matched the protected source in memory. A canonical 43-character
unknown token reached database-backed introspection and returned HTTP 200 with
`active: false`; invalid Basic credentials returned HTTP 401. Responses used
`no-store`. These checks created no user sessions and emitted no credential values
or hashes.

Search cutover passed in run `41125419809` using unchanged Search source `6ba6d25`.
The Search owner verified the production origin/client and protected key in the
actual new runtime, database/index connectivity, preservation of database and
encryption settings, all fourteen other container records, and all twelve proxy
files. Public widget/config/query checks returned HTTP 200; anonymous session was
401, and login returned 302 to the exact production authorize contract with S256
and a secure transaction cookie. No real user session was created by those probes.

Phone-assisted production login/logout is pending owner approval in the normal
production login page. Its QR is shown only in the browser, without reading or
forwarding its payload, codes, or credentials.

The Search import/runtime acknowledgement is verified. Automatic approval review
nevertheless rejected deletion of the one-time source because explicit human
permission to destroy that file was absent. No cleanup command executed, and no
alternate deletion mechanism was attempted. The source remains root-owned mode
600 under its private mode-700 parent; exact file/empty-parent cleanup is held for
owner permission. Required runtime copies and protected recovery state remain.

Account blocking is excluded from this production acceptance. Earlier dev work
established that rejecting a user revokes every mobile grant; restoring approved
status alone does not restore phone pairing. A dedicated dev profile and a proven
recovery procedure are required for that separate test. Other-browser isolation
and interactive storefront acceptance are also separate from these provider checks.

## Recovery boundary

The old production image, original runtime environment bytes, and original rendered
Compose model remain protected for rollback. Rollback was not executed on
production. It must remain app-only, preserve unrelated resources, and keep the
additive migration 103 rather than dropping its tables or ledger entry. Strict
metadata guards may require the same narrowly reviewed state reconciliation;
never infer permission to relax environment, mount, network, or image checks.
