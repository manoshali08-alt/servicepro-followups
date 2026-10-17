"""API tests. Need: pip install -r requirements-dev.txt ; run: python -m unittest discover -s tests -t ."""
import io, os, sqlite3, tempfile, unittest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from app.main import create_app


def xlsx(rows):
    wb = Workbook(); ws = wb.active
    for r in rows:
        ws.append(r)
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.db_path = os.path.join(tempfile.mkdtemp(), "t.db")
        self.app = create_app({"database": self.db_path, "admin_email": "a@x.com", "admin_password": "correct-horse-1",
                               "static": "/nonexistent"})
        self.c = TestClient(self.app)
        r = self.c.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"})
        self.assertEqual(r.status_code, 200, r.text)
        self.c.headers["X-CSRF-Token"] = r.json()["csrf"]

    def db(self):
        return sqlite3.connect(self.db_path)

    def do_import(self, name, data, mapping=None):
        r = self.c.post("/api/imports/upload", files={"file": (name, data)})
        self.assertEqual(r.status_code, 200, r.text)
        pid, m = r.json()["pending_id"], mapping or {"business_name": 0, "phone": 1, "customer_name": 2}
        self.assertEqual(self.c.post(f"/api/imports/{pid}/preview", json={"mapping": m}).status_code, 200)
        r = self.c.post(f"/api/imports/{pid}/confirm", json={"mapping": m})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["import_id"]

    def test_requires_login_and_csrf(self):
        anon = TestClient(self.app)
        self.assertEqual(anon.get("/api/customers").status_code, 401)
        self.assertEqual(anon.get("/api/dashboard").status_code, 401)
        del self.c.headers["X-CSRF-Token"]
        self.assertEqual(self.c.post("/api/customers", json={"phone": "9876543210"}).status_code, 403)

    def test_wrong_password_and_throttle(self):
        anon = TestClient(self.app)
        for _ in range(5):
            self.assertEqual(anon.post("/api/auth/login", json={"email": "a@x.com", "password": "nope"}).status_code, 401)
        self.assertEqual(anon.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"}).status_code, 429)

    def test_import_skips_duplicates_and_never_overwrites(self):
        h = ["Business", "Phone", "Name"]
        i1 = self.do_import("a.xlsx", xlsx([h, ["Alpha", 9876543210, "Ravi"], ["Alpha dup", "+91 98765-43210", "Other"],
                                            ["Bad", "123", "X"], ["Beta", "9123456780", "Sita"]]))
        con = self.db()
        self.assertEqual(con.execute("SELECT total,added,duplicates,invalid FROM imports WHERE id=?", (i1,)).fetchone(), (4, 2, 1, 1))
        con.execute("UPDATE customers SET notes='mine', status='Contacted' WHERE phone='+919876543210'"); con.commit()
        i2 = self.do_import("b.csv", b"Business,Phone,Name\nOverwrite?,098765 43210,Zed\nGamma,9000000001,Ann\n")
        self.assertEqual(con.execute("SELECT added,duplicates FROM imports WHERE id=?", (i2,)).fetchone(), (1, 1))
        self.assertEqual(con.execute("SELECT business_name,customer_name,notes,status FROM customers WHERE phone='+919876543210'").fetchone(),
                         ("Alpha", "Ravi", "mine", "Contacted"))
        self.assertEqual(con.execute("SELECT COUNT(*) FROM customers").fetchone()[0], 3)
        r = self.c.get(f"/api/imports/{i1}/skipped?format=xlsx")
        self.assertEqual(load_workbook(io.BytesIO(r.content)).active.max_row, 3)  # header + duplicate + invalid
        self.assertEqual(self.c.get(f"/api/imports/{i1}/skipped?format=csv").status_code, 200)

    def test_excel_date_cells_import_as_dates(self):
        from datetime import datetime
        self.do_import("d.xlsx", xlsx([["Biz", "Phone", "Name", "Trial End"], ["A", 9000000009, "N", datetime(2026, 11, 3)]]),
                       {"business_name": 0, "phone": 1, "customer_name": 2, "trial_end_date": 3})
        self.assertEqual(self.db().execute("SELECT trial_end_date,notes FROM customers").fetchone(), ("2026-11-03", ""))

    def test_database_enforces_unique_phone(self):
        con = self.db()
        con.execute("INSERT INTO customers (phone) VALUES ('+919876543210')")
        with self.assertRaises(sqlite3.IntegrityError):
            con.execute("INSERT INTO customers (phone) VALUES ('+919876543210')")

    def test_manual_duplicate_and_followup_flow(self):
        r = self.c.post("/api/customers", json={"phone": "9876543210", "business_name": "Z"})
        self.assertEqual(r.status_code, 201)
        cid = r.json()["id"]
        r = self.c.post("/api/customers", json={"phone": "+91 98765 43210"})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"]["existing_id"], cid)
        self.assertEqual(self.c.post("/api/customers", json={"phone": "123"}).status_code, 422)
        r = self.c.post(f"/api/customers/{cid}/followups", json={
            "contact_date": "2026-10-01", "method": "Call", "issue_type": "Problem", "issue": "Invoice print",
            "next_followup_date": "2026-10-05", "status": "Not Contacted"})
        self.assertEqual(r.status_code, 201, r.text)
        c = self.c.get(f"/api/customers/{cid}").json()
        self.assertEqual((c["customer"]["status"], c["customer"]["last_contact_date"], c["customer"]["next_followup_date"]),
                         ("Contacted", "2026-10-01", "2026-10-05"))
        self.assertEqual(len(c["history"]), 1)
        self.assertEqual(self.c.get("/api/report").json()["groups"]["Problem"][0]["text"], "Invoice print")
        self.assertEqual(self.c.get("/api/customers?q=98765").json()["total"], 1)
        self.assertEqual(self.c.get("/api/export?format=csv").status_code, 200)

    def test_staff_cannot_manage_users_or_delete(self):
        self.assertEqual(self.c.post("/api/users", json={"name": "S", "email": "s@x.com", "password": "longenough-1"}).status_code, 201)
        staff = TestClient(self.app)
        r = staff.post("/api/auth/login", json={"email": "s@x.com", "password": "longenough-1"})
        staff.headers["X-CSRF-Token"] = r.json()["csrf"]
        self.assertEqual(staff.get("/api/users").status_code, 403)
        self.assertEqual(staff.delete("/api/customers/1").status_code, 403)


if __name__ == "__main__":
    unittest.main()
