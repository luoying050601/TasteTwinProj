# TasteTwinProj

Repository: https://github.com/luoying050601/TasteTwinProj

Product name: TasteTwin.

TasteTwin is a framework for choosing a next meal using nutrition goals, taste preferences, budget, and distance. The current version runs locally with a React frontend and a Python FastAPI backend. All restaurant, menu, nutrition, price, walking-time, and taste data are synthetic fixtures; no live Qloo or LLM calls are made.

## Why Qloo matters

The intended live product uses Qloo cultural taste signals to discover and rank real places. Today the ON/OFF control rehearses this behavior on one eligible synthetic candidate pool. It demonstrates algorithmic re-ranking, not proof of Qloo integration.

## Architecture

React + TypeScript + Vite → FastAPI → rule interpreter → deterministic nutrition engine → safety and eligibility filters → fixture taste adapter → menu catalog → hybrid ranker → Preview.

See [中文架构与实施路线](docs/ARCHITECTURE.zh-CN.md) for design-document conflicts, interface decisions, module boundaries, and next steps.

## Qloo integration status

`apps/api/app/qloo.py` contains the provider boundary and an intentionally unimplemented live adapter. `DATA_MODE=fixture` is the only supported mode. A configured non-fixture mode returns `LIVE_NOT_IMPLEMENTED` from recommend instead of pretending to be live. Never reuse the fictional catalog as real restaurant menus. Qloo entity resolution, real insights requests, menu joins, provenance, bounded retries and account validation are still required.

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

Five fictional candidate records are in `catalog.py`. Unknown nutrition is null, unknown allergen records do not pass active allergy restrictions, and empty results retain safety conditions. Only the fictional Tokyo scenario is supported. There is no real menu, map, health prediction, cross-device account, database, Agent framework, or model API. `trace` represents executed deterministic functions. Tests cover the fixture flow; live upstream failure tests remain pending.

## Safety and privacy

Health and allergy inputs stay within the local backend. The Qloo provider interface only receives taste and city fields. Sessions use UUIDs and a one-hour expiry in a single process; restart discards all sessions. Start over deletes the active backend session. Only the language preference is stored in browser localStorage; health inputs and sessions are not persisted there. Use a single worker and a single instance until a shared session store is implemented. Logs omit full input bodies; nutrition values are general dietary support, not diagnosis.

## Deployment

Backend Render Blueprint: `render.yaml`; Python runtime, root `apps/api`, install requirements, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `WEB_ORIGINS` to the exact Vercel HTTPS origin. Keep one instance / worker.

Frontend Vercel: root `apps/web`, Vite framework, build `npm run build`, output `dist`. Set `VITE_API_BASE_URL` to the Render HTTPS URL. `vercel.json` contains the SPA fallback. Monorepo installs should include the repository root workspace lockfile. Both deployments are configuration-ready, but have not been deployed or tested on cloud platforms.

References: [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), [Render FastAPI](https://render.com/docs/deploy-fastapi), [Qloo official public API docs](https://github.com/qloo/docs-public).

## License

The generated application source is MIT licensed; see LICENSE. The supplied hero illustration is excluded from that source-code license; its public use needs the team's rights confirmation. Source design documents are not copied into the repository. Dependencies retain their own licenses.

## Demo and verification

Local preview is available at the addresses above while the dev process runs. Cloud URL, public visibility for judging, actual Qloo response evidence, agent framework proof, English UI, and submission recording remain future work. See `docs/VERIFICATION.md` for checks performed on this framework.

## Kitchen scene interaction

The opening screen is a full-screen illustration; the entered kitchen uses a separate calm, original SVG background (`apps/web/public/kitchen-room.svg`). Enter opens a 2D kitchen hub with four object hotspots; each opens a scrollable dialog. The original pixel companion remains visible during input/search/selection. Hearts show only recorded protein progress toward the configured target (not a health diagnosis); choosing a meal changes the expression without changing recorded intake. Mobile dialogs appear below the companion. Copy remains in the shared three-language JSON files.

Interactive room: `KitchenRoom.tsx` renders cabinets and furniture as native elements. Fridge opens preferences, table opens nutrition records, wall map opens meal search, journal opens the companion view. Click the floor or use arrows/WASD to walk; movement is bounded and avoids the lower furniture zones. Opening a dialog pauses movement. Desktop furniture labels appear on hover/focus; mobile labels stay visible.
