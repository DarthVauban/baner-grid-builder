# ADR 0001: Extend the modular monolith

Status: accepted.

## Decision

Implement search as `src/modules/search` and dedicated React areas within the existing MT Workspace
instead of converting the repository to a new monorepo or deploying a second admin application.

## Rationale

Authentication, roles, migrations, error contracts, audit patterns, CI, deployment, and admin UI
already exist. Reusing them reduces operational surface while a strict domain boundary keeps future
service extraction possible.

## Consequences

Search must avoid large cross-domain files, prefix its tables, keep public widget routes explicitly
separate from protected admin routes, and treat OpenSearch/Redis as optional until enabled.

