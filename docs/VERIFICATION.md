# Framework verification

## Independent Fridge Taste Panel

The fridge opens a standalone Personal tastes panel, not the three-tab notebook. It reuses the current area/cuisine/allergy/avoidance form without book styling, profile fields, health fields or health-record requests. Closing restores the triggering control; the character notebook remains the full book starting on Personal profile. No new database/API changes or recommendation-data integration are introduced.

Eighteen Playwright tests, production build and four i18n tests passed. Fridge tests assert an independent dialog title, zero tabs/flyleaf/profile/health sections, zero health reads, saved region readback from the full character notebook, fridge focus return and document width at 1280/375/320px. Desktop/mobile standalone-panel screenshots were inspected. No commit or deployment performed.

## Persistent Region And Expanded Cuisines

Region is now saved with dietary preferences and restored on reload. Migration 003 adds only city and its column privileges, retaining existing preferences and health snapshots; older requests omitting city preserve its saved value. Keyword suggestions and explicit browser geolocation use Photon/OpenStreetMap; permission/network errors retain manual entry. Exact coordinates are not stored. Twenty-four cuisine choices have Chinese/Japanese/English labels and remain separate from recommendation logic.

Verified locally: 14 Playwright tests, 76 backend tests, production build and all three migrations via isolated PGlite. Browser checks cover saved location restoration, keyword keyboard selection, denied location permission, unavailable lookup with manual save, late-response suppression and 24 cuisine controls at desktop/mobile widths. Public Photon search/reverse smoke checks returned HTTP 200 with CORS support using canned Tokyo coordinates; no user's position was queried. The keyword candidate screenshot was inspected. Production service availability is not guaranteed, and actual Supabase migration 003/save acceptance remains operator work. No commit or deployment was performed.

## Book-style notebook interaction

Updated 2026-10-10: click character to reveal/collapse the adjacent notebook; only clicking the notebook opens the three data tabs. The standalone room profile popup is removed; initial registration remains unchanged. The revealed notebook tracks walking, and Escape on the character collapses it. Desktop notebook has a two-page spread and floating green/teal/rose leaf tabs; mobile uses top leaves with the form scrolling independently of the book header.

Eleven Playwright tests and production build passed. Coverage includes reveal/collapse/following, keyboard use, leaf labels/controls within the 1280/375/320px viewports, original character variants, profile edits and unchanged append-only health history. Desktop and mobile book screenshots were inspected. No API, database migration or data-saving rules changed in this UI update; production bundle warning remains.

## User notebook collection

Local implementation on 2026-10-10: three-language notebook beside the room character; basic profile form reuse; independently stored dietary preferences; complete health snapshots appended without historical overwrites; derived BMI, explicit unknown body fat, goal/chronotype/three meal habits, historical copy and unsaved-draft protection. Current city/cuisine/ambience remain form-only, not recommendation inputs or stored defaults.

Ten Playwright tests passed across 1280px, 375px and 320px, including original login/character flows and new collection, three-language switching, failed preference save retaining draft, copy/edit/add retaining original historical payload, reload persistence and ephemeral city reset. Desktop/375px notebook screenshots were inspected. The full production build passes with the existing bundle-size warning.

Full backend regression: 75 tests passed. Isolated PGlite PostgreSQL verification passed both migrations, two-user RLS, anonymous access denial, health UPDATE/DELETE denial, immutable timestamp input privileges, dietary identity column protection and selection consistency. The script is scripts/check-notebook-db.mjs; no cloud credentials are used. Dedicated backend tests cover input validation, snapshot append/replay/conflict/BMI and absence of health overwrite routes. Existing recommendation sessions are retained when notebook data is saved.

Actual Supabase execution of the new migration and real-account save/read/history verification are still pending. No cloud migration, commit or deployment was performed in this implementation. Health consent workflow, daily intake logs and recommendation integration are not part of this release.

## Room profile character update

The room character now directly opens personal information; the separate top-right account avatar has been removed. Saved gender and birth year/month drive both the room character and form preview. Twelve visual variants combine male/female/neutral styles with child (under 13), teen (13-17), adult (18-59) and senior (60+) presets. Other/undisclosed share neutral artwork. Age is inferred by UTC year/month, not exact birthday, and is not a medical or nutritional classification.

Locally verified: six Playwright portal tests passed at desktop, 375px and 320px widths, including all twelve variants, the 13/18/60 year month boundaries, saved profile restoration, keyboard editing/focus return and preserved room movement. Frontend production build and four i18n tests passed. Production build reports a bundle-size warning; physical phone testing and deployment remain outside this check.

## Supabase portal local verification

Implemented and locally verified on 2026-10-10:

- Backend: `python -m pytest tests -q` from `apps/api`: **52 passed** using the isolated Python 3.12 environment. Existing recommendation/Qloo/i18n tests use a deterministic test identity; dedicated authentication tests do not bypass the production auth dependency by default.
- Auth MockTransport checks verified email, correct user Bearer/apikey forwarding, identity UUID filtering, profile read/update and sanitized auth/provider failures. Profile validation rejects blank nicknames, invalid genders/months, future years, boolean years and extra email fields.
- API checks unauthenticated rejection, incomplete-profile gating, owner-only recommendation session read/refine/select/delete/reinterpretation, profile update persistence/readback, invalidation of only the owner's sessions, authenticated CORS and Swagger Bearer metadata.
- Frontend: `npm run build` passes TypeScript and Vite production compilation.
- Browser: `npm run test:portal --workspace @tastetwin/web`: **5 passed** using Chromium with mocked Supabase/Auth/API responses. A dedicated Vite server uses fake configuration and never connects to a live Supabase project. Run `npx playwright install chromium --only-shell` once to install its browser.
- At 1280x900, 375x812 and 320x740: cover image loaded, no document horizontal overflow, first-login mandatory profile, Escape cannot bypass onboarding, future birth month blocked, profile save, male/neutral icon changes, edit/read-only email, birth year/month revision, refresh restoration, close-focus return and logout. Compact avatar width and title height have explicit assertions. Desktop and 375px screenshots were visually inspected; artifacts are generated under `apps/web/test-results` and ignored by Git.
- Browser checks incorrect/expired-code recovery, resend countdown, three-language portal controls and Google PKCE authorization launch, successful code exchange and cancel callback cleanup. No browser runtime errors were observed in the tested profile flows.

Still **unverified**: running the migration against real Supabase Postgres; direct Data API RLS using two actual users and an anonymous key; real SMTP delivery/rate limits; Google provider permissions/callbacks; same-email identity linking in both login orders; live project pause/quota behavior; deployment of these changes; real iOS/Android controls. The existing Starlette/httpx TestClient deprecation warning remains.

Live acceptance checklist after configuration:

1. Execute the migration, then use account A and account B to confirm each can select/update only its own profile directly through the Data API; anonymous access and user updates to UUID/email/timestamps must fail. Client insert/delete must fail. Verify email uniqueness and future-month rejection.
2. Sign in via Google then email OTP with the same verified email, and repeat in reverse with a second account. UUID and saved profile must remain unchanged; do not manually merge unverified/different emails.
3. Verify first-signup and returning-user OTP delivery, six-digit template, expiry, provider-side limits, configured redirect allowlist and Google audience.
4. Confirm save/relogin survives API restart, while only temporary meal sessions expire. Reset must preserve basic profile. Another account must not be able to read, delete or overwrite a known meal-session UUID.
5. Inspect desktop/mobile three-language screens, token expiry/offline retries, account switching and logout; confirm no former account's results remain. Confirm no tokens or profile contents appear in server logs.

Historical verification below applies to earlier versions and does not certify the new live portal.

## Backend 0.2 local verification

Verified on 2026-10-09 using isolated Python 3.12 and the repository requirements: `python -m pytest tests -q`: **39 passed**. Coverage includes official Qloo GET request/header contracts with MockTransport, normalized UUID/affinity, sanitized 401/403/400 failures, bounded 429/5xx retry, per-process request budget, live discovery provenance, ON/OFF request isolation, stable menu pools, cached refinement without remaining taste matches, graceful baseline fallback, catalog sources/route origins, adult target estimates, unknown intake, duplicate meal rejection, session read/delete/no-store and three-language parity.

The existing Starlette/httpx TestClient deprecation warning remains. Actual Qloo credentials, account host/permissions, live result coverage, menu-source truth/freshness and the newly implemented API deployment are **not verified** by these mock tests. The current frontend remains the demo UI; new profile and discovery UI work is not included. Historical verification below describes earlier versions and is not a claim about live Qloo acceptance.

## Original fixture verification

Verified locally on 2026-10-09 (Asia/Tokyo), Node 22.22.0 and Python 3.14.6.

- npm run test: 18 backend tests pass, including four parameterized nutrition threshold cases.
- npm run typecheck: TypeScript passes.
- npm run build: Vite production build passes.
- Browser flow: sentence → confirmation → three meals → taste OFF changes first result from Sora to Hana → closer changes 15 to 10 minutes and returns two items → selection Preview → reset returns to input.
- 375 px viewport: input and Preview states report document scrollWidth=clientWidth=375. Full keyboard-only flow and all mobile result states have not been independently audited.
- 1280 px viewport: input state reports scrollWidth=clientWidth=1280; desktop screenshot saved as local-preview.jpg.
- API health reports fixture, rules parser, and Qloo/Agent not connected.
- Allergy conflict, unknown ingredients under allergy restrictions, empty results, missing location/currency, invalid input, session deletion, stale candidate selection and unsupported fixture city tested.
- Non-fixture DATA_MODE returns LIVE_NOT_IMPLEMENTED; fixture results never claim live integration.

A dependency warning reports httpx TestClient deprecation; no test failures. Cloud deployment, Python 3.12 deployment runtime, live Qloo requests/401/429/timeouts, model parsing, map estimates, real-menu provenance are not yet verified. requirements.lock.txt records the complete local dependency versions; requirements.txt pins direct dependencies.

Pixel companion update: TypeScript/Vite build passed; browser verified idle and selected happy SVG states through the full recommendation flow. Thinking and happy CSS animations respect prefers-reduced-motion.

Four-section interaction update: homepage shows four card buttons with no inline function panels. Browser verified You → peanut selection/save → Today → Discover; peanut appears in confirmation; three results refine to two at 10 minutes; meal selection opens Twin with the same meal values. Returning home preserves page-session settings. 375 px homepage reports scrollWidth=clientWidth=375. Architecture/developer trace text is absent from the main product view; fixture status remains accessible.

Language update: English default, Japanese and Simplified Chinese shared JSON dictionaries. Tests verify key/placeholder parity, three-language API flows, localized errors and identical recommendation values across languages. Frontend build passes. Language alone persists across browser reloads.

Responsive update: production build passes. Browser verified 375px home, recommendation and selected Twin at scrollWidth=clientWidth; 320px Twin has no horizontal overflow; 768px tablet home uses two columns and no horizontal overflow. Touch controls use 44px minimum targets, mobile inputs use 16px fonts. Desktop retains four cards. Real iOS/Android devices have not yet been tested.

Kitchen scene update: full-image entrance → kitchen hotspot → input/confirmation/recommendation dialog → selection → happy companion → close dialog verified in browser. At 375px, document width stays 375px, resident bottom 368px remains above dialog top 398px. Production build and 18 API tests pass. Dialog supports close button, Escape and keyboard focus containment.

Calm kitchen backdrop update: independent SVG with muted cabinets, tiles and floor. Desktop visual inspection and 375px dialog check passed (scrollWidth=clientWidth). Welcome image unchanged. Production build passes.

Furniture room update: browser verified click-floor movement (50%,80.6%), ArrowRight movement (53%,80.6%), fridge preference dialog and mobile table nutrition dialog. 375px has no horizontal overflow. Build and 18 backend tests pass. Character remains visible above mobile dialog.

Production deployment (2026-10-09): Vercel frontend anonymous HTTP 200, Render Python 3.12.8 fixture backend health HTTP 200, correct production-origin CORS preflight, full public browser interpret/recommend/refine/select flow passed. Both deployments completed successfully. Vercel Git auto-deployment awaits GitHub App authorization; Render auto-deploy is enabled.

Render full-site update: `/` returns HTML, `/tastetwin-hero.png` and `/docs` return 200. Public browser on onrender.com verified input → confirmation → three recommendations → selection. Local route checks verified SPA route 200, unknown /api and missing assets 404. API regression tests remain 18 passed.

Mobile camera update: at 375px, fixed room width is 900px; document width stays 375px. Browser drag moved camera scrollLeft from 262.5 to 452.5 without moving the avatar or opening a dialog. Furniture click still opens the meal dialog. Touch uses native two-axis scrolling; mouse drag supported. Real phone hardware gesture testing remains pending.
