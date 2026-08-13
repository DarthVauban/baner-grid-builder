# Horoshop related products tool — working requirements

Status: draft. Initial requirements recorded on 2026-08-13. This document is intentionally
incomplete and will be extended as the product workflow is clarified.

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

The exact Horoshop authentication, pagination, locales, product/modification schema, relationship
schema, rate limits, and supported write operations must be verified against the real account with
non-destructive API calls before implementation.

## Confirmed Horoshop relationship model

The Horoshop product administration card contains an `Аксесуари` subsection inside the
`Супутні товари` / `Пов'язані товари` area. It supports two accessory assignment modes:

1. select and add an entire catalog section;
2. find and add a specific desired product by name.

The MT Workspace tool must represent these as distinct relationship types rather than flattening
both operations into an unstructured list.

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

Recommendations are proposals, not automatic publications. The initial version must not change
Horoshop relationships without an explicit user action.

## Recommendation requirements captured so far

- The algorithm must operate on the external Horoshop catalog, including modifications.
- It must be able to recommend either a whole accessory section or particular products.
- Recommendations must be reviewable before write-back.
- Existing assignments must be detected so the tool does not create duplicate work.
- The recommendation criteria and precedence rules will be defined in the next requirements
  iteration.

## Architecture constraints

- Horoshop remains the commercial source of truth.
- PostgreSQL stores a normalized synchronized mirror, relationship state, proposal state, sync
  history, and audit history.
- The implementation must reuse shared authentication, access control, validation, error handling,
  PostgreSQL, and audit conventions without coupling to the local smartphone catalog.
- Horoshop credentials remain server-side, encrypted at rest, absent from logs, and are never
  returned to the browser after saving.
- Write-back must be retry-safe and must not silently report success when Horoshop rejects or only
  partially applies an operation.

Because the Horoshop catalog will support more than one MT Workspace capability, the catalog
connector and normalized mirror should be designed as a reusable Horoshop integration boundary.
Search indexing and related-product recommendations can consume explicit catalog contracts without
owning or duplicating the external catalog independently.

## Open questions for the next requirements iteration

- How should the recommendation algorithm determine compatibility and relevance?
- Are recommendations managed one product at a time, in bulk, or both?
- Should users be able to remove and replace existing Horoshop relationships as well as add them?
- Are accessory relationships assigned to a parent product, an individual modification, or both?
- What approval roles and safeguards are required before write-back?
- How should conflicting existing sections and individually assigned products be handled?
- Does the real Horoshop API expose both relationship assignment modes for reading and writing?
