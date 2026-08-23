# ADR 0003: Version linguistic data and make Codex proposal-only

Status: accepted.

Implementation status (2026-08-23): policy/specification only. Accessory Codex reviews already use
proposal-only semantics, but linguistic rule tables, immutable published rulesets and search
evaluation/publication services are not implemented yet.

## Decision

Store linguistic rules in PostgreSQL with stable IDs and immutable published ruleset versions.
Codex writes structured proposals only. Publication is an explicit, audited user action after
validation and relevance evaluation.

## Rationale

Search behavior is production data. A generated file replacement or unsupervised model edit can
silently remove good synonyms, broaden matches, or break high-value queries.

## Consequences

Rules use additive/deprecation semantics, rejected proposals are retained, raw exports stay outside
Git, golden-query regressions block publication, and rollback remains available.

