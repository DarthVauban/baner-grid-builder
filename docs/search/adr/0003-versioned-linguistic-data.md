# ADR 0003: Version linguistic data and make Codex proposal-only

Status: accepted.

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

