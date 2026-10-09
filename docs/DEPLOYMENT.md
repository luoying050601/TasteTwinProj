# Demo deployment

Frontend: https://tastetwinproj.vercel.app
Backend: https://tastetwin-api.onrender.com
Health: https://tastetwin-api.onrender.com/api/health

## Vercel

Project `yin-g/tastetwinproj`. Repository root (`.`), `npm ci`, `npm run build`, output `apps/web/dist`. Root `vercel.json` controls the monorepo build. Production variable `VITE_API_BASE_URL=https://tastetwin-api.onrender.com`. Current deployment uses authenticated Vercel CLI. GitHub auto-deployment is awaiting GitHub App installation/authorization; it is not connected yet. To deploy manually: `vercel --prod --yes` from the repository root.

## Render

Service `tastetwin-api`, ID `srv-db46cd3l550s73anlftg`. GitHub repository `luoying050601/TasteTwinProj`, branch `main`, root `apps/api`, Singapore, Free instance. Python 3.12.8. Build `pip install -r requirements.txt`; start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health path `/api/health`. Auto deploy on commit is enabled.

Variables: `DATA_MODE=fixture`, `PYTHON_VERSION=3.12.8`, `WEB_ORIGINS=https://tastetwinproj.vercel.app`. One instance, one process; sessions expire after one hour and are lost on restart. Preview Vercel domains are not automatically added to CORS.

Free Render services sleep after inactivity, so first requests can take 50 seconds or more. Frontend request timeout is 90 seconds. No live Qloo or model calls are enabled.

Verified on 2026-10-09 (Asia/Tokyo): anonymous frontend HTTP 200, backend health HTTP 200, correct CORS preflight for the production frontend.

Public browser flow verified: interpret → confirm → 3 recommendations → Closer produces 2 at 10 minutes → select chicken bento → happy companion. Screenshot: `production-preview.png`. Local backend regression tests: 18 passed.
