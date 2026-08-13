# MT Workspace project instructions

## Working agreement

- Preserve the existing modular-monolith architecture: Express modules live in `src/modules`, PostgreSQL changes are append-only SQL migrations in `src/migrations`, and the React workspace lives in `client/src`.
- Use the existing npm workflow. Do not convert this repository to a monorepo or another package manager unless the user explicitly approves a migration.
- Before changing a public contract, update validation, serialization, client types, the API client, and the relevant integration or E2E tests together.
- Run focused tests while iterating and `npm run verify` before handoff when practical. Report pre-existing warnings separately from regressions introduced by the change.
- Never edit `.env`, generated `dist/`, `storage/`, `test-results/`, or user-owned runtime data.
- Never edit an already-applied migration. Add a new numbered migration and keep it transactional and compatible with the repository migration runner.
- Preserve unrelated user changes. Do not rewrite or delete existing catalog, storefront, deployment, or backup behavior while adding search functionality.
- After completing and verifying each requested change, stage only the files owned by that change, create a descriptive commit, and push it to the `dev` branch without waiting for a separate instruction.
- Do not monitor CI or deployment results after a successful push. Report the pushed commit; the user will report deployment failures separately.

## Search service boundaries

- The external Horoshop search catalog is a separate domain from `used_smartphone_*`. Do not reuse the local used-smartphone tables as the source of truth for Horoshop products.
- Reuse shared authentication, access control, audit conventions, error handling, PostgreSQL infrastructure, and the existing React workspace.
- Keep search code under `src/modules/search`, search UI under a dedicated area in `client/src`, and search documentation under `docs/search`.
- OpenSearch is a derived index. PostgreSQL is the source of truth for synchronized catalog metadata, linguistic rules, versions, proposals, and audit history.
- Runtime search must not depend on Codex, an LLM, or an external AI request.

## Linguistic data safety

- Never modify a published linguistic ruleset in place.
- Never replace a complete synonym, transliteration, protected-term, or morphology-exception dataset.
- Codex-generated changes must be written only as proposals under `search-linguistics/proposals/` or to a draft/proposal table.
- The default proposal operation is `ADD`. Existing behavior may change only through explicit `DEPRECATE`, `REWEIGHT`, or `RESCOPE` operations with evidence and a reason.
- Do not use `DELETE` for an approved or published linguistic rule unless the user explicitly authorizes deletion and rollback data exists.
- Do not edit bundled third-party morphology dictionaries. Project-owned morphology changes are limited to protected terms, lemma overrides, language overrides, and scoped exceptions.
- Every proposal must include a stable proposal ID, source, evidence, confidence, language, scope, and reason.
- Check approved, rejected, and deprecated rules before proposing a new rule. Do not repeatedly suggest a rejected rule without new evidence.
- Run structural validation and search relevance regression tests before publishing a ruleset. Block publication on critical golden-query regressions.
- Publishing requires an explicit user/admin action, creates a new immutable ruleset version, records an audit entry, and preserves a rollback path.
- Keep raw search-query exports out of Git. Redact emails, phone numbers, order identifiers, secrets, and other personal data before analysis.

## Search infrastructure safety

- The `search` Docker Compose profile is opt-in until the search module is production-ready. Do not add OpenSearch or Redis to the default deployment dependency chain prematurely.
- Pin infrastructure versions. Review upstream release notes, plugin compatibility, licenses, and security notices before upgrading.
- Do not expose OpenSearch or Redis publicly. Local development ports must bind to loopback only.
- Do not put Horoshop credentials, OpenSearch credentials, or encryption keys in source files, fixtures, logs, or browser-delivered configuration.

## Horoshop accessory review with Codex

- The application must not contain or execute an accessory recommendation algorithm. Accessory proposals are an admin-time Codex review workflow, not a runtime search dependency.
- When the user explicitly asks Codex to review the current Horoshop catalog, obtain `GET /api/search/horoshop/accessories/review/catalog` through the authenticated in-app browser. If that session is unavailable, use the JSON exported from the **Супутні товари Хорошоп** tool.
- Review products semantically from their titles, descriptions, categories, characteristics, price, availability, popularity, and modification tree. Do not fill recommendations merely to avoid an empty result.
- Return a `horoshop-codex-accessory-review/v1` proposal document with the unchanged `connectionGeneration` and `catalogRevision`. Include every active parent product exactly once, including `{ "recommendations": [] }` when nothing is sufficiently compatible and useful.
- Each recommendation must reference another active parent product ID, include a concise product-specific reason, and include Codex-authored `scores` for compatibility, usefulness, availability, popularity, and total confidence. These scores communicate Codex judgment for review and must never be calculated by application code. Keep at most 16 recommendations per product and prioritize compatibility, usefulness, availability, and commercial relevance through judgment rather than fixed weights or scoring code.
- Submit the completed document to `POST /api/search/horoshop/accessories/review/proposals`. A stale-catalog response requires a fresh export and review of affected data.
- Importing Codex proposals creates reviewable local suggestions only. Never publish them to Horoshop unless the user separately and explicitly asks to publish a reviewed draft.
