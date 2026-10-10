# User Notebook: Collection Only

Source: user-provided text and images of `01 基础信息-V3.5.pdf`, pages 1-3, plus the confirmed product decisions on 2026-10-10. This iteration collects and manages data only. It does not change recommendation requests, filters, menu prices, Qloo calls, nutrition targets or the existing meal-session behavior.

## Navigation

The fridge opens an independent Personal tastes panel, not the notebook: no book cover, character flyleaf, profile/health sections or tabs. It reads only dietary preferences and shares the same taste form and persistence as the notebook. Closing returns focus to the fridge. Other legacy taste/settings links also open this standalone presentation. The character's notebook entry still opens the full three-tab book starting on Personal profile. The two presentations do not duplicate data or add recommendation integration.

Clicking the room character reveals or collapses its notebook button, without directly opening a profile dialog. The revealed notebook follows the character during movement; clicking it opens the book's Personal profile / Your tastes / Health data tabs in Chinese, Japanese and English. Desktop uses a character flyleaf and form page with floating leaf-shaped tabs; mobile places the leaves above a single scrolling page. Basic profile fields reuse the existing form, and the furniture heart still opens meal selection preview. No nested dialogs or second registration table.

## Tables

Geographic lookup is worldwide, not China-only. In the Chinese UI, an empty original lookup receives one simplified-to-traditional retry through the lazily loaded OpenCC dictionary (for example, 东京 日本 becomes 東京 日本). The provider may not index every translated place name; local names or English remain valid alternatives. The two attempts share cancellation and timeout protection, and queries that already succeed do not get retried.

| Table | Relationship | Write policy |
| --- | --- | --- |
| Existing `profiles` | One row per account | Existing basic profile behavior unchanged |
| `user_dietary_preferences` | One row per `auth.users.id` | Insert, then edit the current allergy/avoidance values |
| `user_health_records` | Many rows per `auth.users.id` | Insert complete snapshot only; no client update or deletion |

The new tables share only the authenticated user UUID. They do not depend on each other or reference recommendation sessions. No per-indicator table, duplicated latest-health table or stored BMI is needed.

Health records use an independent UUID and server-generated `recorded_at`. History is sorted by saved time descending, then UUID descending, with an index on `(user_id, recorded_at DESC, id DESC)`. First history item is the latest snapshot. Copying old data only fills the form; saving creates a new row and retains the original. The timestamp means saved time, not an asserted clinical measurement time.

## Fields

| Group | API field | Type / validation |
| --- | --- | --- |
| Basic profile | nickname, gender, birthYear, birthMonth, email | Existing constraints; email is read-only, date remains year/month |
| Dietary | city | Trimmed city/area text, at most 80 characters; saved with dietary preferences and restored on reload |
| Dietary | allergyStatus, avoidanceStatus | `unknown`, `none`, `selected`; unknown is not no allergy |
| Dietary | allergens | Unique codes: milk, egg, peanut, tree_nut, fish, crustacean, sesame, wheat, soy, mango, other |
| Dietary | avoidedFoods | Unique codes: cilantro, scallion, ginger, garlic, pork, beef, lamb, offal_blood, fish_seafood, alcohol, other |
| Dietary | allergyOther, avoidanceOther | Trimmed text up to 200 characters; required exactly when other is selected |
| Health | weightKg | Finite number, greater than 0 and at most 500; rounded to 2 decimals |
| Health | heightCm | Finite number, 30-300; rounded to 2 decimals |
| Health | bodyFatStatus | `unknown` or `measured`, explicitly answered |
| Health | bodyFatPct | Null if unknown; measured value greater than 0 and less than 100 percent, 2 decimals |
| Health | goal | build_muscle, lose_fat, wellness, no_specific_goal |
| Health | chronotype | morning, evening, intermediate |
| Health | breakfastHabit, lunchHabit, dinnerHabit | often, sometimes, never; habitual frequency, not actual nutrient intake |
| Health response | id, recordedAt, bmi | Immutable record ID/time; BMI derived from that record |

These numeric bounds are broad technical input limits, not medical reference ranges. Body fat is never estimated. BMI = weight in kg / squared height in metres, rounded to one decimal for display; no diagnosis, normal-range classification or nutrition target is inferred. Gender is not mapped to metabolic sex. Children can save observations without receiving adult nutrition advice from this module.

City is now persistent: type an area manually, select a keyword result, or explicitly request browser geolocation, then save dietary preferences. The newest saved name is restored on reopen/reload. Location is never requested automatically and precise coordinates are not stored. Old clients omitting city do not erase the current saved value. Clearing the field and saving explicitly clears it.

Cuisine remains a form-session selection, with 24 choices grouped into Asia, Europe, Americas, Middle East and Africa. Its codes/three-language labels are separate from the recommendation engine. Neither saved region nor collected cuisines affect recommendations in this release. No ambience or budget controls are added.

Geocoding defaults to Photon/OpenStreetMap's public demo API; input is debounced for one second, results cached in memory and stale requests cancelled. Keyword lookup sends the keyword to that provider; explicit location lookup sends coordinates to resolve the area, without account credentials. The public endpoint permits reasonable use but has no availability guarantee. Manual entry remains available on network/permission failure. For a managed or self-hosted compatible provider set optional frontend `VITE_GEOCODER_URL` and rebuild; extensive production usage must not overload the demo service. Geographic names come from the provider; controls and country names use the current UI language.

## Saving and Drafts

Health weight, height, body-fat status, goal, chronotype and all three meal habits are required for a snapshot. Unknown body fat is a valid answer, not zero. No incomplete draft enters the health history table. Unsaved drafts remain only in component memory; tab switching retains them, closing/reloading warns, and history copy asks before replacing a dirty health draft. Sensitive drafts are not written to localStorage.

Preference selections cannot combine none/unknown with selected food codes. Backend and database both validate this. A new health UUID is retained for retrying the same pending request; replaying the same UUID and contents returns the existing record, while changed contents conflict. Concurrent identical first writes may receive 409 and can be retried; neither can overwrite a record.

## API

All routes require the existing complete basic account, not complete health data. The verified account UUID supplies ownership; clients cannot provide another userId, recordedAt or BMI. Responses use the existing envelope, no-store headers, localized errors and sanitized upstream failures.

- `GET /api/me/dietary-preferences`: current preferences; absent row returns unanswered defaults.
- `PATCH /api/me/dietary-preferences`: full preference section save.
- `GET /api/me/health-records?offset=0&limit=20`: records and nextOffset; limit 1-50, bounded offset. Refresh the first page after new saves so pagination follows the current saved-time ordering.
- `POST /api/me/health-records`: complete snapshot, with optional client-generated UUID id for safe retries. No PATCH/PUT/DELETE health route.

Empty health history returns records=[] and nextOffset=null. A missing migration or denied Data API permission is an unavailable error, never silently converted to an empty health history.

## Migration and Verification

Run `supabase/migrations/202610100002_user_notebook.sql` once after the existing basic-profile migration, then `supabase/migrations/202610100003_notebook_city.sql` once to add the persistent region column and its insert/update privileges. Do not rerun already applied migrations. Existing preferences and health history are retained. RLS restricts all rows to their owner; health permits INSERT only and cannot accept recorded_at; dietary permits editable columns only. Anonymous access is denied. Account deletion by an authorized administrator would cascade, but this module exposes no account/history deletion UI.

Local PostgreSQL verification is reproducible without a cloud account:

```sh
npm install --prefix /tmp/tastetwin-sql-check @electric-sql/pglite
PGLITE_MODULE=file:///tmp/tastetwin-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-notebook-db.mjs
```

This runs migrations in an isolated PostgreSQL engine with two fake users and checks history immutability, cross-user RLS, anonymous denial, database selection constraints and timestamp/identity column privileges. It does not certify a particular Supabase deployment.

Backend tests: `python -m pytest tests -q` from apps/api. Browser tests: `npm run test:portal --workspace @tastetwin/web`. Browser mocks exercise desktop/mobile collection and historical copy; no actual user data or credentials enter tests.

## Exclusions

No sleep-quality/hour/step fields, measurement trend analytics, intake diary, medical algorithm, automatic recommendation use or new consent acceptance workflow. Do not claim collected allergies already guarantee safe menu recommendations. Public health-data rollout still needs an appropriate privacy/retention review; authorization has been deferred, not fabricated.