# Horoshop related products tool — working requirements

Status: draft. Initial requirements recorded on 2026-08-13 and extended with the Codex-driven
catalog workflow on the same date. This document is intentionally incomplete and will be extended
as the product workflow is clarified.

## Objective

Build a convenient MT Workspace tool for managing accessory relationships in the external
Horoshop store. The tool must analyze the synchronized Horoshop catalog, propose relevant
accessories for products, let an authorized user review and quickly apply those proposals, and
send the confirmed relationships back to Horoshop.

This is a separate business capability from the existing local used-smartphone catalog and from
the planned intelligent-search administration UI.

## Confirmed catalog integration scope

- Synchronize the complete Horoshop product catalog through the API.
- Include product modifications/variants and preserve both parent-product and modification
  identifiers exposed by Horoshop.
- Synchronize the category hierarchy needed to select complete accessory sections.
- Preserve stable Horoshop identifiers so repeated synchronization and write-back operations are
  idempotent.
- Keep this external catalog separate from all `used_smartphone_*` tables and local storefront
  behavior.
- Read the currently assigned accessory sections and individual accessory products when the
  Horoshop API exposes these relationships.

The live authentication response and token lifetime, pagination, locales, product/modification
schema, relationship export, rate limits, and effective role permissions must be verified against
the real account with non-destructive API calls before implementation.

## Integration administration and authentication

Horoshop must be shown as a separate integration card on the existing MT Workspace administration
page for integrations. It is not configured with a user-supplied API key.

The connection form must contain:

- Horoshop store domain/base URL;
- dedicated Horoshop administrator login;
- dedicated Horoshop administrator password;
- connection status, last successful check, and a concise error/status message;
- an explicit `Перевірити підключення` action before enabling synchronization or write-back.

According to the current official Horoshop API documentation, API credentials are created in the
store administration panel under `Налаштування → Адміни`. The backend authenticates against the
store's `/api/` gateway using that login and password. The `auth` function returns an authorization
token, and subsequent API functions receive that token. This generated token is not a permanent API
key that an administrator copies into MT Workspace.

The official Horoshop Base integration guide instructs users to create a separate administrator
with the `Owner` role and use that administrator's login and password. The first implementation
should recommend a dedicated `Owner` integration account because it is the documented compatible
configuration. A less privileged role may be supported only after a live capability check proves
that it can read the complete catalog and update product accessories through `catalog/import`.

The saved password must be encrypted at rest, accepted only over HTTPS, excluded from logs and
audit payloads, and never returned to the browser after saving. Reopening the integration form must
show only that a password is configured and provide a separate replacement flow. Authorization
tokens are server-side transient credentials: they must not be persisted in plaintext, returned to
the client, placed in Codex prompts, or written to proposal/export files. Authentication should be
renewed when a token expires or Horoshop returns an authorization failure.

The connection check should authenticate and perform safe read-only probes against the catalog and
category endpoints. It must report authentication and insufficient-permission failures separately.
Write access must not be tested by silently mutating a real product.

## Confirmed Horoshop relationship model

The Horoshop product administration card contains an `Аксесуари` subsection inside the
`Супутні товари` / `Пов'язані товари` area. It supports two accessory assignment modes:

1. select and add an entire catalog section;
2. find and add a specific desired product by name.

The MT Workspace tool must represent these as distinct relationship types rather than flattening
both operations into an unstructured list.

The official `catalog/import` contract confirms the same two representations in
`products[i].accessories`: an individual accessory can be supplied by product article, while an
accessory section can be supplied by its path or stable page ID. Horoshop documents this field as a
full replacement of the product's existing accessories, not an append operation.

Therefore every publish operation must read or use a freshly synchronized current relationship
set, merge preserved manual relationships with the validated proposal according to the selected
operation policy, and send the complete intended accessory array. Publication must fail on a stale
snapshot or unverifiable current state rather than risk deleting relationships created directly in
Horoshop.

## Confirmed tool workflow

1. Load products, modifications, categories, and existing accessory assignments from the
   synchronized Horoshop catalog.
2. Run a recommendation algorithm that proposes suitable accessories for a selected product or
   modification.
3. Show why each accessory section or individual product was proposed and whether it is already
   assigned in Horoshop.
4. Let an authorized user select, reject, or adjust proposals before they are applied.
5. Send explicitly confirmed accessory relationships to Horoshop through the API.
6. Refresh the local relationship state from Horoshop and show the result of the operation.
7. Record an audit entry containing the actor, target product/modification, relationship type,
   previous state, requested state, Horoshop response status, and timestamp.

Recommendations are created as a durable proposal batch before publication. A user's Codex request
may explicitly authorize analysis and publication together; in that mode, validated proposals are
sent to Horoshop in the same Codex task without requiring approval of every product individually.
A request that asks only for analysis, preview, or a draft must never write to Horoshop.

## Codex-driven catalog workflow

The primary desired workflow is conversational and project-scoped:

1. The Horoshop catalog and its modifications have already been synchronized into PostgreSQL.
2. In this or another Codex task opened for the project, the user sends a short instruction or
   attaches a campaign/merchandising brief in a supported file format.
3. Codex analyzes the current catalog snapshot and selects the strongest accessories for every
   product in the requested scope by optimizing compatibility, customer usefulness, current
   availability, and catalog popularity.
4. Codex writes a structured, versioned proposal batch that can be validated, audited, retried, and
   reproduced independently of the chat history.
5. Deterministic validation rejects invalid product IDs, incompatible or unavailable candidates,
   duplicates, excessive relationship counts, stale catalog versions, and forbidden replacements.
6. If the initiating request explicitly authorizes publication, Codex invokes the controlled
   write-back command and the application pushes the validated batch to Horoshop immediately.
7. The application reads the resulting relationship state back from Horoshop and reports complete,
   partial, skipped, and failed operations to Codex and the admin UI.

`Immediately` means within the same explicitly authorized Codex task after validation. It does not
mean that background application code may call Codex or publish new AI decisions without a user
request.

### Cross-task repeatability

The workflow must not depend on one chat remembering another chat. It should be packaged as a
repository-local Codex skill plus a narrow project CLI (or an equivalent project tool) so that any
Codex task opened against the repository can follow the same rules and operate on stable data
contracts.

The Codex-facing command surface should separate read and write capabilities. A preliminary shape
is:

```text
horoshop-accessories status
horoshop-accessories catalog snapshot --output <file>
horoshop-accessories catalog product <external-id>
horoshop-accessories candidates generate --scope <scope> --output <file>
horoshop-accessories proposals validate <file>
horoshop-accessories proposals publish <file> --expected-snapshot <version>
horoshop-accessories runs show <run-id>
horoshop-accessories runs rollback <run-id>
```

The final invocation names and input format remain open. Secrets must be resolved server-side or
from protected local configuration and must never be placed in the chat, prompt, proposal file, or
command output.

### Large-catalog analysis

Codex must not receive one uncontrolled dump of the full production catalog in its context. The
tool should expose compact snapshots, candidate subsets, exact reads by stable ID, and file-backed
batch outputs. Analysis may be processed in deterministic chunks, but a final global validation
must check coverage and cross-product consistency before publication.

Each proposal batch must include at least:

- stable batch ID and schema version;
- tenant/store ID and immutable catalog snapshot/version;
- initiating actor and source Codex task/run when available;
- the user's objective and supplied brief reference;
- target parent product or modification ID;
- relationship type: accessory section or individual accessory product;
- selected category/product IDs and ranking order;
- score, confidence, reason, evidence fields used, and any warnings;
- existing relationship state and intended operation (`ADD`, `KEEP`, `REPLACE`, or `REMOVE`);
- validation state, publish state, Horoshop response, and rollback information.

## Recommendation strategy

The first version has four optimization signals: compatibility, customer usefulness, current
availability, and catalog popularity. It does not require order baskets, margin, attach-rate,
conversion, or return data.

A hybrid approach is required:

1. Deterministic candidate generation and hard exclusions use category, characteristics,
   compatibility, brand/model, availability, modification data, price boundaries, existing links,
   and explicitly configured merchandising rules.
2. Codex evaluates the narrowed candidates, resolves ambiguous catalog language, compares product
   use cases, ranks the best accessories, and records an explanation and confidence.
3. A deterministic scorer combines compatibility, usefulness, availability, and popularity using
   explicit, versioned weights.
4. Final validators enforce compatibility, relationship limits, freshness, coverage, manual locks,
   and write-back safety before any Horoshop mutation.

The default priority is:

1. **Compatibility is mandatory.** An accessory that cannot be confirmed as compatible is excluded
   or held for manual review and cannot be auto-published.
2. **Usefulness drives ranking.** Accessories should solve a realistic adjacent customer need for
   the target product rather than merely share keywords or a category.
3. **Availability gates publication.** Out-of-stock or inactive products are not auto-published.
   Incoming products may be considered only under an explicit store policy.
4. **Popularity breaks ties and boosts proven catalog choices.** Popularity must never override
   incompatibility or low usefulness.

This score is a merchandising proxy intended to support additional sales, not a claim of measured
revenue maximization. Commercial analytics may be added later without being a dependency of the
first version.

Existing manually curated relationships should be preserved by default. Replacing or removing
them requires an explicit operation policy in the user's request or a separately approved
merchandising rule.

## Recommendation requirements captured so far

- The algorithm must operate on the external Horoshop catalog, including modifications.
- It must be able to recommend either a whole accessory section or particular products.
- Recommendations must always be inspectable, even when an explicitly authorized task publishes
  them automatically after validation.
- Existing assignments must be detected so the tool does not create duplicate work.
- The same repeatable workflow must work from this Codex task or another task opened against the
  repository.
- Codex is an offline, user-invoked decision stage and is not part of the production application's
  runtime request path.

## Architecture constraints

- Horoshop remains the commercial source of truth.
- PostgreSQL stores a normalized synchronized mirror, relationship state, proposal state, sync
  history, and audit history.
- The implementation must reuse shared authentication, access control, validation, error handling,
  PostgreSQL, and audit conventions without coupling to the local smartphone catalog.
- Horoshop credentials remain server-side, encrypted at rest, absent from logs, and are never
  returned to the browser after saving.
- Horoshop authentication tokens are acquired and refreshed only by the backend and are never
  browser-delivered configuration.
- Write-back must be retry-safe and must not silently report success when Horoshop rejects or only
  partially applies an operation.

Because the Horoshop catalog will support more than one MT Workspace capability, the catalog
connector and normalized mirror should be designed as a reusable Horoshop integration boundary.
Search indexing and related-product recommendations can consume explicit catalog contracts without
owning or duplicating the external catalog independently.

## Open questions for the next requirements iteration

- Which Horoshop fields should define popularity when more than one signal is available?
- How should products marked as incoming or temporarily unavailable affect recommendations?
- What default maximum number of individual accessories and accessory sections is allowed per
  product?
- Should the default Codex command analyze the entire active catalog or require an explicit scope?
- Should users be able to remove and replace existing Horoshop relationships as well as add them?
- Are accessory relationships assigned to a parent product, an individual modification, or both?
- Which file formats should be accepted for a merchandising brief, and is a file optional when a
  natural-language request contains all constraints?
- What project roles may issue a Codex request that includes immediate publication?
- How should conflicting existing sections and individually assigned products be handled?
- Does the real Horoshop API expose both relationship assignment modes for reading and writing?
