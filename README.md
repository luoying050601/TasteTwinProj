# TasteTwinProj

Repository: https://github.com/luoying050601/TasteTwinProj

Product name: TasteTwin.

TasteTwin chooses a next meal using nutrition goals, taste preferences, budget, and distance. The React frontend defaults to synthetic demo data. The FastAPI 0.2 backend also supports real Qloo restaurant discovery, adult personal profiles, daily meal records, and source-backed menu ranking. No LLM calls are made.

## Why Qloo matters

Qloo can connect liked artists, books, movies, brands or places to restaurant affinity, instead of relying only on cuisine keywords. The backend accepts verified entity/tag IDs and returns real affinity and explainability. Nutrition and allergy inputs are not Qloo signals. ON/OFF ranks the same eligible menu pool; OFF makes no Qloo request. Fixture mode still uses explicitly synthetic taste order.

## Architecture

React + TypeScript + Vite → FastAPI → rule interpreter → personal nutrition assessment → safety and eligibility filters → fixture or live Qloo adapter → source-backed menu/entity join → hybrid ranker → Preview.

See [中文架构与实施路线](docs/ARCHITECTURE.zh-CN.md) for design-document conflicts, interface decisions, module boundaries, and next steps.

## Qloo integration status

[apps/api/app/qloo.py](apps/api/app/qloo.py) implements official `/v2/insights` and `/v2/tags`, server-side authentication, bounded retries, affinity normalization, explainability and a per-process request budget. `/api/places` discovers real restaurants independently of the demo mode. `DATA_MODE=live_qloo` enables live recommendation processing; `MENU_CATALOG_PATH` supplies separately sourced menus joined by Qloo UUID, never by display name. Missing menus produce discovery-only results, not invented meals. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for examples. Real account credentials and coverage must still be verified after deployment.

## Run locally

Requires Node 22+ and Python 3.12+. From this repository root:

```bash
npm ci
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
npm run dev
```

- Frontend: http://127.0.0.1:5173
- API docs: http://127.0.0.1:3001/docs
- Health: http://127.0.0.1:3001/api/health

No secrets or environment files are needed for the default fixture demo. `.env.example` files show optional configuration. `VITE_API_BASE_URL` is the backend URL; `WEB_ORIGINS` is a comma-separated list of allowed frontend origins. Local scripts use Unix virtualenv paths; Windows users can launch uvicorn separately from their Python environment.

```bash
npm run typecheck
npm run build
npm run test
```

Home has four clickable sections: You (preferences), Today (nutrition summary), Discover (search and recommendations), and Twin (pixel companion and selected meal). The four sections share page-session state. In Discover: 找下一餐 → confirm → three meals → taste toggle → 再近一点 → two meals → select → Twin Preview. Explicit allergy codes: peanut, soy, milk, egg, wheat, fish, shellfish, sesame. The parser is limited and deterministic; always review the confirmation. The UI defaults to English and supports Japanese and Simplified Chinese. The header language selector preserves the current page and meal selection. Frontend and backend share copy in `apps/api/app/locales/{en-US,ja-JP,zh-CN}.json`; use matching keys and placeholders when editing translations.

## Demo mode versus live mode

Fixture results show `fixture`; turning taste OFF shows `baseline` plus `candidateSource=fixture`. Every result has synthetic provenance and a stable candidateId. Taste labels are rank buckets from fixture order, never probabilities. Nutrition goals use a labeled demo summary or manual input; omitted nutrition remains unavailable.

## Data sources and limitations

The default catalog contains five fictional Tokyo menus. Live mode never uses them. Unknown nutrition stays null; unknown allergens cannot pass an active allergy restriction. Real menus, nutrition, prices and routes require independent sources, not Qloo affinity. There is no map integration, diagnosis, cross-device account, database, Agent framework or model API. The current frontend does not yet collect the new personal/taste profiles or render the separate `placeDiscovery` list; these are backend API capabilities. Tests cover mock live responses, on/off, cache, source validation and failure fallback, not actual account acceptance.

## Safety and privacy

Health and allergy inputs stay within the backend. Qloo receives only allowlisted taste IDs, location and candidate entity IDs. Sessions use opaque UUIDs and a one-hour expiry in one process; restart discards all records. Treat the session UUID as a bearer capability. `/api/sessions/{session_id}` reads a snapshot; DELETE removes it. API responses use `Cache-Control: no-store`. Before public production use, add authenticated ownership, a shared durable store, per-user abuse controls and consent management. The global Qloo request budget is not a substitute for authentication. Logs omit request bodies; nutrition estimates are general wellness heuristics, not diagnosis or clinical plans.

## Deployment

Backend Render Blueprint: `render.yaml`; Python runtime, root `apps/api`, install requirements, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `WEB_ORIGINS` to the exact Vercel HTTPS origin. Keep one instance / worker.

Frontend Vercel: root `apps/web`, Vite framework, build `npm run build`, output `dist`. Set `VITE_API_BASE_URL` to the Render HTTPS URL. `vercel.json` contains the SPA fallback. Monorepo installs should include the repository root workspace lockfile. Both services are deployed. See `docs/DEPLOYMENT.md` for URLs and operational settings.

References: [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), [Render FastAPI](https://render.com/docs/deploy-fastapi), [Qloo official public API docs](https://github.com/qloo/docs-public).

## License

The generated application source is MIT licensed; see LICENSE. The supplied hero illustration is excluded from that source-code license; its public use needs the team's rights confirmation. Source design documents are not copied into the repository. Dependencies retain their own licenses.

## Demo and verification

The existing public demo is deployed; the latest local backend changes require a new deployment. Actual Qloo account acceptance and real-menu data remain unverified. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for local checks and historical browser verification.

## Kitchen scene interaction

The opening screen is a full-screen illustration; the entered kitchen uses a separate calm, original SVG background (`apps/web/public/kitchen-room.svg`). Enter opens a 2D kitchen hub with four object hotspots; each opens a scrollable dialog. The original pixel companion remains visible during input/search/selection. Hearts show only recorded protein progress toward the configured target (not a health diagnosis); choosing a meal changes the expression without changing recorded intake. Mobile dialogs appear below the companion. Copy remains in the shared three-language JSON files.

Interactive room: `KitchenRoom.tsx` renders cabinets and furniture as native elements. Fridge opens preferences, table opens nutrition records, wall map opens meal search, journal opens the companion view. Click the floor or use arrows/WASD to walk; movement is bounded and avoids the lower furniture zones. Opening a dialog pauses movement. Desktop furniture labels appear on hover/focus; mobile labels stay visible.
