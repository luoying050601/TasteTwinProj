# Deployment

## User notebook migration

Persistent region additionally requires `supabase/migrations/202610100003_notebook_city.sql`, applied once after 002. It adds only the city column and its least-privilege grants, preserving existing user preferences and health records. Region lookup uses the public Photon endpoint by default; optional `VITE_GEOCODER_URL` can select a compatible endpoint at frontend build time. No map-service key is required, but public-service quotas/availability must be considered before large-scale use.

The notebook is a collection-only addition: it stores dietary preferences and append-only health snapshots, without changing the recommendation engine. Before using its save/load functions on a real project, run `supabase/migrations/202610100002_user_notebook.sql` once in SQL Editor after the original profile migration. Do not rerun an applied migration or modify existing account rows. No additional environment variables or privileged service keys are required.

Health records allow authenticated owner-only SELECT/INSERT, not UPDATE/DELETE. Preferences allow owner-only current-value edits. If this migration has not been applied, the notebook reports unavailable and does not overwrite data with empty defaults. Existing login and recommendation flows remain usable. See [USER_DATA_V3.5.md](USER_DATA_V3.5.md) for fields, APIs, draft behavior and the isolated database verification command. This local implementation has not executed a cloud migration or deployment.

## Supabase portal setup

The portal now requires verified Google or email-code authentication. First login requires nickname, gender and birth year/month before business APIs become available. Existing deployment records below are historical; this change has not been published or connected to a live Supabase project.

1. Create a Supabase project, preferably near the API region. The free Postgres/Auth tier is suitable for initial development; check current quotas, inactivity policies and SMTP-provider costs before public launch.
2. In Supabase SQL Editor, execute `supabase/migrations/202610100001_basic_profiles.sql` once on the target project. It creates `public.profiles`, backfills email users, synchronizes account UUID/email, and enables owner-only RLS. Do not rerun an already applied migration. Phone-only/anonymous login is not supported.
3. Under project connection/API settings, obtain the project URL and **publishable key**. The app uses the Auth and Data APIs backed by Postgres, not a direct database connection. No runtime `DATABASE_URL`, service-role key or database password is needed.
4. Enable Email authentication, email confirmations and Google; keep anonymous sign-ins disabled. New email users can register through the same code entry, so a separate registration/password UI is unnecessary.
5. Set Authentication URL Configuration: production Site URL and exact allowed frontend callback URLs. For example: `http://localhost:5173/auth/callback`, `http://127.0.0.1:5173/auth/callback`, `https://tastetwinproj.vercel.app/auth/callback`, and `https://tastetwin-api.onrender.com/auth/callback` when serving the web app on Render. Add other ports/domains only when actually used. Do not allow arbitrary redirect origins.
6. Configure Google Cloud's Web OAuth client with the frontend origins and the **Supabase** callback `https://<project-ref>.supabase.co/auth/v1/callback`. Store the Google Client ID/Secret in the Supabase Google provider settings, not in this repository. Request only `openid`, email and profile scopes. Google testing audience/test-user restrictions must match the intended release.
7. Configure custom SMTP for delivery to real users. Supabase's default email service is testing-limited and is not an unrestricted production mail sender. Set the Magic Link/OTP email template to include `{{ .Token }}` rather than only a clickable link; the UI expects a six-digit code. Also ensure first-signup confirmation emails expose the code. Recommend an OTP expiry of 10 minutes and a resend interval of at least 60 seconds. Keep provider-side request limits enabled; the browser countdown is not security enforcement.
8. Configure the environment variables below and rebuild/restart the relevant services.

Frontend (`apps/web/.env.local` locally, Vercel environment in production):

```dotenv
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable application key>
```

Backend (`apps/api/.env` locally, Render Environment in production):

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<same publishable application key>
WEB_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For production, use the actual API URL and an explicit `WEB_ORIGINS` allowlist. Render's full-site build also needs both `VITE_SUPABASE_*` variables at build time, in addition to the backend variables. The existing build script inherits them while forcing the API base to same-origin. Vite variables are public and embedded at build time; never put Google secrets, SMTP credentials, database passwords or service-role/secret keys in them. Configure credentials directly in provider dashboards or local environment files, not in chat or Git.

### Profile and identity contract

`profiles.id` is the Supabase Auth UUID, not an email hash or recommendation session UUID. Email has a case-insensitive unique index and is managed by the auth-table trigger. Users cannot insert/delete profile rows or update UUID/email/timestamps through the Data API. Same verified-email OAuth identities use Supabase's automatic linking; different-email manual merging is outside this release. Test Google-first and email-first login on the live project before claiming linking works there.

`GET /api/me` and `PATCH /api/me` require `Authorization: Bearer <Supabase access token>`. Swagger's **Authorize** accepts this access token. The backend checks the token and confirmed email with Supabase Auth, then accesses the Data API using that same user token, so RLS remains enforced. It does not trust a browser-provided user ID/email.

PATCH accepts only these fields, all required on save:

```json
{"nickname":"Twin","gender":"undisclosed","birthYear":2000,"birthMonth":2}
```

Gender values: `male`, `female`, `other`, `undisclosed`. Nickname is trimmed and limited to 40 characters; it need not be unique. Year/month must be real and not future relative to UTC. No day or fixed age is stored. The portal does not enforce adulthood, and account gender is not automatically mapped to the separate adult nutrition model's `metabolicSex`.

Only `/api/health` is public. Every other business API requires a complete account profile. Missing/invalid/unverified authentication returns 401, incomplete profile returns 403, and unavailable Auth/Data services return a sanitized 503. Profile rows can initially contain null onboarding fields; completeness is computed from saved values, not from a client-controlled flag.

Clicking the personal pixel icon edits the profile; male/female/neutral variants are used without avatar uploads. Saving overwrites profile fields, invalidates the user's meal sessions and clears stale results. All meal-session read/write/delete paths check authenticated ownership, including reinterpretation of a supplied UUID. Account profile data persists in Supabase; meal sessions remain one-process, one-hour memory and are lost on restart. Reset clears meal context, not account data. Sign-out is local to the current browser session and clears its meal state. Preference persistence, email-change UI, account deletion, meal history and medical consent workflows remain out of scope.

Basic identity, birth information, nutrition and allergies are not sent to Qloo. Review privacy/retention requirements and the existing adult-only nutrition limitations before storing production health records.

Reference setup: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Frontend: https://tastetwinproj.vercel.app
Backend: https://tastetwin-api.onrender.com
Health: https://tastetwin-api.onrender.com/api/health

## Vercel

Project `yin-g/tastetwinproj`. Repository root (`.`), `npm ci`, `npm run build`, output `apps/web/dist`. Root `vercel.json` controls the monorepo build. Production variable `VITE_API_BASE_URL=https://tastetwin-api.onrender.com`. Current deployment uses authenticated Vercel CLI. GitHub auto-deployment is awaiting GitHub App installation/authorization; it is not connected yet. To deploy manually: `vercel --prod --yes` from the repository root.

## Render

Service `tastetwin-api`, ID `srv-db46cd3l550s73anlftg`. GitHub repository `luoying050601/TasteTwinProj`, branch `main`, root `apps/api`, Singapore, Free instance. Python 3.12.8. Build `bash ../../scripts/build-render.sh`; start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health path `/api/health`. Auto deploy on commit is enabled.

Variables: `DATA_MODE=fixture`, `PYTHON_VERSION=3.12.8`, `WEB_ORIGINS=https://tastetwinproj.vercel.app`. One instance, one process; sessions expire after one hour and are lost on restart. Preview Vercel domains are not automatically added to CORS.

Free Render services sleep after inactivity, so first requests can take 50 seconds or more. Frontend request timeout is 90 seconds. No live Qloo or model calls are enabled.

Verified on 2026-10-09 (Asia/Tokyo): anonymous frontend HTTP 200, backend health HTTP 200, correct CORS preflight for the production frontend.

Public browser flow verified: interpret → confirm → 3 recommendations → Closer produces 2 at 10 minutes → select chicken bento → happy companion. Screenshot: `production-preview.png`. Local backend regression tests: 18 passed.

## Full website on Render

https://tastetwin-api.onrender.com now serves the same frontend and the FastAPI API on one origin. The build script compiles Vite with an empty API base and copies the frontend into `apps/api/app/static`. Static assets and SPA routes are served by FastAPI, with `/api` and `/docs` preserved. The independent Vercel deployment continues to call the Render API.

## Backend 0.2: Qloo and personal nutrition

The deployment notes above describe the original fixture service. The 0.2 code must be committed/published by the team before Render can run it; local edits do not deploy themselves. Keep one instance and one worker. No secret is required in Git or in frontend variables.

Render Environment:

```text
QLOO_API_KEY=<configured privately in Render>
QLOO_BASE_URL=https://api.qloo.com
QLOO_REQUESTS_PER_MINUTE=60
DATA_MODE=fixture
```

Use the API host assigned to your Qloo account. Supported hosts are `https://api.qloo.com` and `https://hackathon.api.qloo.com`; redirects are not followed. The health endpoint reports `version=0.2.0` and `qloo=configured_not_verified` when a key is present. This is configuration evidence, not proof that authentication works. Do not make paid Qloo calls from health probes.

### Verify the connection

Open the deployed `/docs`, use **POST /api/places**, and run:

```json
{
	"location": {"city": "Tokyo", "lat": 35.66, "lng": 139.7},
	"radiusMeters": 2000,
	"tasteProfile": {
		"likedEntityIds": [],
		"likedTagIds": ["urn:tag:genre:place:restaurant:japanese"]
	},
	"limit": 3
}
```

This endpoint works even while `DATA_MODE=fixture`. A successful response has `qlooUsed=true`, real Qloo UUIDs and affinity, but menu/nutrition remain null. An empty successful list means no matches for that query, not necessarily a bad key. `QLOO_AUTH_FAILED` means credential/account permissions were rejected; `QLOO_REQUEST_REJECTED` means check IDs, location and account parameter support. Error bodies never echo the upstream response or key.

Use **GET /api/taste/tags?query=Japanese** to obtain supported tag IDs. `likedEntityIds` accepts real Qloo UUIDs for liked artists, books, movies, brands or places, obtained through Qloo entity lookup. Names are not accepted as IDs and UUID syntax alone does not prove existence. Cuisine/ambience text is resolved through tag lookup only when one exact name matches; unresolved terms yield warnings instead of guessed IDs. Empty interests are marked as non-personalized discovery.

### Personal records and recommendation

**POST /api/interpret** accepts a full snapshot of today's meals and profile:

```json
{
	"sessionId": "79de8df0-b5d7-4bca-81e7-6401c88191a8",
	"message": "Japanese under 1000 JPY nearby",
	"locale": "zh-CN",
	"location": {"city": "Tokyo", "lat": 35.66, "lng": 139.7},
	"personalProfile": {
		"age": 30,
		"weightKg": 60,
		"heightCm": 165,
		"metabolicSex": "female",
		"activity": "light",
		"goal": "balanced",
		"healthContext": "general",
		"mealFraction": 0.35,
		"allergens": ["peanut"]
	},
	"dailySummary": {"targetProteinG": 65, "targetFiberG": 25},
	"consumedMeals": [
		{"mealId": "breakfast", "name": "Breakfast", "proteinG": 15,
		 "fiberG": 4, "fatG": 12, "caloriesKcal": 400, "sodiumMg": 500},
		{"mealId": "lunch", "name": "Lunch", "proteinG": 27,
		 "fiberG": 6, "fatG": 18, "caloriesKcal": 650, "sodiumMg": 900}
	],
	"tasteProfile": {
		"likedEntityIds": [],
		"likedTagIds": ["urn:tag:genre:place:restaurant:japanese"]
	}
}
```

`consumedMeals` is a full-day snapshot, not an append operation. Duplicate `mealId` values and supplying both meal records and non-null daily intake totals are rejected to avoid double counting. Targets-only `dailySummary` is allowed with meal records. Missing nutrient values in any recorded meal make that day's corresponding total unknown; explicit `consumedMeals=[]` means zero recorded intake. Omitting both intake forms means unknown intake, not zero. Reinterpret the same session with a revised full snapshot to update records and invalidate old candidates, selection and taste cache. GET `/api/sessions/{sessionId}` retrieves the snapshot and expiry; DELETE removes it. Records expire and are lost on restart. Selection remains a preview and does not automatically record a meal as eaten.

After interpretation, POST `/api/recommend` with the same `sessionId`, `qlooEnabled=true` or `false`, and `limit` from 1 to 3. Refinement preserves the same catalog snapshot and only tightens eligibility. OFF performs no upstream requests. A five-minute session cache avoids repeated upstream calls; failed calls are not cached as successes. Nutrition and allergies never enter the Qloo request.

### Real menu data

Set `DATA_MODE=live_qloo` for live processing. To produce actual meal recommendations, also set `MENU_CATALOG_PATH` to a server-local JSON array of real `MenuCandidate` records. Without it, the response has `recommendations=[]`, `NO_VERIFIED_MENU_CATALOG` and a separate `placeDiscovery` list when Qloo succeeds. Never attach the fictional catalog to real restaurants. The existing frontend does not display `placeDiscovery` or collect the new profile fields yet; use Swagger or an API client for backend testing.

Each real menu record requires: `candidateId` (not `demo-*`), `qlooEntityId` (verified UUID), `placeName`, `menuName`, `city`, `price`, `currency`, `cuisine`, `observedAt` (not future), `menuSource` and `priceSource` (source URLs). Optional nutrient fields are `proteinG`, `fiberG`, `fatG`, `caloriesKcal`, `sodiumMg`, `fluidMl`; any known value requires `nutritionSource`. `allergenStatus=known` requires `allergenSource`; otherwise active allergy constraints exclude the record. `spicy=null` does not satisfy a no-spicy restriction. `ambience` is a list. The supported allergen list is limited to the eight API codes; cross-contamination is not verified.

Known walking times require `walkMinutes`, `walkOriginLat`, `walkOriginLng` and `walkSource`; they are usable only when the request origin matches within 0.0001 degrees. Otherwise walking time is null and cannot pass a walking limit. City matching is case-insensitive exact matching, not geocoding or translation. Catalog validation checks structure and presence of sources, not the truth/freshness of the cited content; the team must verify entity associations, portions, prices, ingredients and routes. Invalid/duplicate catalogs fail closed, rather than silently falling back to demo meals.

### Ranking policy and boundaries

Hard eligibility comes first: known allergy conflicts, unknown allergens under a restriction, spicy restrictions, currency, budget, walking limit, cuisine and ambience. Qloo cannot override these. ON/OFF operates on the same eligible menu IDs. Taste is the Qloo 0-1 affinity joined by UUID; place names are not join keys. Explainability is upstream cultural influence metadata, not a medical explanation. If no candidate has a taste signal or Qloo fails, baseline weights apply and `qlooUsed=false`.

The nutrition heuristic averages capped protein/fiber contribution and energy target closeness, then subtracts normalized excess energy/fat/sodium penalties. Meal targets are the lesser of daily target times `mealFraction` and remaining daily allowance. Fat is not a nutrient to maximize. Fluid is recorded for awareness, not inferred from restaurants. Unknown menu values score no positive nutrient contribution and remain visible as missing data. Default weights are nutrition/taste/convenience = 0.45/0.35/0.20 with taste, and 0.70/0/0.30 without. These are tunable product choices, not clinically validated weights. Convenience uses route time and a JPY-only price reference; other currencies are not implicitly converted. `scores` exposes components, penalties and actual weights.

Explicit user targets take precedence. Optional estimates only apply to general adults: Mifflin-St Jeor energy times a coarse activity factor, protein 0.8 g/kg (1.2 for active/protein-focus policy), fiber 14 g/1000 kcal, and sodium limit 2300 mg. Energy estimates outside 1200-5000 kcal are withheld for review, not clamped. Meal fraction/activity/protein-focus factors are policy defaults requiring professional review. `clinical` and `pregnancy` contexts never receive automatic targets; supplied targets are not independently verified as clinician-approved. Minors are unsupported. No disease, pregnancy, weight-loss or sports nutrition treatment is provided.

Reference context: [Mifflin-St Jeor](https://pubmed.ncbi.nlm.nih.gov/2305711/), [Dietary Guidelines](https://www.dietaryguidelines.gov/), [FDA sodium guidance](https://www.fda.gov/food/nutrition-education-resources-materials/sodium-your-diet), [Qloo Insights parameters](https://docs.qloo.com/reference/insights-api-deep-dive). Qloo HTTP requests have a four-second transport timeout, at most two attempts, a ten-second per-operation deadline and a twelve-second total recommendation taste deadline. `QLOO_REQUESTS_PER_MINUTE` caps upstream attempts per process, including retries. It is not per-account/per-user enforcement and multiplies with workers/instances. Add authentication, consent and durable storage before production health-profile use.
