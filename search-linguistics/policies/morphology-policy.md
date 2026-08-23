# Morphology policy

Status: approved target policy. The OpenSearch linguistic runtime and project-owned morphology
exception tables are not implemented yet.

## Purpose

The standard language analyzer handles ordinary inflection. Project-owned data records exceptions
for product language, brands, models, abbreviations, and terms the analyzer handles incorrectly.

## Allowed exception kinds

- `protected_term` — preserve the token exactly;
- `lemma_override` — map a confirmed form to the correct project lemma;
- `language_override` — force language handling for an ambiguous term;
- `ignore_term` — exclude the term from morphology;
- `scoped_exception` — apply an exception only to a tenant/category/brand/product.

## Safety rules

- Never edit or regenerate a third-party morphology dictionary in place.
- Never store manually enumerated ordinary declensions when the analyzer already handles them.
- Protect SKUs, model codes, brand names, measurements, and meaningful punctuation.
- An alias, translation, typo, or colloquial expression is not a morphology override.
- Every override requires an example input, expected analysis, scope, and evidence.
- Test the override against both expected and forbidden golden queries.

## Licensing

Record name, exact version, source URL, license, checksum, and notices for every bundled linguistic
artifact. Data with non-commercial or unclear terms must not be shipped in the commercial runtime
without explicit legal approval or a separate license.

