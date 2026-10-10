# TasteTwin Data Collection Requirements

These English prompts are intended for team members collecting data. Apply the common rules and the relevant dataset prompt together. No live data is collected by this document.

## Dataset Priorities

| Dataset | Priority | Purpose |
| --- | --- | --- |
| Menu catalog | Required | Real branch-specific meals, prices, nutrition and ingredient disclosures |
| Place master | Required | Exact restaurant branches, locations and operating information |
| Qloo entity mapping | Required for live taste ranking | Verified links from local branches to Qloo place UUIDs |
| Food composition reference | Recommended when estimating nutrition | Reference nutrients for identified ingredients |
| Recipe and portion records | Required if publishing recipe estimates | Traceable ingredient quantities, yields and portion calculations |
| Taste vocabulary | Recommended | Multilingual terms mapped to verified Qloo tags |
| Evaluation scenarios | Strongly recommended | Synthetic tests for safety, missing data and ON/OFF behavior |

For the first collection round, target one named area, 10-20 real branches and 50-100 distinct menu/portion/service-mode combinations. This is a planning target, not a reason to fabricate missing records.

## Common Requirements Prompt

> You are a TasteTwin data collector. Collect only traceable information within the assigned geographic area. Return UTF-8 CSV files with the exact headers specified below. Do not change column names, add unapproved columns, merge cells, add commentary rows, or invent missing values.
>
> Use ASCII field names; preserve original-language names in cell values. Use stable local IDs, lowercase verified Qloo UUIDs, ISO 8601 dates (YYYY-MM-DD), IANA timezones, and decimal numbers without currency symbols, unit suffixes or thousands separators. Use true/false for known booleans. Leave unknown scalar values empty; never substitute 0, N/A, a dash, or a guessed number. Zero is valid only when explicitly supported by evidence. Arrays and objects must be valid JSON inside properly escaped CSV cells. For example, the JSON array ["soy","wheat"] is encoded in CSV as "[""soy"",""wheat""]".
>
> Every factual claim must be linked to evidence. Record the exact source page or document, observation date, collector, independent reviewer and evidence location (table name, item label, section or PDF page). A website homepage alone is not sufficient evidence for a nutrient or price. Never put API keys, tokens, personal health information, customer identities or precise customer locations in files or source URLs.
>
> Public accessibility does not establish redistribution or permanent-storage rights. Set usagePermission to allowed only after checking applicable terms, attribution requirements and intended use. Otherwise use restricted or unreviewed. Comply with provider storage/caching limits. Do not bypass access controls or assume that automated scraping is permitted.
>
> Use collectionStatus=pending until required evidence, consistency checks and independent review are complete. Use ready only for source-backed, review-approved records with usagePermission=allowed; ready means eligible for integration review, not medically certified or automatically deployable. Use rejected for unresolved contradictions or unusable evidence. Use example only for explicitly synthetic formatting examples. Keep ready, pending, rejected and example records in separate output files with the same header. Never release example or rejected records into production.
>
> Deliver the dataset files, an exception report listing unresolved record IDs and missing evidence, and a summary of record counts by status. Do not silently discard conflicts or unsupported allergens.

## Prompt 1: Menu Catalog

**Deliverable:** A CSV using the exact header in [menu-template.csv](data-collection/menu-template.csv). The file includes one fictional example row. All example names, prices, nutrient values and example.com URLs are invented solely to demonstrate formatting; the blank Qloo ID is deliberate. Delete the example before real collection. It is not a collected, verified or deployable menu.

> Collect one record per exact branch, menu item, serving option and service mode. Separate different portion sizes, rice choices, optional toppings and dine-in/takeaway prices. Never assume that a chain-wide product is available at every branch or at one uniform price. Reuse the same placeId from the place master and use a unique, stable candidateId. Assign new candidate IDs when a serving configuration changes materially; retain previous snapshots in version history.
>
> Prioritize official restaurant menus, nutrition tables and allergen disclosures, or directly authorized restaurant records. Copy original menu names accurately. Translate descriptions only when necessary, without changing serving meaning. Identify every included component and state whether nutrition covers the entire set or only the main dish. Do not attach nutrition for a main dish to a set containing rice, soup or side dishes unless the source supports the combined total.
>
> Normalize nutrition to the exact served portion. Do not copy per-100g values into per-serving fields. Preserve the original basis and conversion evidence in evidenceLocator; recipe calculations must reference reviewed recipe and ingredient records. Missing fiber, sodium, fluids or other nutrients remain empty. Never infer missing nutrients from a similar dish, photograph or language model.
>
> Set allergenStatus=known only when the disclosure has sufficient scope for all currently supported allergen codes. allergenCoverage lists the codes explicitly assessed, including supported codes explicitly declared absent. A list of present allergens alone is not a complete absence assessment. Empty allergens with incomplete coverage means unknown, not allergen-free. Preserve the original allergen statement in allergensRaw. Ingredients and cross-contact disclosures are separate; neither guarantees safety for an individual.
>
> Verify qlooEntityId through the entity-mapping dataset. Leave it empty and mappingStatus=unmapped if no valid mapping exists. Do not generate UUIDs, use a brand UUID as a branch UUID, or match solely on similar names. An unresolved mapping keeps this record pending for live Qloo menu integration.

### Menu Field Requirements

| Field(s) | Requirement / allowed values |
| --- | --- |
| candidateId | Required unique string, at most 100 characters; real IDs must not start with demo- or EXAMPLE- |
| placeId | Required local branch ID, referencing Prompt 2 |
| qlooEntityId | Actual Qloo place UUID; required for ready live-integration records |
| placeName, menuName | Required exact names, at most 150 characters each |
| city | Required canonical value, at most 80 characters; use the agreed spelling, e.g. Tokyo |
| portionDescription | Required plain-language portion and inclusions; do not invent gram weight |
| servingWeightG | Optional verified total serving weight in grams; unknown stays empty |
| includedItems | Required JSON array of included components; [] only if the scope has been established |
| serviceMode | Required: dine_in or takeaway |
| price, currency | Required nonnegative portion price and uppercase three-letter currency, e.g. JPY |
| taxStatus | included, excluded or unknown; ready comparison records require a known basis |
| cuisine | Required agreed category, e.g. Japanese, Italian or Chinese |
| ambience | JSON array of supported, evidenced descriptors; [] means no descriptors asserted, not that the place is not quiet |
| proteinG, fiberG, fatG | Optional nonnegative grams per exact serving, maximum 1000 each |
| caloriesKcal | Optional nonnegative kcal per serving, maximum 10000 |
| sodiumMg | Optional nonnegative milligrams of sodium per serving, maximum 50000 |
| fluidMl | Optional verified fluid volume per serving in ml, maximum 20000; not inferred food water content |
| allergens | JSON array using current codes: peanut, milk, egg, soy, wheat, fish, shellfish, sesame |
| allergensRaw | Preserve original ingredient, allergen and exception wording; empty if unavailable |
| allergenCoverage | JSON array of currently supported codes explicitly assessed by the evidence |
| allergenStatus | known or unknown; known requires allergenSource and complete supported-code assessment |
| crossContactStatus | declared_possible, declared_absent or unknown; preserve evidence wording; declared_absent is not a safety guarantee |
| spicy | true, false or empty for unknown; false requires evidence, not a guess from the dish name |
| observedAt | Required observation date, not in the future |
| menuSource, priceSource | Required exact HTTP(S) evidence URLs |
| nutritionSource | Required when any nutrition value is populated; for estimates reference calculation evidence as well |
| allergenSource | Required for allergenStatus=known; may be empty for unknown disclosures |
| nutritionMethod | official, recipe_estimate or unknown; synthetic is allowed only for example records |
| mappingStatus | verified or unmapped; verified requires Prompt 3 evidence |
| collectionStatus | ready, pending, rejected or example |
| collectedBy, reviewedBy | Team member identifiers, not personal contact details; independent reviewedBy required for ready |
| evidenceLocator | Required source location, portion/basis notes, conversions and any record links needed for review |
| usagePermission | allowed, restricted or unreviewed; allowed is required for ready |

When converting a Japanese salt-equivalent disclosure to sodium, approximately 1 g salt equivalent = 393 mg sodium. Preserve the original value/unit and the conversion in evidenceLocator. Do not confuse salt equivalent, sodium, grams and milligrams, or sum a converted value with an already disclosed sodium value.

The current eight allergen codes are not a complete Japanese allergen taxonomy. Preserve unsupported items such as buckwheat and walnut in allergensRaw and list them in the exception report. Do not map them to wheat or peanut. Records with unsupported allergen requirements must not be released as fully supported allergy-safe records; taxonomy and filtering must be extended before those use cases are supported.

### Backend Compatibility

This CSV is a **staging collection format**, not a file that the current backend can load directly. The backend loads a JSON array and forbids extra keys. A reviewed export/normalization step is still required and is not implemented by these templates.

Existing runtime fields are candidateId, qlooEntityId, placeName, menuName, city, price, currency, cuisine, ambience, proteinG, fiberG, fatG, caloriesKcal, sodiumMg, fluidMl, allergens, allergenStatus, spicy, observedAt, menuSource, nutritionSource, allergenSource and priceSource. Convert CSV types correctly and empty values to JSON null where allowed. Resolve tax/serving and availability evidence before export. Preserve collection-only audit metadata separately; do not silently discard it or downgrade recipe_estimate to an official value. Estimated records must stay in staging until runtime estimate provenance is supported.

Do not collect walkMinutes as a permanent property of a dish. Walking time depends on origin and route. Existing runtime walking fields (walkMinutes, walkOriginLat, walkOriginLng, walkSource) require a valid origin and evidence; preferably add a route provider during integration. Without a matching verified route, walkMinutes must remain null and the current backend will exclude that record under an active walking limit. Current catalog matching uses exact canonical city names, not address geocoding. The current loader allows at most 500 records per file; larger datasets need a separate import/storage design.

## Prompt 2: Place Master

**Priority:** Required. **Output:** place-master CSV, using this exact header:

```csv
placeId,brandName,placeName,city,address,latitude,longitude,timezone,businessStatus,openingHours,websiteUrl,placeSource,observedAt,collectionStatus,collectedBy,reviewedBy,evidenceLocator,usagePermission
```

> Collect exact physical restaurant branches, not brand headquarters or generic chains. Require placeId, placeName, canonical city, full address, latitude, longitude, timezone, placeSource, observation date and review metadata for ready records. Latitude is -90 to 90; longitude is -180 to 180. timezone must be an IANA identifier, such as Asia/Tokyo. Names, addresses and coordinates must identify the same branch. Check duplicates, closures and relocations.
>
> businessStatus is operational, temporarily_closed, permanently_closed or unknown. Record openingHours as a JSON array of objects using day (monday-sunday), open and close (24-hour HH:MM), and closeDayOffset (0 or 1). Use [] when no regular-hours intervals are available and explain uncertainty; do not infer closure or opening from []. Regular hours do not guarantee holiday hours, current availability or last-order time. brandName and websiteUrl may be empty when unknown. Do not assert operational status without evidence.
>
> Use official branch pages or an appropriately licensed place provider. A provider's place ID is not a Qloo ID. Avoid retaining restricted provider content beyond permitted limits. Place coordinates are branch information, not customer coordinates. Use common collectionStatus, usagePermission and audit rules. Closed or unknown-status branches must not be treated as currently available without a separate availability check.

## Prompt 3: Qloo Entity Mapping

**Priority:** Required for live taste ranking. **Output:** entity-mapping CSV, using this exact header:

```csv
mappingId,localType,localId,qlooEntityId,qlooEntityType,matchStatus,evidenceSource,evidenceLocator,observedAt,collectionStatus,collectedBy,reviewedBy,usagePermission
```

> Map local records to entities actually returned by an authorized Qloo lookup. localType is place, artist, movie, book or brand; qlooEntityType must be the corresponding urn:entity:place, urn:entity:artist, urn:entity:movie, urn:entity:book or urn:entity:brand. For restaurant ranking, require a place mapping to the exact placeId from the place master. Artist/movie/book/brand rows are optional cross-domain interest references, not mandatory user-profile data.
>
> Require mappingId, localType, localId, actual qlooEntityId, returned qlooEntityType, evidenceSource, evidenceLocator, observation date and audit fields for verified ready mappings. Require a syntactically valid UUID and evidence of actual lookup existence; UUID syntax alone is not verification. Compare branch name, address and returned location where available. matchStatus is verified, ambiguous, not_found or rejected. Leave the Qloo UUID/type empty when not found; retain candidate details in evidenceLocator for ambiguous matches but do not choose a production mapping by guesswork. Ambiguous/not_found mappings remain pending.
>
> Never substitute a chain brand entity for a branch place entity. Do not create fake UUIDs, include credentials in URLs, or select the first search result solely because its name looks similar. Require an independent reviewer for verified mappings. If one Qloo entity maps to multiple apparently distinct branches, flag the conflict for review. Document the authorized endpoint and sanitized evidence reference without archiving API secrets or restricted response content.

## Prompt 4: Food Composition Reference

**Priority:** Recommended; needed for recipe calculations when official menu nutrition is unavailable. **Output:** food-reference CSV:

```csv
foodId,foodName,preparationState,nutrientBasis,basisWeightG,proteinG,fiberG,fatG,caloriesKcal,sodiumMg,sourceFoodId,sourceUrl,sourceVersion,observedAt,collectionStatus,collectedBy,reviewedBy,evidenceLocator,usagePermission
```

> Collect reference foods from authoritative food-composition data, such as Japan's MEXT tables or USDA FoodData Central. Require foodId, foodName, preparationState, sourceFoodId, sourceUrl, sourceVersion, observation date and review metadata. Preserve the database's food identifier and exact edition. Match preparationState to the source: raw, cooked or as_sold; these are not interchangeable. Preserve precise cooking/edible-portion details in evidenceLocator.
>
> Normalize ready records to nutrientBasis=per_100g and basisWeightG=100 of the edible portion. Preserve source units and conversion evidence. If only per-serving values are available, normalize only when the actual serving weight is known; otherwise keep the record pending. All nutrient cells are optional nonnegative values in the units indicated by their field names; unknown is empty, not zero. Do not fill missing nutrients using a different food, edition or preparation state without an explicitly reviewed calculation method.
>
> This is an ingredient reference dataset, not a restaurant-menu dataset. It cannot establish the actual ingredients, recipe, price, serving weight or allergen safety of a restaurant dish. Follow the source's attribution and redistribution terms.

## Prompt 5: Recipe and Portion Records

**Priority:** Conditional: required before publishing calculated nutrition. **Output:** recipe-portions CSV:

```csv
recipeId,candidateId,portionDescription,ingredients,cookedYieldG,servingsPerBatch,sourceUrl,calculationMethod,assumptions,nutritionMethod,observedAt,collectionStatus,collectedBy,reviewedBy,usagePermission
```

> Collect recipes and portions only when ingredient identities, amounts, preparation basis and yield are traceable. Require recipeId, candidateId referencing the menu record, portionDescription, nonempty ingredients, positive servingsPerBatch, sourceUrl, documented calculationMethod, assumptions, observation date and review fields. cookedYieldG is a positive batch cooked yield when measured/known, otherwise empty. A missing cooked yield requires an explicit explanation and a valid alternative portion basis, not an invented value.
>
> ingredients is a JSON array with one object per ingredient: foodId (reference to Prompt 4), edibleWeightG (nonnegative), preparationState (raw, cooked or as_sold), and quantityBasis (batch or serving). State recipe quantities clearly; do not divide already per-serving weights by servingsPerBatch a second time. Use preparation-matched composition records. Account for sauces, oil absorption, discarded cooking liquids, substitutions and yield where evidence permits; list unresolved assumptions instead of silently ignoring them.
>
> nutritionMethod must be recipe_estimate. Do not claim laboratory measurement or official restaurant nutrition. Require all referenced food records and an independent calculation review before ready. Label estimated nutrition separately in any downstream product. If a restaurant recipe or quantities are undisclosed, keep pending or reject; do not reconstruct a supposed exact recipe from a photograph or generated text. Ingredient-based allergy inference cannot establish cross-contact safety.

## Prompt 6: Taste Vocabulary

**Priority:** Recommended for consistent multilingual preference collection. **Output:** taste-vocabulary CSV:

```csv
termId,category,labelEn,labelJa,labelZh,aliases,qlooTagId,qlooTagName,matchStatus,sourceUrl,observedAt,collectionStatus,collectedBy,reviewedBy,usagePermission
```

> Collect a controlled vocabulary for taste preferences, not medical traits. category is cuisine or ambience. Require termId, category, labelEn, a verified qlooTagId/qlooTagName pair, sourceUrl, observation date and review fields for ready mappings. labelJa and labelZh may be empty pending translation review. aliases is a JSON array of objects containing locale (en-US, ja-JP or zh-CN) and text.
>
> Verify tags through Qloo's supported tag lookup. Preserve the exact returned tag ID; do not invent URNs by translating or concatenating a cuisine name. matchStatus is verified, ambiguous, not_found or rejected. Missing/ambiguous tags remain pending and must not be used as production signal IDs. A tag vocabulary entry does not prove that a particular restaurant has that property. Keep vegetarian, halal and other ingredient/certification requirements separate from inferred cultural taste; do not treat tag affinity as safety certification.

## Prompt 7: Evaluation Scenarios

**Priority:** Strongly recommended. **Output:** evaluation-scenarios CSV:

```csv
caseId,scenario,inputPayload,candidateFixture,upstreamFixture,expectedAssertions,sourceType,policyVersion,collectionStatus,collectedBy,reviewedBy
```

> Construct synthetic test cases, not collected real user profiles. Require every field, using sourceType=synthetic and an explicit policyVersion. Synthetic evaluation cases may be ready after test review; this is an exception to the real-world source requirement, not permission to label synthetic menu evidence as ready. Do not include real customer health records, names, session IDs, API keys, exact home/work coordinates or medical histories.
>
> inputPayload is a JSON object matching the relevant API request schema. candidateFixture is a JSON array of intentionally synthetic candidates. upstreamFixture is a JSON object describing an injected/mock Qloo outcome, never a live credential or instruction to call a paid API. expectedAssertions is a nonempty JSON array of objects containing path (JSON Pointer), operator (equals, contains, not_contains or is_null), and value. Test-harness integration of this format is future work; reviewers must not assume these CSV cases execute automatically.
>
> Cover known allergen conflicts, unknown disclosures, unsupported allergens, omitted nutrients, zero versus unknown intake, duplicate meal IDs, portion/unit conversions, energy/fat/sodium excess, no eligible menus, unknown routes, OFF making no Qloo call, identical eligible menu IDs across ON/OFF, unmatched entity IDs, 401/403/429/5xx/timeout fallback, cache after refinement, and session deletion. Use explicit invariants rather than making up an ideal restaurant ranking. Clinical contexts must not receive automatic targets. Test the current API limitation that unsupported allergen codes are rejected; do not create a passing scenario that silently treats them as supported.

## What Not to Build as a Shared Local Dataset

- Do not collect real user health profiles or meal histories into team CSVs. Those require consent, authenticated ownership, retention rules and a secure application database, not a shared reference dataset.
- Do not crowdsource clinical target tables, disease treatments or pregnancy advice from blogs. Any future policy/reference dataset needs authoritative citations, applicability limits, versioning and qualified professional review before application use.
- Do not store Qloo affinity as a permanent property of a restaurant. Affinity depends on interests and query context; use bounded, policy-compliant caching with query provenance.
- Do not store a single permanent walk time per restaurant or menu. Compute routes from the current origin; any route cache needs origin, destination, mode, provider and timestamp.
- Do not invent quietness, availability, nutrition, allergens or Qloo associations to make recommendations nonempty.

## Final Acceptance Checklist

1. Headers match exactly; JSON cells parse; numeric values and units are correct; unknowns remain empty.
2. IDs are unique within their dataset; all place/menu/food/recipe references resolve; menus map to the correct branch.
3. Portions, included components, service mode and tax basis are explicit and supported by evidence.
4. Values have precise evidence locations, nonfuture dates, permission review and independent sign-off.
5. Unsupported allergens, partial disclosures, recipe estimates and ambiguous entity matches remain visible and gated.
6. No example records, unreviewed permissions, credentials or real user health information enter a production export.
7. Prices, operating information and menus have a documented refresh owner/cadence; expired evidence is rechecked before release. Source freshness is not automatically enforced by the current backend.
8. Ready means approved for integration review. Source truth, legal permissions, runtime field compatibility and safety requirements still require an explicit production release check.