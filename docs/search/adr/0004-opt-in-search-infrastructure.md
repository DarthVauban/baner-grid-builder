# ADR 0004: Use an opt-in search infrastructure profile

Status: accepted.

Decision date: 2026-08-08.

## Decision

Pin OpenSearch 3.7.0 with the `analysis-ukrainian` plugin and Redis 7.2 in a Docker Compose profile
named `search`. The existing default deployment does not depend on or start these services.

## Rationale

OpenSearch 3.7.0 is the current generally available 3.x release confirmed during Stage 0, and the
official Ukrainian analyzer requires installation as a plugin. An opt-in profile avoids changing
the memory and operating requirements of the current production application before search is
implemented and tested.

## Consequences

Developers use `npm run infra:search:up` when working on search. Production enablement requires a
separate capacity, security, backup, and rollout review. Versions are upgraded deliberately.

## References

- https://opensearch.org/releases/
- https://docs.opensearch.org/latest/analyzers/language-analyzers/ukrainian/
- https://docs.opensearch.org/latest/install-and-configure/additional-plugins/index/
