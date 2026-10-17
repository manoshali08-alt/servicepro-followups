import unittest
from app.core.phone import normalize_phone as n


class PhoneTests(unittest.TestCase):
    def ok(self, raw, want):
        self.assertEqual(n(raw), (want, None), raw)

    def bad(self, raw):
        p, e = n(raw)
        self.assertIsNone(p, raw)
        self.assertTrue(e)

    def test_formats_collapse_to_one_value(self):
        for raw in ["9876543210", "98765 43210", "98765-43210", "+91 98765 43210", "+91-9876543210", "91 9876543210",
                    "919876543210", "09876543210", "0091 9876543210", "(+91) 98765-43210", " 9876543210 ",
                    9876543210, 9876543210.0, "9876543210.0", "9.87654321E9", 919876543210, "+91 09876543210"]:
            self.ok(raw, "+919876543210")

    def test_other_countries_kept(self):
        self.ok("+1 (415) 555-0132", "+14155550132")
        self.ok("0044 20 7946 0958", "+442079460958")

    def test_invalid(self):
        for raw in [None, "", "   ", "12345", "5876543210", "98765432", "98765432101", "abc", "98765 4321x", "+91 12345 67890",
                    "9876543210 / 9123456789", "+0123456789"]:
            self.bad(raw)

    def test_does_not_treat_91_prefix_of_ten_digits_as_country_code(self):
        self.ok("9123456789", "+919123456789")  # a real mobile that merely starts with 91


if __name__ == "__main__":
    unittest.main()
