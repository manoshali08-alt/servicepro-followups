"""ServicePro Follow-ups: FastAPI backend (JSON API under /api, serves the built React app)."""
import csv, hashlib, io, json, os, re, secrets, sqlite3, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from pydantic import BaseModel, Field

from .core import importer
from .core.constants import CLOSED, ISSUE_TYPES, METHODS, OUTCOMES, STATUSES
from .core.phone import normalize_phone

ROOT = Path(__file__).resolve().parent.parent
COOKIE, MAX_UPLOAD = "sp_session", 5 * 1024 * 1024
SESSION_HOURS = 12


def hash_pw(p):
    salt = os.urandom(16)
    return f"scrypt${salt.hex()}${hashlib.scrypt(p.encode(), salt=salt, n=2**14, r=8, p=1).hex()}"


def check_pw(p, stored):
    try:
        _, salt, h = stored.split("$")
        got = hashlib.scrypt(p.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
        return secrets.compare_digest(got.hex(), h)
    except Exception:
        return False


DUMMY = hash_pw("not-a-real-password")


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class CustomerIn(BaseModel):
    phone: str = Field(max_length=40)
    business_name: str = Field("", max_length=200)
    customer_name: str = Field("", max_length=200)
    trial_end_date: Optional[str] = None
    status: str = "Not Contacted"
    feedback: str = Field("", max_length=5000)
    next_followup_date: Optional[str] = None
    notes: str = Field("", max_length=5000)
    assigned_to: Optional[int] = None
    last_contact_date: Optional[str] = None
    contact_method: str = ""


class FollowupIn(BaseModel):
    contact_date: str
    method: str = ""
    outcome: str = Field("", max_length=100)
    feedback: str = Field("", max_length=5000)
    issue_type: str = ""
    issue: str = Field("", max_length=2000)
    next_action: str = Field("", max_length=1000)
    next_followup_date: Optional[str] = None
    status: Optional[str] = None


class MappingIn(BaseModel):
    mapping: dict[str, int]


class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=200)
    password: str = Field(min_length=10, max_length=200)
    role: str = "staff"


def iso(v, label):
    v = (v or "").strip() if isinstance(v, str) else v
    if not v:
        return None
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, f"Invalid date for {label} (use YYYY-MM-DD)")
    return v


def create_app(overrides=None):
    cfg = {"database": os.environ.get("DATABASE_PATH", str(ROOT / "data" / "servicepro.db")),
           "env": os.environ.get("APP_ENV", "development"), "tz": os.environ.get("APP_TIMEZONE", "Asia/Kolkata"),
           "admin_email": os.environ.get("ADMIN_EMAIL", ""), "admin_password": os.environ.get("ADMIN_PASSWORD", ""),
           "static": os.environ.get("STATIC_DIR", str(ROOT / "static"))}
    cfg.update(overrides or {})
    prod = cfg["env"] == "production"
    app = FastAPI(title="ServicePro Follow-ups", docs_url=None if prod else "/api/docs", redoc_url=None,
                  openapi_url=None if prod else "/api/openapi.json")
    Path(cfg["database"]).parent.mkdir(parents=True, exist_ok=True)
    fails = {}

    def connect():
        c = sqlite3.connect(cfg["database"], timeout=15, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def migrate():
        c = connect()
        c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)")
        done = {r[0] for r in c.execute("SELECT name FROM schema_migrations")}
        for f in sorted((ROOT / "migrations").glob("*.sql")):
            if f.name not in done:
                c.executescript(f.read_text())
                c.execute("INSERT INTO schema_migrations VALUES (?)", (f.name,))
                c.commit()
        if cfg["admin_email"] and cfg["admin_password"] and not c.execute("SELECT 1 FROM users").fetchone():
            c.execute("INSERT INTO users (name,email,password_hash,role) VALUES ('Admin',?,?,'admin')",
                      (cfg["admin_email"].strip().lower(), hash_pw(cfg["admin_password"])))
            c.commit()
        c.close()
    migrate()

    def get_db():
        c = connect()
        try:
            yield c
        finally:
            c.close()

    def now_utc(plus_hours=0):
        return (datetime.now(timezone.utc) + timedelta(hours=plus_hours)).strftime("%Y-%m-%d %H:%M:%S")

    def today():
        return datetime.now(ZoneInfo(cfg["tz"])).date()

    def thash(tok):
        return hashlib.sha256(tok.encode()).hexdigest()

    def current_user(request: Request, db=Depends(get_db)):
        tok = request.cookies.get(COOKIE)
        if tok:
            u = db.execute("SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id "
                           "WHERE s.token_hash=? AND s.expires_at>? AND u.active=1", (thash(tok), now_utc())).fetchone()
            if u:
                if request.method not in ("GET", "HEAD", "OPTIONS") and \
                        not secrets.compare_digest(request.headers.get("x-csrf-token", ""), u["csrf"]):
                    raise HTTPException(403, "Invalid CSRF token. Reload the page.")
                return u
        raise HTTPException(401, "Not signed in")

    def admin_user(u=Depends(current_user)):
        if u["role"] != "admin":
            raise HTTPException(403, "Admins only")
        return u

    def public(u):
        return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"]}

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        r = await call_next(request)
        r.headers["X-Content-Type-Options"] = "nosniff"
        r.headers["X-Frame-Options"] = "DENY"
        r.headers["Referrer-Policy"] = "same-origin"
        r.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
        if request.url.path.startswith("/api"):
            r.headers["Cache-Control"] = "no-store"
        return r

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    # ---------- auth ----------
    @app.post("/api/auth/login")
    def login(body: LoginIn, request: Request, response: Response, db=Depends(get_db)):
        email = body.email.strip().lower()
        key = (request.client.host if request.client else "?", email)
        t = time.time()
        fails[key] = [x for x in fails.get(key, []) if t - x < 900]
        if len(fails[key]) >= 5:
            raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
        u = db.execute("SELECT * FROM users WHERE email=? AND active=1", (email,)).fetchone()
        ok = check_pw(body.password, u["password_hash"] if u else DUMMY)
        if not (u and ok):
            fails[key].append(t)
            raise HTTPException(401, "Incorrect email or password.")
        tok, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires_at<?", (now_utc(),))
        db.execute("INSERT INTO sessions (token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)",
                   (thash(tok), u["id"], csrf, now_utc(SESSION_HOURS)))
        db.commit()
        response.set_cookie(COOKIE, tok, httponly=True, samesite="lax", secure=prod, max_age=SESSION_HOURS * 3600, path="/")
        return {"user": public(u), "csrf": csrf}

    @app.get("/api/auth/me")
    def me(u=Depends(current_user)):
        return {"user": public(u), "csrf": u["csrf"]}

    @app.post("/api/auth/logout")
    def logout(request: Request, response: Response, u=Depends(current_user), db=Depends(get_db)):
        db.execute("DELETE FROM sessions WHERE token_hash=?", (thash(request.cookies.get(COOKIE, "")),))
        db.commit()
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    @app.get("/api/meta")
    def meta(u=Depends(current_user), db=Depends(get_db)):
        staff = [dict(r) for r in db.execute("SELECT id, name FROM users WHERE active=1 ORDER BY name")]
        return {"statuses": STATUSES, "methods": METHODS, "outcomes": OUTCOMES, "issue_types": ISSUE_TYPES,
                "closed": list(CLOSED), "staff": staff, "fields": importer.FIELDS, "today": today().isoformat()}

    # ---------- dashboard ----------
    @app.get("/api/dashboard")
    def dashboard(u=Depends(current_user), db=Depends(get_db)):
        t, week = today().isoformat(), (today() + timedelta(days=7)).isoformat()
        open_ = "status NOT IN ('Converted to Paid','Not Interested') AND next_followup_date"
        q = lambda sql, *p: db.execute(sql, p).fetchone()[0]
        stats = {"total": q("SELECT COUNT(*) FROM customers"),
                 "new_last_7_days": q("SELECT COUNT(*) FROM customers WHERE created_at >= datetime('now','-7 days')"),
                 "not_contacted": q("SELECT COUNT(*) FROM customers WHERE status='Not Contacted'"),
                 "due_today": q(f"SELECT COUNT(*) FROM customers WHERE {open_}=?", t),
                 "overdue": q(f"SELECT COUNT(*) FROM customers WHERE {open_}<?", t),
                 "upcoming": q(f"SELECT COUNT(*) FROM customers WHERE {open_}>? AND next_followup_date<=?", t, week),
                 "paid": q("SELECT COUNT(*) FROM customers WHERE status='Converted to Paid'")}
        due = db.execute(f"SELECT c.*, u.name AS staff FROM customers c LEFT JOIN users u ON u.id=c.assigned_to "
                         f"WHERE c.{open_}<=? ORDER BY c.next_followup_date LIMIT 15", (t,)).fetchall()
        return {"stats": stats, "due": [dict(r) for r in due]}

    # ---------- customers ----------
    def esc(s):
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def build_filters(a):
        w, p = [], []
        q = (a.get("q") or "").strip()[:100]
        if q:
            clause, like = "c.business_name LIKE ? ESCAPE '\\' OR c.customer_name LIKE ? ESCAPE '\\'", f"%{esc(q)}%"
            p += [like, like]
            digits = re.sub(r"\D", "", q)
            if len(digits) >= 3:
                clause += " OR c.phone LIKE ?"
                p.append(f"%{digits}%")
            w.append(f"({clause})")
        if a.get("status") in STATUSES:
            w.append("c.status=?"); p.append(a["status"])
        asg = a.get("assigned") or ""
        if asg == "none":
            w.append("c.assigned_to IS NULL")
        elif asg.isdigit():
            w.append("c.assigned_to=?"); p.append(int(asg))
        t = today().isoformat()
        open_ = "c.status NOT IN ('Converted to Paid','Not Interested') AND c.next_followup_date"
        due = a.get("due") or ""
        if due == "today":
            w.append(f"{open_}=?"); p.append(t)
        elif due == "overdue":
            w.append(f"{open_}<?"); p.append(t)
        elif due == "upcoming":
            w.append(f"{open_}>? AND c.next_followup_date<=?"); p += [t, (today() + timedelta(days=7)).isoformat()]
        if (a.get("import_id") or "").isdigit():
            w.append("c.import_id=?"); p.append(int(a["import_id"]))
        return (" WHERE " + " AND ".join(w)) if w else "", p

    @app.get("/api/customers")
    def list_customers(request: Request, u=Depends(current_user), db=Depends(get_db)):
        a = request.query_params
        where, p = build_filters(a)
        pg = a.get("page", "1")
        page = max(1, int(pg)) if pg.isdigit() else 1
        total = db.execute(f"SELECT COUNT(*) FROM customers c{where}", p).fetchone()[0]
        rows = db.execute(f"SELECT c.*, u.name AS staff FROM customers c LEFT JOIN users u ON u.id=c.assigned_to{where} "
                          f"ORDER BY c.created_at DESC, c.id DESC LIMIT 50 OFFSET ?", p + [(page - 1) * 50]).fetchall()
        return {"items": [dict(r) for r in rows], "total": total, "page": page, "pages": max(1, (total + 49) // 50)}

    COLS = ["phone", "business_name", "customer_name", "trial_end_date", "status", "feedback", "next_followup_date",
            "notes", "assigned_to", "last_contact_date", "contact_method", "paid"]

    def clean_customer(m: CustomerIn, db):
        phone, err = normalize_phone(m.phone)
        if err:
            raise HTTPException(422, f"Phone: {err}")
        if m.status not in STATUSES:
            raise HTTPException(422, "Invalid status")
        if m.contact_method not in METHODS + [""]:
            raise HTTPException(422, "Invalid contact method")
        if m.assigned_to is not None and not db.execute("SELECT 1 FROM users WHERE id=?", (m.assigned_to,)).fetchone():
            raise HTTPException(422, "Unknown staff member")
        return {"phone": phone, "business_name": m.business_name.strip(), "customer_name": m.customer_name.strip(),
                "trial_end_date": iso(m.trial_end_date, "trial end date"), "status": m.status, "feedback": m.feedback.strip(),
                "next_followup_date": iso(m.next_followup_date, "next follow-up"), "notes": m.notes.strip(),
                "assigned_to": m.assigned_to, "last_contact_date": iso(m.last_contact_date, "last contact"),
                "contact_method": m.contact_method, "paid": 1 if m.status == "Converted to Paid" else 0}

    @app.post("/api/customers", status_code=201)
    def create_customer(m: CustomerIn, u=Depends(current_user), db=Depends(get_db)):
        d = clean_customer(m, db)
        try:
            cur = db.execute(f"INSERT INTO customers ({','.join(COLS)}) VALUES ({','.join('?' * len(COLS))})", [d[k] for k in COLS])
            db.commit()
        except sqlite3.IntegrityError:
            ex = db.execute("SELECT id FROM customers WHERE phone=?", (d["phone"],)).fetchone()
            raise HTTPException(409, {"message": "This phone number already exists.", "existing_id": ex["id"] if ex else None})
        return {"id": cur.lastrowid}

    @app.get("/api/customers/{cid}")
    def get_customer(cid: int, u=Depends(current_user), db=Depends(get_db)):
        c = db.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "Customer not found")
        h = db.execute("SELECT f.*, u.name AS staff FROM followups f LEFT JOIN users u ON u.id=f.user_id "
                       "WHERE customer_id=? ORDER BY contact_date DESC, f.id DESC", (cid,)).fetchall()
        return {"customer": dict(c), "history": [dict(r) for r in h]}

    @app.put("/api/customers/{cid}")
    def update_customer(cid: int, m: CustomerIn, u=Depends(current_user), db=Depends(get_db)):
        if not db.execute("SELECT 1 FROM customers WHERE id=?", (cid,)).fetchone():
            raise HTTPException(404, "Customer not found")
        d = clean_customer(m, db)
        try:
            db.execute(f"UPDATE customers SET {','.join(k + '=?' for k in COLS)}, updated_at=datetime('now') WHERE id=?",
                       [d[k] for k in COLS] + [cid])
            db.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(409, {"message": "Another customer already uses that phone number."})
        return {"ok": True}

    @app.delete("/api/customers/{cid}")
    def delete_customer(cid: int, u=Depends(admin_user), db=Depends(get_db)):
        db.execute("DELETE FROM customers WHERE id=?", (cid,))
        db.commit()
        return {"ok": True}

    @app.post("/api/customers/{cid}/followups", status_code=201)
    def add_followup(cid: int, m: FollowupIn, u=Depends(current_user), db=Depends(get_db)):
        c = db.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "Customer not found")
        cd = iso(m.contact_date, "contact date")
        if not cd:
            raise HTTPException(422, "Contact date is required")
        nd = iso(m.next_followup_date, "next follow-up")
        status = m.status or c["status"]
        if m.method not in METHODS + [""] or m.issue_type not in ISSUE_TYPES + [""] or status not in STATUSES:
            raise HTTPException(422, "Invalid selection")
        if status == "Not Contacted":
            status = "Contacted"
        db.execute("INSERT INTO followups (customer_id,contact_date,method,outcome,feedback,issue_type,issue,next_action,"
                   "next_followup_date,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (cid, cd, m.method, m.outcome.strip(), m.feedback.strip(), m.issue_type, m.issue.strip(),
                    m.next_action.strip(), nd, u["id"]))
        last = max(x for x in [c["last_contact_date"], cd] if x)
        db.execute("UPDATE customers SET last_contact_date=?, contact_method=?, next_followup_date=?, status=?, paid=?, "
                   "updated_at=datetime('now') WHERE id=?",
                   (last, m.method or c["contact_method"], nd, status, 1 if status == "Converted to Paid" else 0, cid))
        db.commit()
        return {"ok": True}

    # ---------- export / downloads ----------
    def safe(v):
        v = "" if v is None else str(v)
        return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

    def table_response(headers, rows, fmt, name, phone_cols=()):
        rows = [[v if i in phone_cols else safe(v) for i, v in enumerate(r)] for r in rows]
        buf = io.BytesIO()
        if fmt == "csv":
            s = io.StringIO()
            w = csv.writer(s)
            w.writerow(headers)
            w.writerows(rows)
            buf.write(b"\xef\xbb\xbf" + s.getvalue().encode())
            mime, ext = "text/csv", "csv"
        else:
            wb = Workbook()
            ws = wb.active
            ws.append(headers)
            for r in rows:
                ws.append(r)
            wb.save(buf)
            mime, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
        buf.seek(0)
        return StreamingResponse(buf, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{name}.{ext}"'})

    @app.get("/api/export")
    def export(request: Request, u=Depends(current_user), db=Depends(get_db)):
        where, p = build_filters(request.query_params)
        rs = db.execute(f"SELECT c.*, u.name AS staff FROM customers c LEFT JOIN users u ON u.id=c.assigned_to{where} ORDER BY c.id", p).fetchall()
        h = ["Business name", "Customer name", "Phone", "Trial end date", "Status", "Feedback / problem", "Next follow-up",
             "Notes", "Assigned to", "Last contact", "Contact method", "Paid"]
        data = [[r["business_name"], r["customer_name"], r["phone"], r["trial_end_date"], r["status"], r["feedback"],
                 r["next_followup_date"], r["notes"], r["staff"], r["last_contact_date"], r["contact_method"],
                 "Yes" if r["paid"] else "No"] for r in rs]
        fmt = "csv" if request.query_params.get("format") == "csv" else "xlsx"
        return table_response(h, data, fmt, "customers", phone_cols=(2,))

    # ---------- import ----------
    def existing_for(db, rows, mapping):
        phones, out = list(importer.phones_in(rows, mapping)), {}
        for i in range(0, len(phones), 500):
            ch = phones[i:i + 500]
            for r in db.execute(f"SELECT phone, COALESCE(NULLIF(business_name,''), NULLIF(customer_name,''), 'no name') n "
                                f"FROM customers WHERE phone IN ({','.join('?' * len(ch))})", ch):
                out[r["phone"]] = r["n"]
        return out

    def get_pending(db, pid, u):
        r = db.execute("SELECT * FROM pending_imports WHERE id=? AND user_id=?", (pid, u["id"])).fetchone()
        if not r:
            raise HTTPException(404, "Upload not found or expired. Upload the file again.")
        return r, json.loads(r["headers"]), [(n, v) for n, v in json.loads(r["rows"])]

    def clean_mapping(m, headers):
        out = {k: v for k, v in m.items() if k in dict(importer.FIELDS) and 0 <= v < len(headers)}
        if "phone" not in out:
            raise HTTPException(422, "Choose which column holds the phone number.")
        return out

    def jsonable(v):
        return v.isoformat() if hasattr(v, "isoformat") else v

    @app.post("/api/imports/upload")
    def upload(file: UploadFile = File(...), u=Depends(current_user), db=Depends(get_db)):
        data = file.file.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "File is too large (limit 5 MB).")
        try:
            headers, rows = importer.read_upload(file.filename or "", data)
        except importer.ImportFileError as e:
            raise HTTPException(422, str(e))
        db.execute("DELETE FROM pending_imports WHERE created_at < datetime('now','-1 day')")
        cur = db.execute("INSERT INTO pending_imports (user_id,filename,headers,rows) VALUES (?,?,?,?)",
                         (u["id"], os.path.basename(file.filename or "upload")[:200], json.dumps(headers),
                          json.dumps([[n, [jsonable(v) for v in vals]] for n, vals in rows])))
        db.commit()
        return {"pending_id": cur.lastrowid, "filename": file.filename, "headers": headers, "row_count": len(rows),
                "mapping": importer.guess_mapping(headers)}

    @app.post("/api/imports/{pid}/preview")
    def preview(pid: int, body: MappingIn, u=Depends(current_user), db=Depends(get_db)):
        p, headers, rows = get_pending(db, pid, u)
        mp = clean_mapping(body.mapping, headers)
        res, blank = importer.classify(rows, mp, existing_for(db, rows, mp))
        counts = {k: sum(1 for r in res if r["kind"] == k) for k in ("new", "duplicate_db", "duplicate_file", "invalid")}
        return {"counts": counts, "total": len(res), "blank": blank,
                "rows": [{"row_number": r["row_number"], "kind": r["kind"], "reason": r["reason"], "raw_phone": r["raw_phone"],
                          **r["record"]} for r in res[:100]]}

    @app.post("/api/imports/{pid}/confirm")
    def confirm(pid: int, body: MappingIn, u=Depends(current_user), db=Depends(get_db)):
        p, headers, rows = get_pending(db, pid, u)
        mp = clean_mapping(body.mapping, headers)
        res, blank = importer.classify(rows, mp, existing_for(db, rows, mp))
        cur = db.execute("INSERT INTO imports (filename,user_id,headers,total,added,duplicates,invalid,blank) VALUES (?,?,?,0,0,0,0,?)",
                         (p["filename"], u["id"], json.dumps(headers), blank))
        iid, added, skipped = cur.lastrowid, 0, []
        for r in res:
            kind, reason = r["kind"], r["reason"]
            if kind == "new":
                rec = r["record"]
                try:  # UNIQUE(phone) in the database is the final guard against races
                    db.execute("INSERT INTO customers (phone,business_name,customer_name,trial_end_date,status,feedback,notes,paid,import_id)"
                               " VALUES (?,?,?,?,?,?,?,?,?)",
                               (rec["phone"], rec["business_name"], rec["customer_name"], rec["trial_end_date"], rec["status"],
                                rec["feedback"], rec["notes"], 1 if rec["status"] == "Converted to Paid" else 0, iid))
                    added += 1
                    continue
                except sqlite3.IntegrityError:
                    kind, reason = "duplicate_db", "Already in database (added by someone else during import)"
            skipped.append((iid, r["row_number"], kind, reason, json.dumps(r["values"])))
        db.executemany("INSERT INTO import_skipped (import_id,row_number,category,reason,raw_values) VALUES (?,?,?,?,?)", skipped)
        dup = sum(1 for s in skipped if s[2].startswith("duplicate"))
        db.execute("UPDATE imports SET total=?, added=?, duplicates=?, invalid=? WHERE id=?",
                   (len(res), added, dup, len(skipped) - dup, iid))
        db.execute("DELETE FROM pending_imports WHERE id=?", (pid,))
        db.commit()
        return {"import_id": iid}

    @app.get("/api/imports")
    def list_imports(u=Depends(current_user), db=Depends(get_db)):
        rs = db.execute("SELECT i.id,i.filename,i.total,i.added,i.duplicates,i.invalid,i.created_at,u.name AS who FROM imports i "
                        "LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC LIMIT 20").fetchall()
        return [dict(r) for r in rs]

    @app.get("/api/imports/{iid}")
    def import_detail(iid: int, u=Depends(current_user), db=Depends(get_db)):
        i = db.execute("SELECT id,filename,total,added,duplicates,invalid,blank,created_at FROM imports WHERE id=?", (iid,)).fetchone()
        if not i:
            raise HTTPException(404, "Import not found")
        sk = db.execute("SELECT row_number, category, reason FROM import_skipped WHERE import_id=? ORDER BY row_number LIMIT 200", (iid,)).fetchall()
        return {"import": dict(i), "skipped": [dict(r) for r in sk]}

    @app.get("/api/imports/{iid}/skipped")
    def skipped_report(iid: int, request: Request, u=Depends(current_user), db=Depends(get_db)):
        i = db.execute("SELECT * FROM imports WHERE id=?", (iid,)).fetchone()
        if not i:
            raise HTTPException(404, "Import not found")
        sk = db.execute("SELECT * FROM import_skipped WHERE import_id=? ORDER BY row_number", (iid,)).fetchall()
        data = [[s["row_number"], s["category"].replace("_", " "), s["reason"]] + json.loads(s["raw_values"]) for s in sk]
        fmt = "csv" if request.query_params.get("format") == "csv" else "xlsx"
        return table_response(["Row", "Category", "Reason"] + json.loads(i["headers"]), data, fmt, f"skipped-rows-import-{iid}")

    # ---------- report ----------
    @app.get("/api/report")
    def report(u=Depends(current_user), db=Depends(get_db)):
        groups = {t: [dict(r) for r in db.execute(
            "SELECT MIN(issue) AS text, COUNT(*) AS n, COUNT(DISTINCT customer_id) AS customers FROM followups "
            "WHERE issue_type=? AND TRIM(issue)<>'' GROUP BY LOWER(TRIM(issue)) ORDER BY n DESC, text LIMIT 25", (t,))]
            for t in ISSUE_TYPES}
        recent = db.execute("SELECT f.feedback, f.contact_date, c.id AS customer_id, c.business_name, c.customer_name FROM followups f "
                            "JOIN customers c ON c.id=f.customer_id WHERE TRIM(f.feedback)<>'' ORDER BY f.id DESC LIMIT 30").fetchall()
        rec = db.execute("SELECT id AS customer_id, business_name, customer_name, feedback FROM customers WHERE TRIM(feedback)<>'' "
                         "ORDER BY updated_at DESC LIMIT 30").fetchall()
        return {"groups": groups, "recent": [dict(r) for r in recent], "customer_feedback": [dict(r) for r in rec]}

    # ---------- users ----------
    @app.get("/api/users")
    def users(u=Depends(admin_user), db=Depends(get_db)):
        return [{k: r[k] for k in ("id", "name", "email", "role", "active")} for r in db.execute("SELECT * FROM users ORDER BY name")]

    @app.post("/api/users", status_code=201)
    def create_user(m: UserIn, u=Depends(admin_user), db=Depends(get_db)):
        email = m.email.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise HTTPException(422, "Enter a valid email address")
        try:
            db.execute("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
                       (m.name.strip(), email, hash_pw(m.password), "admin" if m.role == "admin" else "staff"))
            db.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That email is already registered.")
        return {"ok": True}

    @app.post("/api/users/{uid}/toggle")
    def toggle_user(uid: int, u=Depends(admin_user), db=Depends(get_db)):
        if uid == u["id"]:
            raise HTTPException(422, "You cannot deactivate yourself")
        db.execute("UPDATE users SET active=1-active WHERE id=?", (uid,))
        db.execute("DELETE FROM sessions WHERE user_id=? AND (SELECT active FROM users WHERE id=?)=0", (uid, uid))
        db.commit()
        return {"ok": True}

    # ---------- built React app ----------
    static = Path(cfg["static"])
    if (static / "index.html").exists():
        if (static / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")
            f = (static / full_path).resolve()
            if full_path and f.is_file() and static.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(static / "index.html")

    return app
