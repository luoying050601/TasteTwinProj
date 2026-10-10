# Ten Source-Backed Menu Records for Local Testing

Collected on 2026-10-09 from MOS BURGER Japan's public official menu index and nutrition PDF. This is **brand-level pending research data**, not a branch-verified production catalog. The dataset uses the same 39-column staging header as the team template.

Dataset: [menu-collected-mos-10.pending.csv](menu-collected-mos-10.pending.csv)

## Sources and Scope

- [Official burger menu index](https://www.mos.jp/menu/category/?c_id=1): item identities, product links, tax-inclusive listed prices, dine-in/takeaway tax-inclusive price equivalence and the two spicy items' jalapeno labels.
- [Official nutrition PDF](https://www.mos.jp/menu/pdf/nutrition.pdf): page 1, exact standard-item rows; displayed update date 2026-10-01. Values are for individual burgers, not side/drink sets. Sodium is directly reported in mg; no salt-equivalent conversion was used.
- [MOS Burger detail](https://www.mos.jp/menu/detail/?menu_id=010320&c_id=1) and [MOS Cheeseburger detail](https://www.mos.jp/menu/detail/?menu_id=010340&c_id=1): partial ingredient-allergen and cross-contact review only. Fish/shellfish category coverage and unsupported allergens are not fully normalized. Both remain allergenStatus=unknown.
- [Official site terms](https://www.mos.jp/rule/): unauthorized reproduction/redistribution restrictions are stated. No permission for public redistribution or production reuse has been established. Accordingly usagePermission=restricted; do not automatically publish or serve this research file. Review permissions or obtain authorization before production export.

Only names, numerical facts, source links and concise collection notes are retained. No photos, promotional descriptions, full HTML or complete source PDF is included in the repository. Installing a PDF parser in a temporary verification environment did not change application dependencies.

The official source notes that nutrition values are formulation-based estimates and may differ from actual products; some components use food-composition calculations. nutritionMethod=official identifies the official publisher, **not a claim that each value was individually laboratory-measured**. Keep these source limitations with any future export.

## Observed Values

| Menu | Listed JPY | Serving g | kcal | Protein g | Fat g | Fiber g | Sodium mg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| モスバーガー | 500 | 211.2 | 372 | 15.2 | 17.0 | 3.4 | 906 |
| モスチーズバーガー | 550 | 226.2 | 425 | 18.2 | 21.4 | 3.4 | 1095 |
| スパイシーモスバーガー | 550 | 219.2 | 375 | 15.3 | 17.1 | 3.5 | 969 |
| スパイシーモスチーズバーガー | 600 | 234.2 | 428 | 18.3 | 21.5 | 3.5 | 1158 |
| テリヤキバーガー | 490 | 170.2 | 385 | 14.3 | 18.2 | 2.7 | 1033 |
| モス野菜バーガー | 500 | 192.2 | 363 | 14.1 | 18.6 | 3.2 | 710 |
| テリヤキチキンバーガー | 510 | 148.9 | 303 | 20.1 | 10.3 | 1.6 | 842 |
| フィッシュバーガー | 430 | 143.9 | 381 | 16.2 | 18.8 | 1.9 | 745 |
| ロースカツバーガー | 520 | 174.4 | 410 | 16.6 | 16.3 | 2.7 | 859 |
| 海老カツバーガー | 510 | 160.8 | 397 | 14.5 | 19.3 | 2.0 | 797 |

## Supported Local Tests

- CSV/JSON-array parsing, numeric unit normalization, evidence preservation and distinct item IDs.
- Nutrition target scoring for energy, protein, fiber, fat and sodium using the existing nutrition engine.
- Differences between richer/lighter choices and excessive sodium/fat penalties. This is not evidence of a medically ideal choice or restaurant variety.
- Unknown fluid values remain missing rather than zero. Only the two explicitly spicy items have spicy=true; other spicy cells remain unknown rather than assumed false.
- Unknown allergy disclosures fail closed under active allergy constraints. [] means no allergens asserted by this collection, not that the food contains none. A fish/shrimp item must not be declared allergen-free from an unreviewed disclosure.
- Production-release gating: every row is pending, unmapped and restricted, so none is eligible for production export.

This file is not automatically loaded by /api/recommend. The backend still requires its runtime JSON schema. Do not invent a restaurant city, branch UUID, walking time, permission approval or reviewer signature to make the current loader accept these rows. Tests may inject numeric fields directly into the nutrition engine; fake taste responses, if needed, must be explicitly mocked and must not contact live Qloo using fake IDs.

## Exception Report / Remaining Work

All ten records lack verified placeId, placeName, city and qlooEntityId. A chain-wide menu does not prove availability or price at a Tokyo branch; the official page notes that some branches do not carry all products and prices may vary. No branch addresses or walking routes were collected. cuisine=Burger is a collection category, not a claim of Qloo tag resolution or runtime cuisine-filter coverage.

All ten lack independent reviewer sign-off and production-use permission. Eight have no reviewed allergen data; two have partial disclosures with manufacturing-line/utensil sharing and unsupported walnut/gelatin entries preserved in raw notes. None is approved for allergy-safe recommendations. The all-burger, single-brand selection is intentionally small and biased; it cannot validate cross-restaurant Qloo personalization, cuisine diversity, full-meal portion adequacy or current store availability.

To enable real nearby meal recommendations, verify branches and their current menus/prices, resolve actual Qloo place UUIDs, obtain/check permitted use, review complete allergen coverage, integrate routes and run a reviewed staging-to-runtime export. Keep these records pending until the unresolved conditions are addressed. Recheck source versions before reuse; the linked PDF may change after collection.