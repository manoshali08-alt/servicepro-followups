import unittest
from datetime import datetime
from app.core import importer


class ClassifyTests(unittest.TestCase):
    def test_duplicates_in_file_and_db_and_invalid(self):
        rows = [(2, ["A", "98765 43210"]), (3, ["B", "+91-9876543210"]), (4, ["C", "9123456780"]),
                (5, ["D", "12"]), (6, ["", ""]), (7, ["E", "9988776655"])]
        res, blank = importer.classify(rows, {"business_name": 0, "phone": 1}, {"+919123456780": "Existing Co"})
        self.assertEqual([r["kind"] for r in res], ["new", "duplicate_file", "duplicate_db", "invalid", "new"])
        self.assertEqual(blank, 1)
        self.assertIn("row 2", res[1]["reason"])

    def test_invalid_row_does_not_block_later_valid_duplicate_detection(self):
        res, _ = importer.classify([(2, ["x", "bad"]), (3, ["y", "9000000001"]), (4, ["z", "09000000001"])], {"phone": 1}, {})
        self.assertEqual([r["kind"] for r in res], ["invalid", "new", "duplicate_file"])

    def test_mapping_guess_and_dates(self):
        m = importer.guess_mapping(["Shop Name", "Mobile No.", "Contact Name", "Trial Expiry"])
        self.assertEqual((m["phone"], m["customer_name"], m["trial_end_date"]), (1, 2, 3))
        self.assertEqual(importer.parse_date("05/03/2026"), ("2026-03-05", True))
        self.assertEqual(importer.parse_date("2026-03-05T00:00:00"), ("2026-03-05", True))  # Excel date cells
        self.assertEqual(importer.parse_date(datetime(2026, 3, 5)), ("2026-03-05", True))
        self.assertEqual(importer.parse_date("garbage"), (None, False))

    def test_unparsed_values_are_kept_in_notes(self):
        res, _ = importer.classify([(2, ["9876543210", "someday", "Weird"])],
                                   {"phone": 0, "trial_end_date": 1, "status": 2}, {})
        self.assertIn("someday", res[0]["record"]["notes"])
        self.assertIn("Weird", res[0]["record"]["notes"])


    def test_contacted_and_feedback_mapping_and_parsing(self):
        m = importer.guess_mapping(["Customer Name", "Phone", "Customer Contacted", "Feedback"])
        self.assertEqual(m["customer_name"], 0)
        self.assertEqual(m["phone"], 1)
        self.assertEqual(m["last_contact_date"], 2)
        self.assertEqual(m["feedback"], 3)

        d, is_c, note = importer.parse_contacted("15/10/2026")
        self.assertEqual(d, "2026-10-15")
        self.assertTrue(is_c)
        self.assertIsNone(note)

        d, is_c, note = importer.parse_contacted("Yes")
        self.assertIsNone(d)
        self.assertTrue(is_c)

        d, is_c, note = importer.parse_contacted("No")
        self.assertIsNone(d)
        self.assertFalse(is_c)

        rows = [(2, ["9876543210", "15/10/2026", "Loves the app"])]
        res, _ = importer.classify(rows, {"phone": 0, "last_contact_date": 1, "feedback": 2}, {})
        rec = res[0]["record"]
        self.assertEqual(rec["last_contact_date"], "2026-10-15")
        self.assertEqual(rec["status"], "Contacted")
        self.assertEqual(rec["feedback"], "Loves the app")

    def test_feedback_import_mapping_and_classify(self):
        headers = ["Phone Number", "Customer Name", "Customer Feedback", "Issue Type", "Call Duration"]
        m = importer.guess_feedback_mapping(headers)
        self.assertEqual(m["phone"], 0)
        self.assertEqual(m["customer_name"], 1)
        self.assertEqual(m["feedback"], 2)
        self.assertEqual(m["issue_type"], 3)
        self.assertEqual(m["duration_seconds"], 4)

        self.assertEqual(importer.parse_duration("120"), 120)
        self.assertEqual(importer.parse_duration("02:30"), 150)
        self.assertEqual(importer.parse_issue_type("Bug in report"), "Problem")
        self.assertEqual(importer.parse_issue_type("Add dark mode please"), "Feature request")
        self.assertEqual(importer.parse_issue_type("Pricing is too expensive"), "Objection")
        self.assertEqual(importer.parse_method("WhatsApp"), "WhatsApp")

        rows = [
            (2, ["9876543210", "John", "App crashes on login", "Bug", "60"]),
            (3, ["9123456780", "Jane", "Needs bulk export", "Feature", "0"]),
            (4, ["invalid-phone", "Bob", "Feedback text", "Problem", "0"]),
            (5, ["9988776655", "Alice", "", "", "0"]),
        ]
        res, blank = importer.classify_feedback(rows, m, {"+919876543210": "Acme Corp"})
        self.assertEqual(len(res), 4)
        self.assertEqual(res[0]["kind"], "existing_customer")
        self.assertEqual(res[0]["record"]["issue_type"], "Problem")
        self.assertEqual(res[1]["kind"], "new_customer")
        self.assertEqual(res[1]["record"]["issue_type"], "Feature request")
        self.assertEqual(res[2]["kind"], "invalid")
        self.assertEqual(res[3]["kind"], "invalid")  # empty feedback and issue

    def test_same_phone_multiple_feedbacks_in_file(self):
        headers = ["Phone", "Feedback", "Issue Category"]
        m = importer.guess_feedback_mapping(headers)
        rows = [
            (2, ["9876543210", "First call: Customer busy, asked to call later", "Problem"]),
            (3, ["9876543210", "Second call: Customer answered, discussed pricing", "Objection"]),
            (4, ["9876543210", "Third call: Follow-up done, interested in plan", ""]),
        ]
        res, blank = importer.classify_feedback(rows, m, {})
        self.assertEqual(len(res), 3)
        # All three rows must be valid and none skipped!
        self.assertEqual(res[0]["kind"], "new_customer")
        self.assertEqual(res[1]["kind"], "existing_customer")
        self.assertEqual(res[2]["kind"], "existing_customer")
        self.assertIn("Same number as row 2", res[1]["reason"])
        self.assertIn("Same number as row 2", res[2]["reason"])


if __name__ == "__main__":
    unittest.main()
