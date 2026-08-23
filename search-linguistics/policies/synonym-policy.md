# Synonym policy

Status: approved target policy. Versioned synonym storage, validation, evaluation and publication
are not implemented yet.

## Purpose

Synonyms improve recall without making unrelated products equivalent. Rules are scoped, weighted,
versioned, evidence-backed, and reversible.

## Allowed rule kinds

- `equivalent`: safe bidirectional equivalence within the declared scope;
- `directional`: expand only from the observed query to the canonical catalog term;
- `translation`: cross-language mapping with an explicit source and target language;
- `transliteration`: script or common brand spelling mapping;
- `abbreviation`: abbreviation to canonical phrase;
- `colloquial`: common shopper wording to catalog terminology;
- `typo`: confirmed frequent spelling variant;
- `brand_alias` and `model_alias`: protected commercial-name variants.

## Required proposal fields

```yaml
proposal_id: SYN-YYYY-NNNN
operation: ADD
kind: directional
language: uk
source_term: ""
target_term: ""
scope:
  tenant_id: ""
  category_ids: []
  brand_ids: []
  product_ids: []
weight: 1.0
confidence: 0.0
source: search_analytics
evidence: {}
reason: ""
```

## Safety rules

- Prefer directional rules unless equivalence is demonstrably safe both ways.
- Prefer the narrowest category, brand, or product scope supported by evidence.
- Do not infer a synonym only because two products are frequently viewed together.
- Do not promote category relations, accessories, complements, or substitutes to equivalence.
- Preserve exact SKU, brand, model, capacity, size, color, and numeric constraints.
- Reject mappings that materially broaden a high-intent query without evidence.
- Check cycles, duplicates, contradictory directions, and protected terms.
- A rejected proposal may return only with materially new evidence.

## Publication

Validation and golden-query evaluation are mandatory. Published rules are immutable; corrections
create `DEPRECATE`, `REWEIGHT`, or `RESCOPE` operations in a new ruleset version.

