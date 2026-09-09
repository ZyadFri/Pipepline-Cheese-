# Production Deployment

## Architecture

```
Vercel (frontend, Vite/React SPA)
        |  HTTPS + JSON, VITE_API_URL
        v
Azure Container Apps (FastAPI backend, Docker, 1 replica)
        |                              |
        v                              v
Azure Database for PostgreSQL   Azure Files (mounted at /data)
  Flexible Server (Burstable)     uploads / docling cache / evidence / exports
```

- **Frontend**: Vercel project `frontend` (org `boctrusts-projects`).
- **Backend**: Azure Container Apps, region **France Central** (`francecentral`) — the
  only region this Azure for Students subscription allows for Postgres Flexible Server
  and Container Apps; Canadian regions and most US regions are blocked by subscription
  policy for these resource types.
- **Database**: Postgres Flexible Server, `Standard_B1ms` (Burstable, 1 vCore/2GiB),
  32GB storage, SSL enforced, firewall restricted to Azure services only.
- **Persistent storage**: one Azure Files share (`cheesedata`, Standard LRS), mounted
  into the container at `/data`. Every filesystem path the app already used
  (`UPLOAD_DIR`, `DOCLING_CACHE_DIR`, `CHART_CACHE_DIR`, `EXPORT_DIR`) is just an env
  var pointed under `/data/...` — no application code changed for this.
- **Container registry**: `acrcheesedbapp` (ACR Basic).
- **Compute**: 2 vCPU / 4GiB, `minReplicas=1, maxReplicas=1` (Docling is memory-heavy;
  a second replica would also duplicate local job state, and scale-to-zero would kill
  extraction jobs mid-run).
- **Shared Container Apps Environment**: `cae-cheese-shelflife` (in the sibling
  `rg-cheese-shelflife` resource group). This subscription caps Container Apps
  Environments at 1 per region — the sibling "Cheese Shelf-Life" project already used
  the one for France Central, so this app's Container App (`cheese-db-api`) was created
  *inside* that existing environment rather than requesting a second one. It is a
  separate Container App with its own image, secrets, database and storage — nothing
  is shared with the sibling app except the hosting environment and its Log Analytics
  workspace.

## Azure resources (resource group `rg-cheese-db`, region France Central)

| Resource | Name | Purpose |
|---|---|---|
| Resource Group | `rg-cheese-db` | Container for everything below |
| PostgreSQL Flexible Server | `pg-cheese-db` | Relational data (database `cheesedb`) |
| Storage Account | `stcheesedbdata` | Backs the Azure Files share |
| File Share | `cheesedata` (on `stcheesedbdata`) | Mounted at `/data` in the container |
| Container Registry | `acrcheesedbapp` | Hosts the `cheese-db-api` image |
| Container App | `cheese-db-api` | The FastAPI backend (lives in `cae-cheese-shelflife`, see above) |

## Environment variables (Container App secrets/env — names only)

| Name | Source | Notes |
|---|---|---|
| `DATABASE_URL` | secret | `postgresql://...@pg-cheese-db.postgres.database.azure.com:5432/cheesedb?sslmode=require` |
| `SECRET_KEY` | secret | JWT signing key |
| `OPENAI_API_KEY` | secret | LLM extraction fallback chain (OpenAI→Groq→Gemini) |
| `GROQ_API_KEY` | secret | Primary LLM provider (`AI_PROVIDER=groq`) |
| `GOOGLE_API_KEY` | secret | Gemini fallback for chart/vision calls |
| `AI_PROVIDER` | env | `groq` |
| `ALLOWED_ORIGINS` | env | Comma-separated exact origins: the Vercel production domain(s) + localhost dev |
| `UPLOAD_DIR` | env | `/data/uploads` |
| `DOCLING_CACHE_DIR` | env | `/data/docling_cache` |
| `CHART_CACHE_DIR` | env | `/data/chart_cache` |
| `EXPORT_DIR` | env | `/data/exports` |
| `PORT` | env | `8000` |

Vercel project env var: `VITE_API_URL` = the Container App's HTTPS FQDN (no trailing
`/api` — the frontend appends that itself).

No secret **values** are recorded in this file or anywhere in git.

## How to redeploy

**Backend** (from the repo root — the Dockerfile's build context is the repo root, not
`backend/`, so it can bundle `docs/demo/app_walkthrough.mp4` at the path the app
already expects):
```
az acr build --registry acrcheesedbapp --image cheese-db-api:v2 -f backend/Dockerfile .
az containerapp update --name cheese-db-api --resource-group rg-cheese-db \
  --image acrcheesedbapp.azurecr.io/cheese-db-api:v2
```

**Frontend**:
```
cd frontend
vercel --prod
```
(VITE_API_URL only needs to change if the backend's URL changes.)

## Local development is unaffected

- `DATABASE_URL` defaults to `sqlite:///./food_research.db` when unset — `uvicorn
  app.main:app --reload` still works exactly as before, no Postgres required locally.
- `UPLOAD_DIR`/`DOCLING_CACHE_DIR`/`CHART_CACHE_DIR`/`EXPORT_DIR` default to the same
  relative `uploads/...` paths as before when unset.
- `npm run dev` is unaffected; `VITE_API_URL` unset falls back to same-origin `/api`
  as it already did.

## Troubleshooting

- **Backend 502 / not responding**: `az containerapp logs show --name cheese-db-api
  --resource-group rg-cheese-db --tail 100`. Check `az containerapp revision list`
  for `HealthState`.
- **Extraction stuck at "processing"**: check logs for an OOM kill (Docling can be
  memory-heavy) — if so, raise `--cpu`/`--memory` on the container app, not replica
  count (min/max replicas must stay at 1; see Architecture above for why).
- **CORS errors in the browser**: `ALLOWED_ORIGINS` on the Container App must contain
  the *exact* Vercel domain (scheme + host, no path/trailing slash). Update with
  `az containerapp update --set-env-vars ALLOWED_ORIGINS=...`.
- **Files/images 404 after a redeploy**: confirm the Azure Files volume mount is still
  present in the revision (`az containerapp show` → `properties.template.volumes`) —
  data lives on the file share, not in the container, but the mount itself is part of
  the container app spec and must be preserved across `containerapp update` calls that
  replace the template.
- **Postgres connection refused**: check the server's firewall rules
  (`az postgres flexible-server firewall-rule list`) — only "Allow Azure services"
  should be present; the Container App reaches it over the public endpoint with
  `sslmode=require`.

## Cost control

- Budget alerts: this subscription's `az consumption budget create` CLI path rejected
  the request (API version mismatch in the current CLI/extension). Set them manually in
  the portal instead: **Cost Management + Billing → Budgets → Add** on this
  subscription, thresholds at $20/$50/$80 of the $100 credit.
- The single biggest cost driver is the Container App running 2 vCPU/4GiB continuously
  (`minReplicas=1`) — Docling's memory footprint made a smaller size risky to try
  first, but if credit consumption is a concern, `az containerapp update --cpu 1.0
  --memory 2Gi` and re-run a real extraction to confirm it doesn't OOM before keeping
  it.
