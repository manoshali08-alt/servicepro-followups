"""Safe parsing of CSV/XLSX/XLS uploads and row classification."""
import csv, io, re
from datetime import date, datetime
from .constants import STATUSES
from .phone import normalize_phone, to_text

MAX_ROWS = 20000
FIELDS = [("phone", "Phone number *"), ("customer_name", "Customer name"), ("business_name", "Business name"),
          ("trial_end_date", "Trial end date"), ("last_contact_date", "Customer Contacted / Last Contact Date"),
          ("status", "Follow-up status"), ("feedback", "Feedback / problem"), ("notes", "Notes")]
SYN = {"phone": ["phone", "mobile", "contactnumber", "contactno", "whatsapp", "cell", "number", "tel"],
       "trial_end_date": ["trialend", "trialexpiry", "trialenddate", "expiry", "enddate"],
       "business_name": ["businessname", "business", "company", "shop", "firm", "store", "organization", "tenant"],
       "customer_name": ["customername", "contactname", "tenantname", "name", "owner", "person"],
       "last_contact_date": ["customercontacted", "contacted", "contactdate", "lastcontact", "lastcontactdate", "lastcontacted", "calleddate", "callstatus"],
       "status": ["followupstatus", "status"],
       "feedback": ["feedback", "problem", "issue", "remarks", "comment", "customerfeedback"],
       "notes": ["notes", "note"]}
STATUS_ALIASES = {"converted": "Converted to Paid", "paid": "Converted to Paid", "not interested": "Not Interested",
                  "follow up needed": "Follow-up Needed", "follow up scheduled": "Follow-up Scheduled",
                  "new": "Not Contacted", "pending": "Not Contacted", "closed": "Closed", "close": "Closed",
                  "do not contact": "Closed", "contacted": "Contacted"}


class ImportFileError(Exception):
    pass


def _clean_headers(hs):
    out, seen = [], set()
    for i, h in enumerate(hs):
        h = to_text(h) or f"Column {i + 1}"
        base, n = h, 2
        while h in seen:
            h, n = f"{base} ({n})", n + 1
        seen.add(h)
        out.append(h)
    return out


def read_upload(filename, data):
    """Return (headers, [(row_number, [values])]). Raises ImportFileError."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp1252", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        rows = list(csv.reader(io.StringIO(text), dialect))
    elif ext == "xlsx":
        from openpyxl import load_workbook
        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            rows = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        except Exception:
            raise ImportFileError("Could not read this .xlsx file. Is it a valid, unprotected Excel file?")
    elif ext == "xls":
        try:
            import xlrd
        except ImportError:
            raise ImportFileError("Old .xls support is not installed on the server. Save the file as .xlsx or .csv.")
        try:
            book = xlrd.open_workbook(file_contents=data)
            sh = book.sheet_by_index(0)
            rows = []
            for r in range(sh.nrows):
                vals = []
                for c in range(sh.ncols):
                    cell = sh.cell(r, c)
                    if cell.ctype == xlrd.XL_CELL_DATE:
                        vals.append(xlrd.xldate.xldate_as_datetime(cell.value, book.datemode))
                    else:
                        vals.append(cell.value)
                rows.append(vals)
        except Exception:
            raise ImportFileError("Could not read this .xls file. Try saving it as .xlsx or .csv.")
    else:
        raise ImportFileError("Unsupported file type. Upload .xlsx, .xls or .csv.")
    numbered = [(i + 1, r) for i, r in enumerate(rows)]
    while numbered and all(to_text(v) == "" for v in numbered[0][1]):
        numbered.pop(0)
    if not numbered:
        raise ImportFileError("The file is empty.")
    headers = _clean_headers(numbered[0][1])
    body = numbered[1:]
    if len(body) > MAX_ROWS:
        raise ImportFileError(f"Too many rows ({len(body)}). Limit is {MAX_ROWS} per upload; split the file.")
    w = len(headers)
    return headers, [(n, [(r[i] if i < len(r) else None) for i in range(w)]) for n, r in body]


def _norm(h):
    return re.sub(r"[^a-z0-9]", "", h.lower())


def guess_mapping(headers):
    nh, used, mapping = [_norm(h) for h in headers], set(), {}
    for exact in (True, False):
        for f, _ in FIELDS:
            if f in mapping:
                continue
            for i, h in enumerate(nh):
                if i in used or not h:
                    continue
                if any((h == s) if exact else (s in h) for s in SYN[f]):
                    mapping[f] = i
                    used.add(i)
                    break
    return mapping


def parse_date(v):
    """Return (iso_date|None, ok). Blank is ok. Day-first for ambiguous text (Indian format)."""
    if v is None or to_text(v) == "":
        return None, True
    if isinstance(v, datetime):
        return v.date().isoformat(), True
    if isinstance(v, date):
        return v.isoformat(), True
    s = to_text(v)
    try:
        return datetime.fromisoformat(s).date().isoformat(), True
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y",
                "%d %b %Y", "%d %B %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat(), True
        except ValueError:
            pass
    return None, False


def parse_contacted(v):
    """Return (contact_date, is_contacted, unparsed_note). Blank is ok."""
    if v is None or to_text(v) == "":
        return None, False, None
    s = to_text(v).strip()
    s_clean = re.sub(r"[^a-z0-9]", "", s.lower())
    if s_clean in ("yes", "y", "true", "1", "contacted", "done", "called", "contact"):
        return None, True, None
    if s_clean in ("no", "n", "false", "0", "notcontacted", "pending", "uncontacted"):
        return None, False, None
    d, ok = parse_date(v)
    if ok and d:
        return d, True, None
    return None, False, f"Contacted (unparsed): {s}"


def parse_status(v):
    s = to_text(v)
    if not s:
        return "Not Contacted", None
    for st in STATUSES:
        if s.lower() == st.lower():
            return st, None
    alias = STATUS_ALIASES.get(re.sub(r"[-_]+", " ", s.lower()))
    return (alias, None) if alias else ("Not Contacted", f"Imported status: {s}")


def _val(vals, mapping, f):
    i = mapping.get(f)
    return vals[i] if i is not None and i < len(vals) else None


def phones_in(rows, mapping):
    return {p for _, vals in rows for p in [normalize_phone(_val(vals, mapping, "phone"))[0]] if p}


def classify(rows, mapping, existing, update_existing=True):
    """existing: {phone: label} already in DB. Returns (results, blank_count).
    kind is one of: new, update_db, duplicate_db, duplicate_file, invalid."""
    seen, out, blank = {}, [], 0
    for rn, vals in rows:
        if all(to_text(v) == "" for v in vals):
            blank += 1
            continue
        raw = _val(vals, mapping, "phone")
        phone, err = normalize_phone(raw)
        note = to_text(_val(vals, mapping, "notes"))
        notes = [note] if note else []
        trial, ok = parse_date(_val(vals, mapping, "trial_end_date"))
        if not ok:
            notes.append(f"Trial end (unparsed): {to_text(_val(vals, mapping, 'trial_end_date'))}")
        contact_date, is_contacted, contact_note = parse_contacted(_val(vals, mapping, "last_contact_date"))
        if contact_note:
            notes.append(contact_note)
        status, status_note = parse_status(_val(vals, mapping, "status"))
        if status_note:
            notes.append(status_note)
        if is_contacted and status == "Not Contacted":
            status = "Contacted"
        rec = {"phone": phone, "customer_name": to_text(_val(vals, mapping, "customer_name"))[:200],
               "business_name": to_text(_val(vals, mapping, "business_name"))[:200], "trial_end_date": trial,
               "last_contact_date": contact_date, "status": status,
               "feedback": to_text(_val(vals, mapping, "feedback"))[:5000],
               "notes": "\n".join(notes)[:5000]}
        has_feedback_or_contact = bool(rec["feedback"] or rec["last_contact_date"] or (rec["status"] and rec["status"] != "Not Contacted"))
        if err:
            kind, reason = "invalid", err
        elif phone in existing:
            if update_existing and has_feedback_or_contact:
                kind, reason = "update_db", f"Already in database ({existing[phone]}) — will append feedback/status"
            else:
                kind, reason = "duplicate_db", f"Already in database ({existing[phone]})"
        elif phone in seen:
            if update_existing and has_feedback_or_contact:
                kind, reason = "update_db", f"Same number as row {seen[phone]} in this file — will append feedback/status"
            else:
                kind, reason = "duplicate_file", f"Duplicate of row {seen[phone]} in this file"
        else:
            kind, reason = "new", ""
            seen[phone] = rn
        out.append({"row_number": rn, "kind": kind, "reason": reason, "record": rec,
                    "raw_phone": to_text(raw), "values": [to_text(v) for v in vals]})
    return out, blank


FEEDBACK_FIELDS = [
    ("phone", "Phone number *"),
    ("feedback", "Customer Feedback / Remarks *"),
    ("issue", "Issue Summary"),
    ("issue_type", "Issue Category (Problem / Feature request / Objection)"),
    ("contact_date", "Contact / Call Date"),
    ("customer_name", "Customer Name"),
    ("business_name", "Business / Company Name"),
    ("outcome", "Call Outcome"),
    ("method", "Contact Method"),
    ("duration_seconds", "Call Duration (Seconds)"),
    ("next_action", "Next Action"),
    ("next_followup_date", "Next Follow-up Date"),
    ("status", "Follow-up Status"),
]

FEEDBACK_SYN = {
    "phone": ["phone", "mobile", "contactnumber", "contactno", "whatsapp", "cell", "number", "tel"],
    "feedback": ["feedback", "customerfeedback", "remarks", "comment", "notes", "conversation", "response", "detail"],
    "issue": ["issue", "issuesummary", "topic", "subject", "complaint", "request", "title", "problem"],
    "issue_type": ["issuetype", "category", "type", "feedbacktype", "classification", "issuecategory"],
    "contact_date": ["contactdate", "calldate", "date", "contactedon", "calledon", "timestamp", "lastcontact"],
    "customer_name": ["customername", "contactname", "name", "client", "person", "tenant"],
    "business_name": ["businessname", "business", "company", "firm", "shop", "organization"],
    "outcome": ["outcome", "calloutcome", "result", "disposition"],
    "method": ["method", "contactmethod", "channel", "mode"],
    "duration_seconds": ["duration", "durationseconds", "durationsec", "talktime", "calllength", "seconds"],
    "next_action": ["nextaction", "action", "nextstep", "todo"],
    "next_followup_date": ["nextfollowupdate", "nextfollowup", "nextcalldate", "followupdate", "nextdate"],
    "status": ["status", "customerstatus", "followupstatus"],
}


def guess_feedback_mapping(headers):
    nh, used, mapping = [_norm(h) for h in headers], set(), {}
    for exact in (True, False):
        for f, _ in FEEDBACK_FIELDS:
            if f in mapping:
                continue
            for i, h in enumerate(nh):
                if i in used or not h:
                    continue
                if any((h == s) if exact else (s in h) for s in FEEDBACK_SYN[f]):
                    mapping[f] = i
                    used.add(i)
                    break
    return mapping


def parse_duration(v):
    if v is None or to_text(v) == "":
        return 0
    s = to_text(v).strip()
    if ":" in s:
        parts = s.split(":")
        if len(parts) == 2:
            try:
                return max(0, int(parts[0]) * 60 + int(parts[1]))
            except ValueError:
                pass
        elif len(parts) == 3:
            try:
                return max(0, int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]))
            except ValueError:
                pass
    try:
        return max(0, int(float(s)))
    except ValueError:
        return 0


def parse_issue_type(v):
    if not v:
        return ""
    s = to_text(v).strip().lower()
    if any(k in s for k in ("problem", "bug", "defect", "error", "issue", "trouble", "fail", "crash", "slow")):
        return "Problem"
    if any(k in s for k in ("feature", "request", "suggest", "enhancement", "ask", "want", "need", "add")):
        return "Feature request"
    if any(k in s for k in ("objection", "pricing", "expensive", "cost", "competitor", "doubt", "hesitat", "price")):
        return "Objection"
    return ""


def parse_method(v):
    if not v:
        return "Call"
    s = to_text(v).strip().lower()
    if "wa" in s or "whats" in s:
        return "WhatsApp"
    if "sms" in s or "text" in s:
        return "SMS"
    if "email" in s or "mail" in s:
        return "Email"
    if "person" in s or "visit" in s or "meet" in s:
        return "In person"
    if "call" in s or "phone" in s or "tel" in s:
        return "Call"
    return "Call"


def classify_feedback(rows, mapping, existing_phones):
    out, blank = [], 0
    seen_in_file = {}
    for rn, vals in rows:
        if all(to_text(v) == "" for v in vals):
            blank += 1
            continue
        raw_phone = _val(vals, mapping, "phone")
        phone, phone_err = normalize_phone(raw_phone)
        feedback = to_text(_val(vals, mapping, "feedback"))[:5000]
        issue = to_text(_val(vals, mapping, "issue"))[:2000]

        contact_date, _ = parse_date(_val(vals, mapping, "contact_date"))
        next_followup, _ = parse_date(_val(vals, mapping, "next_followup_date"))
        issue_type = parse_issue_type(_val(vals, mapping, "issue_type"))
        method = parse_method(_val(vals, mapping, "method"))
        outcome = to_text(_val(vals, mapping, "outcome"))[:100]
        duration = parse_duration(_val(vals, mapping, "duration_seconds"))
        next_action = to_text(_val(vals, mapping, "next_action"))[:1000]
        customer_name = to_text(_val(vals, mapping, "customer_name"))[:200]
        business_name = to_text(_val(vals, mapping, "business_name"))[:200]
        status, _ = parse_status(_val(vals, mapping, "status"))

        rec = {
            "phone": phone,
            "feedback": feedback,
            "issue": issue,
            "issue_type": issue_type,
            "contact_date": contact_date,
            "customer_name": customer_name,
            "business_name": business_name,
            "outcome": outcome,
            "method": method,
            "duration_seconds": duration,
            "next_action": next_action,
            "next_followup_date": next_followup,
            "status": status,
        }

        if phone_err:
            kind, reason = "invalid", phone_err
        elif not feedback and not issue:
            kind, reason = "invalid", "Feedback or Issue summary is required"
        elif phone in existing_phones:
            kind, reason = "existing_customer", f"Matched existing customer ({existing_phones[phone]})"
        elif phone in seen_in_file:
            kind, reason = "existing_customer", f"Same number as row {seen_in_file[phone]} in file (will append as another feedback)"
        else:
            kind, reason = "new_customer", "New customer will be created"
            seen_in_file[phone] = rn

        out.append({
            "row_number": rn,
            "kind": kind,
            "reason": reason,
            "record": rec,
            "raw_phone": to_text(raw_phone),
            "values": [to_text(v) for v in vals]
        })
    return out, blank
