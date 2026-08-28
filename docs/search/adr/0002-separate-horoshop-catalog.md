# ADR 0002: Keep the Horoshop catalog separate

Status: accepted.

Implementation status (2026-08-28): active. Migrations `051–070` established separate
`search_horoshop_*` tables scoped by connection/generation; migrations `075–078` extend that mirror
with hierarchy recovery, creation/photo metadata and sync progress. No cross-catalog foreign keys
were introduced.

## Decision

Create separate `search_*` catalog tables for Horoshop products and variants. Do not repurpose or
mirror into `used_smartphone_*` tables.

## Rationale

The existing catalog powers a different local storefront and contains domain-specific condition,
diagnostics, media, grouping, and publication behavior. Horoshop is the commercial source of truth
for the new widget and has different identifiers, locales, categories, variants, and lifecycle.

## Consequences

Shared functionality is reused through platform services or explicit contracts. Synchronization
cannot overwrite local catalog data, and local catalog edits cannot leak into Horoshop search.

