# ServicePro Follow-ups (FastAPI + React)

Import trial customers from Excel/CSV, de-duplicate by phone number, and track follow-ups. Built for a small support team.

**Stack:** FastAPI (Python 3.12) · React 18 + Vite + React Router · SQLite (WAL) with SQL migrations · cookie sessions (DB-backed) · Docker.
One container serves the API (`/api/*`) and the built React app. SQLite on a persistent volume is plenty for tens of thousands of customers;
for multiple servers move to PostgreSQL (the SQL in `backend/migrations/001_init.sql` is plain).

## Run with Docker (simplest)
```
cp .env.example .env        # set ADMIN_EMAIL and ADMIN_PASSWORD
docker compose up --build   # open http://localhost:8000
```
Data lives in the `servicepro-data` volume. `ADMIN_*` only creates the first admin when there are no users; remove `ADMIN_PASSWORD` afterwards.

## Run for development
```
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' uvicorn app.main:create_app --factory --reload   # :8000 (API docs at /api/docs)
cd frontend && npm install && npm run dev                                                                    # :5173, proxies /api
```
## Tests
```
cd backend && python -m unittest discover -s tests -t .
```
`test_phone.py` / `test_importer.py`: phone normalisation, duplicate rules, date parsing. `test_api.py`: login/CSRF/roles, duplicate imports
(file vs DB, no overwrite, skipped report), DB-level UNIQUE(phone), follow-up flow (needs `httpx`, in requirements-dev).

## Behaviour
- Phones normalise to `+91XXXXXXXXXX` (spaces, hyphens, brackets, `+91`, `91`, `0`, `0091`, Excel number formats). Indian numbers must be 10 digits starting 6–9;
  landlines and cells with several numbers are reported invalid. Other `+country` numbers are kept as `+digits`.
- A row is skipped if its phone exists in the database or earlier in the same file; existing customers are never changed. Every skipped row is stored with its reason and downloadable (Excel/CSV).
  Fully blank rows are counted and ignored. Unparseable trial dates / unknown statuses are kept in the customer's notes, not dropped.
- Logging a follow-up updates last contact, next follow-up and status; “Converted to Paid” sets the paid flag.
- Feedback report groups follow-up issues by type (Problem / Feature request / Objection); keep issue wording short and consistent.

## Security
Login required for every API route; scrypt password hashes; random session tokens stored hashed, 12 h expiry, HttpOnly + SameSite=Lax cookie (Secure in production);
CSRF header required on every state-changing request; login throttling; Pydantic validation; parameterised SQL; 5 MB / 20,000-row limits and extension allow-list;
formula-injection protection on exports; admin-only user management/deletion; CSP and no-store headers; API docs disabled in production.
Phone numbers are only served to signed-in users. Serve over HTTPS and back up `/data/servicepro.db`.

## Deploy on Railway (or Render/Fly: any Docker host with a volume)
1. Push this folder to a private GitHub repo (Dockerfile at repo root).
2. Railway → New project → Deploy from GitHub repo. Add a **volume mounted at `/data`**.
3. Variables: `APP_ENV=production`, `DATABASE_PATH=/data/servicepro.db`, `RAILWAY_RUN_UID=0` (lets the container write to the volume), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Generate a public domain, open it, sign in, check `/healthz`. Then delete `ADMIN_PASSWORD` and add staff under **Team**.
