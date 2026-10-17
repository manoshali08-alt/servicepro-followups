"""Phone normalisation. Canonical form: '+91XXXXXXXXXX' for India, '+<digits>' otherwise."""
import re
from decimal import Decimal, InvalidOperation

_ALLOWED = re.compile(r"[+\d\s\-().]+")


def to_text(v):
    """Cell value -> clean text. Handles Excel floats (9876543210.0) and sci-notation text."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        if v != v:
            return ""
        return str(int(v)) if v == int(v) else repr(v)
    s = str(v).strip()
    if re.fullmatch(r"\d+(\.\d+)?[eE]\+?\d+", s):
        try:
            return str(int(Decimal(s)))
        except (InvalidOperation, ValueError):
            pass
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".")[0]
    return s


def _indian(national):
    return len(national) == 10 and national[0] in "6789"


def normalize_phone(raw):
    """Return (canonical_phone, None) or (None, error_message)."""
    s = to_text(raw)
    if not s:
        return None, "Missing phone number"
    if len([p for p in re.split(r"[/,;]|\bor\b", s) if len(re.sub(r"\D", "", p)) >= 7]) > 1:
        return None, "Multiple phone numbers in one cell"
    if not _ALLOWED.fullmatch(s):
        return None, "Phone contains letters or invalid characters"
    plus = s.lstrip().startswith("+")
    d = re.sub(r"\D", "", s)
    if d.startswith("00"):
        d, plus = d[2:], True
    if plus:
        if d.startswith("91"):
            n = d[2:]
            if len(n) == 11 and n[0] == "0":
                n = n[1:]
            return ("+91" + n, None) if _indian(n) else (None, "Invalid Indian mobile number after +91")
        if 8 <= len(d) <= 15 and d[0] != "0":
            return "+" + d, None
        return None, "Invalid international phone number"
    if _indian(d):
        return "+91" + d, None
    if len(d) == 11 and d[0] == "0" and _indian(d[1:]):
        return "+91" + d[1:], None
    if len(d) == 12 and d.startswith("91") and _indian(d[2:]):
        return "+" + d, None
    return None, "Not a valid 10-digit Indian mobile number"
