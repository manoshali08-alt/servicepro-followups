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


if __name__ == "__main__":
    unittest.main()
