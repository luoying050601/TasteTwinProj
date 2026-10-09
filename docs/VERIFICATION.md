# Framework verification

Verified locally on 2026-10-09 (Asia/Tokyo), Node 22.22.0 and Python 3.14.6.

- npm run test: 14 backend tests pass, including four parameterized nutrition threshold cases.
- npm run typecheck: TypeScript passes.
- npm run build: Vite production build passes.
- Browser flow: sentence → confirmation → three meals → taste OFF changes first result from Sora to Hana → closer changes 15 to 10 minutes and returns two items → selection Preview → reset returns to input.
- 375 px viewport: input and Preview states report document scrollWidth=clientWidth=375. Full keyboard-only flow and all mobile result states have not been independently audited.
- 1280 px viewport: input state reports scrollWidth=clientWidth=1280; desktop screenshot saved as local-preview.jpg.
- API health reports fixture, rules parser, and Qloo/Agent not connected.
- Allergy conflict, unknown ingredients under allergy restrictions, empty results, missing location/currency, invalid input, session deletion, stale candidate selection and unsupported fixture city tested.
- Non-fixture DATA_MODE returns LIVE_NOT_IMPLEMENTED; fixture results never claim live integration.

A dependency warning reports httpx TestClient deprecation; no test failures. Cloud deployment, Python 3.12 deployment runtime, live Qloo requests/401/429/timeouts, model parsing, map estimates, English UI and real-menu provenance are not yet verified. requirements.lock.txt records the complete local dependency versions; requirements.txt pins direct dependencies.

Pixel companion update: TypeScript/Vite build passed; browser verified idle and selected happy SVG states through the full recommendation flow. Thinking and happy CSS animations respect prefers-reduced-motion.
