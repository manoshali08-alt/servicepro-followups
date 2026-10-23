"""PostHog integration for ServicePro Follow-ups.
Fetches user statuses and activity using HogQL and syncs into the customers database.
"""
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .phone import normalize_phone

logger = logging.getLogger("servicepro.posthog")

# Default credentials fallback to project config or environment variables
DEFAULT_POSTHOG_API_KEY = "phx_NBi25YmY4dgxCPXktcLvbaheZ3YpLTQrMAqV8b8Ygt9irUsQ"
DEFAULT_POSTHOG_PROJECT_ID = "326668"
DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

# The exact HogQL Query provided by the user with 365-day interval boundary
# to prevent ClickHouse query timeout (504) on millions of events.
HOGQL_QUERY = """
WITH user_statuses AS (
    SELECT
        e.distinct_id,

        any(e.properties.$ip) AS ip_address,
        any(e.properties.utm_campaign) AS campaign,
        any(e.properties.$geoip_city_name) AS city,

        ifNull(
            any(e.person.properties.phone),
            any(e.properties.phoneNumber)
        ) AS phone_number,

        any(e.properties.$current_url) AS current_url,
        any(e.person.properties.plan_name) AS plan_name,
        any(e.person.properties.business_name) AS business_name,

        MAX(e.timestamp) AS last_activity,
        MIN(e.timestamp) AS first_activity,

        CASE
            WHEN SUM(
                CASE
                    WHEN e.event = 'subscription_payment_succeeded'
                    AND toString(e.properties.amount) NOT IN ('1', '3', '100', '300')
                    THEN 1
                    ELSE 0
                END
            ) > 0
            THEN 'Paid'

            WHEN SUM(
                CASE
                    WHEN e.event = 'trial_started'
                    THEN 1
                    ELSE 0
                END
            ) > 0
            THEN 'Trial'

            ELSE 'Free'
        END AS subscription_type,

        CASE
            WHEN SUM(
                CASE
                    WHEN e.event = 'business_setup_completed'
                    THEN 1
                    ELSE 0
                END
            ) > 0
            THEN 'Business Registered'
            ELSE 'OTP Signup'
        END AS signup_stage,

        COUNT(*) AS usage_count

    FROM events e
    WHERE
        e.timestamp >= now() - INTERVAL 365 DAY
        AND e.properties.$current_url LIKE '%service.buyp.ai%'
        AND e.properties.$ip != '122.165.244.134'
        AND e.event IN (
            'otp_sign_up_successful',
            'subscription_payment_succeeded',
            'trial_started',
            'user_signed_up',
            '$pageview',
            'business_setup_completed'
        )

    GROUP BY e.distinct_id

    HAVING SUM(
        CASE
            WHEN e.event != '$pageview'
            THEN 1
            ELSE 0
        END
    ) > 0
)

SELECT
    COUNT(*) OVER() AS total_unique_users,

    distinct_id,
    campaign,
    city,
    phone_number,
    business_name,
    ip_address,
    current_url,
    subscription_type,
    signup_stage,
    plan_name,

    CASE
        WHEN subscription_type = 'Paid'
             AND last_activity >= now() - INTERVAL 30 DAY
        THEN 'Active'

        WHEN subscription_type IN ('Free', 'Trial')
             AND last_activity >= now() - INTERVAL 15 DAY
        THEN 'Active'

        ELSE 'Inactive'
    END AS user_status,

    last_activity AS timestamp,
    usage_count,
    first_activity AS signup_date

FROM user_statuses
ORDER BY last_activity DESC
LIMIT 10000;
"""

EXCLUDED_PHONES = {"919342804461", "+919342804461", "9600698893", "+919600698893"}


def fetch_posthog_users(api_key: Optional[str] = None, project_id: Optional[str] = None, host: Optional[str] = None) -> List[Dict[str, Any]]:
    """Execute the HogQL query against PostHog Query API and return normalized user records."""
    key = api_key or os.environ.get("POSTHOG_API_KEY") or DEFAULT_POSTHOG_API_KEY
    pid = project_id or os.environ.get("POSTHOG_PROJECT_ID") or DEFAULT_POSTHOG_PROJECT_ID
    h = (host or os.environ.get("POSTHOG_HOST") or DEFAULT_POSTHOG_HOST).rstrip("/")

    url = f"{h}/api/projects/{pid}/query/"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": "ServicePro-Followups/1.0"
    }

    body = json.dumps({"query": {"kind": "HogQLQuery", "query": HOGQL_QUERY}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        logger.error(f"PostHog API Error {e.code}: {err_msg}")
        raise RuntimeError(f"PostHog query failed with status {e.code}: {err_msg}")
    except Exception as e:
        logger.error(f"PostHog request failed: {e}")
        raise RuntimeError(f"Could not reach PostHog API: {e}")

    results = data.get("results", [])
    records = []

    for row in results:
        # Columns:
        # 0: total_unique_users
        # 1: distinct_id
        # 2: campaign
        # 3: city
        # 4: phone_number
        # 5: business_name
        # 6: ip_address
        # 7: current_url
        # 8: subscription_type ('Paid', 'Trial', 'Free')
        # 9: signup_stage ('Business Registered', 'OTP Signup')
        # 10: plan_name
        # 11: user_status ('Active', 'Inactive')
        # 12: timestamp (last_activity)
        # 13: usage_count
        # 14: signup_date (first_activity)

        distinct_id = str(row[1]) if row[1] is not None else ""
        raw_phone = str(row[4]) if row[4] else (distinct_id if distinct_id.isdigit() and len(distinct_id) >= 10 else "")
        phone, err = normalize_phone(raw_phone)
        if not phone or err or phone in EXCLUDED_PHONES or raw_phone in EXCLUDED_PHONES:
            continue

        sub_type = str(row[8]) if row[8] in ("Paid", "Trial", "Free") else "Free"
        u_status = str(row[11]) if row[11] in ("Active", "Inactive") else "Inactive"
        stage = str(row[9]) if row[9] else "OTP Signup"
        usage = int(row[13]) if row[13] is not None else 1

        records.append({
            "phone": phone,
            "distinct_id": distinct_id,
            "business_name": (str(row[5]).strip() if row[5] else ""),
            "city": (str(row[3]).strip() if row[3] else ""),
            "campaign": (str(row[2]).strip() if row[2] else ""),
            "plan_name": (str(row[10]).strip() if row[10] else ""),
            "subscription_type": sub_type,
            "signup_stage": stage,
            "user_status": u_status,
            "usage_count": max(1, usage),
            "last_activity": str(row[12]) if row[12] else None,
            "signup_date": str(row[14]) if row[14] else None,
        })

    # Deduplicate by phone: combine usage_count, keep latest activity, prioritize Paid status
    merged: Dict[str, Dict[str, Any]] = {}
    for r in records:
        p = r["phone"]
        if p not in merged:
            merged[p] = dict(r)
        else:
            curr = merged[p]
            curr["usage_count"] += r["usage_count"]
            if r["subscription_type"] == "Paid":
                curr["subscription_type"] = "Paid"
            elif r["subscription_type"] == "Trial" and curr["subscription_type"] == "Free":
                curr["subscription_type"] = "Trial"

            if r["signup_stage"] == "Business Registered":
                curr["signup_stage"] = "Business Registered"

            if r["business_name"] and not curr["business_name"]:
                curr["business_name"] = r["business_name"]
            if r["city"] and not curr["city"]:
                curr["city"] = r["city"]
            if r["campaign"] and not curr["campaign"]:
                curr["campaign"] = r["campaign"]
            if r["plan_name"] and not curr["plan_name"]:
                curr["plan_name"] = r["plan_name"]

            # Keep latest activity
            if r["last_activity"] and (not curr["last_activity"] or r["last_activity"] > curr["last_activity"]):
                curr["last_activity"] = r["last_activity"]
                curr["user_status"] = r["user_status"]

    return list(merged.values())


def sync_posthog_to_db(db) -> Dict[str, int]:
    """Fetch from PostHog and sync/upsert into customers table."""
    users = fetch_posthog_users()
    added = 0
    updated = 0

    for u in users:
        phone = u["phone"]
        existing = db.execute("SELECT id, status, paid, business_name, usage_count, notes FROM customers WHERE phone=?", (phone,)).fetchone()

        is_paid = (u["subscription_type"] == "Paid")
        is_expired = (not is_paid and u["user_status"] == "Inactive")

        # Determine target status
        if is_paid:
            target_status = "Converted to Paid"
            paid_flag = 1
        elif is_expired:
            target_status = "Expired"
            paid_flag = 0
        else:
            target_status = "Not Contacted"
            paid_flag = 0

        # Format trial end date or dates if available
        trial_end = None
        if u["signup_date"] and u["subscription_type"] in ("Trial", "Free"):
            # Estimate trial end date as signup_date + 14 days
            try:
                dt = datetime.fromisoformat(u["signup_date"].replace("Z", "+00:00"))
                from datetime import timedelta
                trial_end = (dt + timedelta(days=14)).strftime("%Y-%m-%d")
            except Exception:
                pass

        if not existing:
            # Insert brand new customer
            db.execute(
                """
                INSERT INTO customers (
                    phone, business_name, customer_name, trial_end_date, status,
                    paid, subscription_type, user_status, usage_count, signup_stage,
                    city, campaign, plan_name, distinct_id, last_activity, signup_date,
                    notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                """,
                (
                    phone,
                    u["business_name"],
                    "",
                    trial_end,
                    target_status,
                    paid_flag,
                    u["subscription_type"],
                    u["user_status"],
                    u["usage_count"],
                    u["signup_stage"],
                    u["city"],
                    u["campaign"],
                    u["plan_name"],
                    u["distinct_id"],
                    u["last_activity"],
                    u["signup_date"],
                    f"Synced from PostHog (Stage: {u['signup_stage']}, City: {u['city'] or 'N/A'})"
                )
            )
            added += 1
        else:
            # Update existing customer
            curr_status = existing["status"]
            # If the user upgraded to Paid, upgrade status
            if is_paid and curr_status != "Converted to Paid":
                final_status = "Converted to Paid"
                final_paid = 1
            # If current status is initial (Not Contacted or Expired) and now inactive, mark as Expired
            elif curr_status in ("Not Contacted", "Expired"):
                final_status = target_status
                final_paid = paid_flag
            else:
                # Keep existing staff follow-up status (Contacted, Follow-up Scheduled, etc.)
                final_status = curr_status
                final_paid = 1 if (is_paid or existing["paid"]) else 0

            # Preserve existing business name if set, else use posthog
            biz = existing["business_name"] or u["business_name"]

            db.execute(
                """
                UPDATE customers SET
                    business_name=?,
                    status=?,
                    paid=?,
                    subscription_type=?,
                    user_status=?,
                    usage_count=?,
                    signup_stage=?,
                    city=?,
                    campaign=?,
                    plan_name=?,
                    distinct_id=?,
                    last_activity=?,
                    signup_date=?,
                    trial_end_date=COALESCE(trial_end_date, ?),
                    updated_at=datetime('now')
                WHERE id=?
                """,
                (
                    biz,
                    final_status,
                    final_paid,
                    u["subscription_type"],
                    u["user_status"],
                    u["usage_count"],
                    u["signup_stage"],
                    u["city"],
                    u["campaign"],
                    u["plan_name"],
                    u["distinct_id"],
                    u["last_activity"],
                    u["signup_date"],
                    trial_end,
                    existing["id"]
                )
            )
            updated += 1

    db.commit()
    logger.info(f"PostHog sync finished: {len(users)} users fetched, {added} added, {updated} updated")
    return {"total_fetched": len(users), "added": added, "updated": updated}
