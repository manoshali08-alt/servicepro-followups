CREATE TABLE users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE imports (
  id INTEGER PRIMARY KEY, filename TEXT NOT NULL, user_id INTEGER REFERENCES users(id),
  headers TEXT NOT NULL DEFAULT '[]', total INTEGER NOT NULL, added INTEGER NOT NULL,
  duplicates INTEGER NOT NULL, invalid INTEGER NOT NULL, blank INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE CHECK (length(phone) >= 8),   -- canonical, e.g. +919876543210
  business_name TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '',
  trial_end_date TEXT, status TEXT NOT NULL DEFAULT 'Not Contacted'
    CHECK (status IN ('Not Contacted','Contacted','Follow-up Needed','Follow-up Scheduled','Converted to Paid','Not Interested')),
  feedback TEXT NOT NULL DEFAULT '', next_followup_date TEXT, notes TEXT NOT NULL DEFAULT '',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL, last_contact_date TEXT,
  contact_method TEXT NOT NULL DEFAULT '', paid INTEGER NOT NULL DEFAULT 0,
  import_id INTEGER REFERENCES imports(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_next ON customers(next_followup_date);
CREATE TABLE followups (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_date TEXT NOT NULL, method TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '', issue_type TEXT NOT NULL DEFAULT '', issue TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '', next_followup_date TEXT,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_followups_customer ON followups(customer_id);
CREATE TABLE import_skipped (
  id INTEGER PRIMARY KEY, import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL, category TEXT NOT NULL, reason TEXT NOT NULL, raw_values TEXT NOT NULL
);
CREATE TABLE pending_imports (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, filename TEXT NOT NULL,
  headers TEXT NOT NULL, rows TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
