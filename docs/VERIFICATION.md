# Framework verification

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
