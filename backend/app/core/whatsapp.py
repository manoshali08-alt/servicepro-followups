import base64
import json
import os
import re
import time
import urllib.parse
import urllib.request
import urllib.error

API_BASE = os.environ.get("WHATSAPP_API_BASE", "http://156.67.104.74:8029/api").rstrip("/")
API_KEY = os.environ.get("WHATSAPP_API_KEY", "owa_k1_ec5b3665eda3b924a2e71535ea751fb795210096ae448f5ffa6b18043b0e716f")

WAAPI_URL = os.environ.get("WAAPI_URL", "https://waapi.buypapps.com/v1/message/send-message")
WAAPI_TOKEN = os.environ.get("WAAPI_TOKEN", "6a936b34e8c1946bdb327d93a61dcfb5a8e18ad0d24a9c2ffc7668f129ed557d8eaac8b77b7e8d62b6ac1a15415a36a31a0ea4626e67e7d2748909b4eb5e0f94")


def format_phone_for_api(phone: str) -> str:
    cleaned = re.sub(r"\D", "", str(phone))
    if len(cleaned) == 10:
        if any(cleaned.startswith(p) for p in ["65", "91", "60", "61", "44"]):
            return cleaned
        return f"91{cleaned}"
    return cleaned


def send_via_waapi(phone: str, text: str = None, template_name: str = None, parameters: list = None, header_image_url: str = None):
    to_phone = format_phone_for_api(phone)
    url = f"{WAAPI_URL}?token={WAAPI_TOKEN}"

    if template_name:
        defaults_expired = [
            "Valued Customer",
            "ServicePro",
            "ServicePro",
            "Customer Follow-up, Lead Tracking & Reminders",
            "Special 20% discount on renewal!",
            "9047281212",
            "https://servicepro.app",
            "ServicePro"
        ]
        defaults_call_attempt = [
            "Valued Customer",
            "ServicePro",
            "ServicePro",
            "Customer Follow-up, Lead Tracking & Reminders",
            "14",
            "ServicePro",
            "9047281212"
        ]

        raw_params = list(parameters or [])
        active_defaults = defaults_expired

        if template_name in ["expired_trial_customer_reengagement", "trial_expired"]:
            template_name = "expired_trial_customer_reengagement"
            active_defaults = defaults_expired
            if len(raw_params) == 7:
                # Meta expects 8 parameters because Software Name appears twice:
                # [1:customer, 2:software, 3:software, 4:features, 5:offer, 6:contact, 7:website, 8:company]
                raw_params = [raw_params[0], raw_params[1], raw_params[1], raw_params[2], raw_params[3], raw_params[4], raw_params[5], raw_params[6]]
            while len(raw_params) < 8:
                raw_params.append(defaults_expired[len(raw_params)])
            raw_params = raw_params[:8]
        elif template_name in ["trial_call_attempt_followup", "call_not_attended"]:
            template_name = "trial_call_attempt_followup"
            active_defaults = defaults_call_attempt
            header_image_url = None
            if len(raw_params) == 6:
                # Meta expects 7 parameters because Software Name appears twice:
                # [1:customer, 2:software, 3:software, 4:features, 5:trial_days, 6:company, 7:contact]
                raw_params = [raw_params[0], raw_params[1], raw_params[1], raw_params[2], raw_params[3], raw_params[4], raw_params[5]]
            while len(raw_params) < 7:
                raw_params.append(defaults_call_attempt[len(raw_params)])
            raw_params = raw_params[:7]

        params_list = []
        for i, p in enumerate(raw_params):
            val = str(p).strip() if p is not None else ""
            if not val:
                val = active_defaults[i] if i < len(active_defaults) else "Info"
            params_list.append({"type": "text", "text": val})

        components = []

        # 1. Image Header: strictly for templates supporting media image header (NOT for trial_call_attempt_followup)
        if template_name != "trial_call_attempt_followup" and (template_name == "expired_trial_customer_reengagement" or header_image_url):
            img_url = header_image_url
            if not img_url or not str(img_url).startswith("http"):
                img_url = "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop&q=80"
            components.append({
                "type": "header",
                "parameters": [
                    {
                        "type": "image",
                        "image": {
                            "link": img_url
                        }
                    }
                ]
            })

        # 2. Body parameters
        components.append({
            "type": "body",
            "parameters": params_list
        })

        # 3. Button parameter only if otp_servicepro_app
        if template_name == "otp_servicepro_app" and params_list:
            components.append({
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [params_list[0]]
            })

        payload = {
            "to": to_phone,
            "type": "template",
            "template": {
                "language": {
                    "policy": "deterministic",
                    "code": "en"
                },
                "name": template_name,
                "components": components
            }
        }
    else:
        payload = {
            "to": to_phone,
            "type": "text",
            "text": {
                "body": text or ""
            }
        }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=18) as resp:
            raw_text = resp.read().decode("utf-8")
            try:
                return json.loads(raw_text)
            except Exception:
                return {"ok": True, "raw": raw_text}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        # Try language code 'en_US' if template was approved under en_US in Meta
        if template_name and payload.get("template", {}).get("language", {}).get("code") == "en":
            try:
                payload["template"]["language"]["code"] = "en_US"
                req_alt = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req_alt, timeout=18) as resp_alt:
                    return json.loads(resp_alt.read().decode("utf-8"))
            except Exception:
                pass
        raise RuntimeError(f"Meta WhatsApp API Error ({e.code}): {err_msg}")


def slugify_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "whatsapp-session"


def _request(endpoint, method="GET", payload=None, timeout=25):
    url = f"{API_BASE}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return json.loads(raw.decode("utf-8"))
            elif "image/" in content_type:
                b64 = base64.b64encode(raw).decode("ascii")
                return {"qr": f"data:{content_type};base64,{b64}", "status": "SCAN_QR_CODE"}
            try:
                return json.loads(raw.decode("utf-8"))
            except Exception:
                return {"raw": raw.decode("utf-8", errors="replace")}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message") or err_json.get("error") or err_body
        except Exception:
            msg = err_body
        raise RuntimeError(f"WhatsApp API Error ({e.code}): {msg}")
    except Exception as e:
        raise RuntimeError(f"Could not connect to WhatsApp gateway ({API_BASE}): {str(e)}")


def list_sessions():
    sessions = []
    # Always include Meta WhatsApp Cloud API as the primary active session
    meta_session = {
        "id": "meta-cloud-api",
        "name": "Meta WhatsApp API (Official)",
        "status": "Connected",
        "raw_status": "ready",
        "phone": "Official Cloud API",
        "push_name": "BuypApps Meta Cloud API",
        "engine_loaded": True
    }
    sessions.append(meta_session)

    try:
        res = _request("/sessions?all=true")
    except Exception:
        try:
            res = _request("/sessions")
        except Exception:
            res = []

    raw_list = []
    if isinstance(res, list):
        raw_list = res
    elif isinstance(res, dict) and "data" in res and isinstance(res["data"], list):
        raw_list = res["data"]

    for s in raw_list:
        if s.get("id") != "meta-cloud-api":
            sessions.append(s)
    return sessions


def create_session(name: str):
    clean_name = slugify_name(name)
    try:
        res = _request("/sessions", method="POST", payload={"name": clean_name})
        session_id = res.get("id") or (res.get("data") and res["data"].get("id")) or clean_name
        if session_id:
            try:
                _request(f"/sessions/{session_id}/start", method="POST")
            except Exception:
                pass
        return res
    except RuntimeError as e:
        err_msg = str(e).lower()
        if "already exist" in err_msg or "409" in err_msg or "conflict" in err_msg:
            # Session already exists on gateway (stopped or inactive). Start it!
            try:
                _request(f"/sessions/{clean_name}/start", method="POST")
            except Exception:
                pass
            return {"id": clean_name, "name": clean_name, "status": "STARTING"}
        raise e


def resolve_session_id(sid_or_name: str) -> str:
    try:
        sessions = list_sessions()
        # First priority: find by name to get real UUID
        for s in sessions:
            sname = str(s.get("name") or "")
            sid = str(s.get("id") or s.get("session_id") or "")
            if sname.lower() == sid_or_name.lower() and sid:
                return sid
        # Second priority: find by id
        for s in sessions:
            sid = str(s.get("id") or s.get("session_id") or "")
            if sid.lower() == sid_or_name.lower():
                return sid
    except Exception:
        pass
    return sid_or_name


def start_session(session_id: str):
    real_id = resolve_session_id(session_id)
    return _request(f"/sessions/{real_id}/start", method="POST")


def reconnect_session(session_id: str):
    real_id = resolve_session_id(session_id)
    try:
        return _request(f"/sessions/{real_id}/reconnect", method="POST")
    except Exception:
        try:
            return _request(f"/session/{real_id}/reconnect", method="POST")
        except Exception:
            return start_session(real_id)


def stop_session(session_id: str):
    real_id = resolve_session_id(session_id)
    return _request(f"/sessions/{real_id}/stop", method="POST")


def delete_session(session_id: str):
    real_id = resolve_session_id(session_id)
    try:
        return _request(f"/sessions/{real_id}?force=true", method="DELETE")
    except Exception:
        try:
            return _request(f"/sessions/{real_id}", method="DELETE")
        except Exception:
            try:
                return _request(f"/sessions/{real_id}/stop", method="POST")
            except Exception:
                return {"ok": True}


def get_qr(session_id: str):
    real_id = resolve_session_id(session_id)

    qr_val = None
    status = "SCAN_QR_CODE"
    raw_debug = {}

    auth_headers = {
        "x-api-key": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "image/png, image/*, application/json"
    }

    # Fetch QR code without restarting the engine repeatedly
    try:
        req = urllib.request.Request(
            f"{API_BASE}/sessions/{real_id}/qr",
            headers=auth_headers
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            ct = resp.headers.get("Content-Type", "")
            raw_bytes = resp.read()
            if "image/" in ct:
                b64 = base64.b64encode(raw_bytes).decode("ascii")
                qr_val = f"data:{ct};base64,{b64}"
                return {"status": "SCAN_QR_CODE", "qr": qr_val, "session_id": real_id}
            else:
                try:
                    res_json = json.loads(raw_bytes.decode("utf-8"))
                    raw_debug["res_json"] = res_json
                    status = res_json.get("status") or status
                    qr_val = (res_json.get("qr_code") or res_json.get("qr") or 
                              res_json.get("value") or res_json.get("data") or 
                              res_json.get("qrcode") or res_json.get("raw"))
                except Exception:
                    pass
    except Exception as e:
        raw_debug["err1"] = str(e)

    # Attempt 2: If not image, try ?format=image
    if not qr_val or not str(qr_val).startswith("data:image"):
        try:
            req2 = urllib.request.Request(
                f"{API_BASE}/sessions/{real_id}/qr?format=image",
                headers=auth_headers
            )
            with urllib.request.urlopen(req2, timeout=12) as resp:
                ct = resp.headers.get("Content-Type", "")
                raw_bytes = resp.read()
                if "image/" in ct:
                    b64 = base64.b64encode(raw_bytes).decode("ascii")
                    qr_val = f"data:{ct};base64,{b64}"
                    return {"status": "SCAN_QR_CODE", "qr": qr_val, "session_id": real_id}
        except Exception as e:
            raw_debug["err2"] = str(e)

    # Attempt 3: If qr_val is raw string (e.g. 2@... or base64 without prefix)
    if qr_val and isinstance(qr_val, str) and not qr_val.startswith("data:image"):
        if qr_val.startswith("iVBORw0KGgo"):
            qr_val = f"data:image/png;base64,{qr_val}"
        else:
            try:
                qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data={urllib.parse.quote(qr_val)}"
                with urllib.request.urlopen(qr_url, timeout=6) as r:
                    b64 = base64.b64encode(r.read()).decode("ascii")
                    qr_val = f"data:image/png;base64,{b64}"
            except Exception as e:
                raw_debug["err_convert"] = str(e)

    return {
        "status": status,
        "qr": qr_val,
        "session_id": real_id,
        "debug": raw_debug
    }


def get_session_status(session_id: str):
    real_id = resolve_session_id(session_id)
    try:
        return _request(f"/sessions/{real_id}")
    except Exception:
        sessions = list_sessions()
        matched = next((s for s in sessions if str(s.get("id", "")).lower() == str(real_id).lower() or str(s.get("name", "")).lower() == str(session_id).lower()), None)
        if matched:
            return matched
        raise RuntimeError(f"Session '{session_id}' not found")


def send_message(session_id: str = None, phone: str = "", template_id: str = None, template_variables: dict = None, text: str = None, template_name: str = None, header_image_url: str = None):
    # 1. Primary: If Meta Cloud API is selected or default
    use_waapi = (
        not session_id or 
        session_id == "meta-cloud-api" or 
        str(session_id).lower().startswith("meta")
    )

    if (use_waapi or template_name) and WAAPI_TOKEN:
        try:
            if template_name:
                params = []
                if template_variables:
                    if "params" in template_variables and isinstance(template_variables["params"], list):
                        params = template_variables["params"]
                    else:
                        params = list(template_variables.values())
                elif text:
                    params = [text]
                return send_via_waapi(phone=phone, template_name=template_name, parameters=params, header_image_url=header_image_url)
            
            # Send text / rendered template body
            return send_via_waapi(phone=phone, text=text or "")
        except Exception as waapi_err:
            # If Meta Cloud API is specifically chosen or template sending requested, do NOT fallback to personal sessions!
            if session_id == "meta-cloud-api" or template_name:
                raise waapi_err
            # Only fallback if general text message failed on default gateway
            connected_sessions = [s for s in list_sessions() if s.get("id") != "meta-cloud-api" and (s.get("phone") or s.get("raw_status") == "ready")]
            if connected_sessions:
                try:
                    fb_sid = connected_sessions[0].get("id")
                    fb_p = format_phone_for_api(phone)
                    fb_payload = {"phone": fb_p, "recipient": fb_p, "session_id": fb_sid, "text": text or "", "message": text or ""}
                    return _request("/messages/send", method="POST", payload=fb_payload)
                except Exception:
                    pass
            raise waapi_err

    # 2. Secondary fallback: Send via OpenWA Gateway session
    real_sid = resolve_session_id(session_id)
    clean_phone = format_phone_for_api(phone)
    payload = {
        "phone": clean_phone,
        "recipient": clean_phone,
        "session_id": real_sid,
    }
    if text:
        payload["text"] = text
        payload["message"] = text
    elif template_id:
        payload["template_id"] = template_id
        if template_variables:
            payload["template_variables"] = template_variables
    return _request("/messages/send", method="POST", payload=payload)

