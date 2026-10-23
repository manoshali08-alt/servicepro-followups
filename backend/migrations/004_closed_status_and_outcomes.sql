PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS call_outcomes (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE COLLATE NOCASE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO call_outcomes (name) VALUES
  ('Answered'),
  ('No answer'),
  ('Busy / call back later'),
  ('Message sent'),
  ('Replied'),
  ('Wrong number');

CREATE TABLE customers_v4 (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE CHECK (length(phone) >= 8),
  business_name TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  trial_end_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not Contacted'
    CHECK (status IN ('Not Contacted','Expired','Contacted','Follow-up Needed','Follow-up Scheduled','Converted to Paid','Not Interested','Closed')),
  feedback TEXT NOT NULL DEFAULT '',
  next_followup_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_contact_date TEXT,
  contact_method TEXT NOT NULL DEFAULT '',
  paid INTEGER NOT NULL DEFAULT 0,
  import_id INTEGER REFERENCES imports(id),
  subscription_type TEXT NOT NULL DEFAULT 'Free',
  user_status TEXT NOT NULL DEFAULT 'Active',
  usage_count INTEGER NOT NULL DEFAULT 0,
  signup_stage TEXT NOT NULL DEFAULT 'OTP Signup',
  city TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  plan_name TEXT NOT NULL DEFAULT '',
  distinct_id TEXT NOT NULL DEFAULT '',
  last_activity TEXT,
  signup_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO customers_v4 (
  id, phone, business_name, customer_name, trial_end_date, status, feedback,
  next_followup_date, notes, assigned_to, last_contact_date, contact_method,
  paid, import_id, subscription_type, user_status, usage_count, signup_stage,
  city, campaign, plan_name, distinct_id, last_activity, signup_date,
  created_at, updated_at
)
SELECT
  id, phone, business_name, customer_name, trial_end_date, status, feedback,
  next_followup_date, notes, assigned_to, last_contact_date, contact_method,
  paid, import_id, subscription_type, user_status, usage_count, signup_stage,
  city, campaign, plan_name, distinct_id, last_activity, signup_date,
  created_at, updated_at
FROM customers;

DROP TABLE customers;
ALTER TABLE customers_v4 RENAME TO customers;

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_next ON customers(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_customers_usage ON customers(usage_count);

PRAGMA foreign_keys=ON;
