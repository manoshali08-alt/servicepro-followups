"""Safe parsing of CSV/XLSX/XLS uploads and row classification."""
import csv, io, re
from datetime import date, datetime
from .constants import STATUSES
from .phone import normalize_phone, to_text

MAX_ROWS = 20000
FIELDS = [("phone", "Phone number *"), ("customer_name", "Customer name"), ("business_name", "Business name"),
          ("trial_end_date", "Trial end date"), ("status", "Follow-up status"),
          ("feedback", "Feedback / problem"), ("notes", "Notes")]
SYN = {"phone": ["phone", "mobile", "contactnumber", "contactno", "whatsapp", "cell", "number", "tel", "contact"],
       "trial_end_date": ["trialend", "trialexpiry", "trialenddate", "expiry", "enddate"],
       "business_name": ["businessname", "business", "company", "shop", "firm", "store", "organization", "tenant"],
       "customer_name": ["customername", "contactname", "tenantname", "name", "owner", "person"],
       "status": ["followupstatus", "status"],
       "feedback": ["feedback", "problem", "issue", "remarks", "comment"],
       "notes": ["notes", "note"]}
STATUS_ALIASES = {"converted": "Converted to Paid", "paid": "Converted to Paid", "not interested": "Not Interested",
                  "follow up needed": "Follow-up Needed", "follow up scheduled": "Follow-up Scheduled",
                  "new": "Not Contacted", "pending": "Not Contacted"}


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


def classify(rows, mapping, existing):
    """existing: {phone: label} already in DB. Returns (results, blank_count).
    kind is one of: new, duplicate_db, duplicate_file, invalid."""
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
        status, status_note = parse_status(_val(vals, mapping, "status"))
        if status_note:
            notes.append(status_note)
        rec = {"phone": phone, "customer_name": to_text(_val(vals, mapping, "customer_name"))[:200],
               "business_name": to_text(_val(vals, mapping, "business_name"))[:200], "trial_end_date": trial,
               "status": status, "feedback": to_text(_val(vals, mapping, "feedback"))[:5000],
               "notes": "\n".join(notes)[:5000]}
        if err:
            kind, reason = "invalid", err
        elif phone in existing:
            kind, reason = "duplicate_db", f"Already in database ({existing[phone]})"
        elif phone in seen:
            kind, reason = "duplicate_file", f"Duplicate of row {seen[phone]} in this file"
        else:
            kind, reason = "new", ""
            seen[phone] = rn
        out.append({"row_number": rn, "kind": kind, "reason": reason, "record": rec,
                    "raw_phone": to_text(raw), "values": [to_text(v) for v in vals]})
    return out, blank
