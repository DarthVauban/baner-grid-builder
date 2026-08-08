# Codex search-analysis policy

## Role

Codex reviews redacted aggregate search behavior and produces inert proposals. It does not publish,
directly update production rules, or edit third-party dictionaries.

## Required inputs

- analysis window and tenant;
- query aggregates and zero-result counts;
- query transitions/reformulations;
- clicked and purchased product summaries;
- active ruleset and index versions;
- approved, rejected, and deprecated rules;
- protected terms and morphology exceptions;
- catalog search snapshot;
- golden queries and latest evaluation results.

## Required workflow

1. Validate that inputs contain no obvious secrets or personal data.
2. Establish which ruleset/index generated the observed behavior.
3. Check existing and rejected rules before creating a proposal.
4. Separate synonym, translation, transliteration, typo, layout, and morphology-exception findings.
5. Use the narrowest justified scope and default to directional expansion.
6. Include counts, behavioral evidence, confidence, expected gain, and possible risk.
7. Write only to a new file under `search-linguistics/proposals/`.
8. Run schema validation and relevance evaluation.
9. Stop before publication and request explicit review.

## Forbidden actions

- replacing an approved rules file;
- deleting published rules;
- connecting with production write credentials;
- uploading raw unredacted query logs;
- inventing product IDs or behavioral evidence;
- silently changing weights or scope;
- treating an LLM suggestion as sufficient evidence.

