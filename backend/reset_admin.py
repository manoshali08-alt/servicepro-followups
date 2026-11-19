"""Script to update/reset the admin password in ServicePro Follow-ups SQLite database."""
import hashlib
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent


def find_database() -> Path:
    candidates = []

    # 1. Environment variable
    env_db = os.environ.get("DATABASE_PATH")
    if env_db:
        candidates.append(Path(env_db))

    # 2. Check .env file in project root or backend
    for env_file in [PROJECT_ROOT / ".env", ROOT / ".env"]:
        if env_file.exists():
            try:
                for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    if line.startswith("DATABASE_PATH=") and not line.startswith("#"):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        candidates.append(Path(val))
                        # Also relative to project root
                        if not Path(val).is_absolute():
                            candidates.append(PROJECT_ROOT / val)
                            candidates.append(ROOT / val)
                        # If unix-style /data/servicepro.db on Windows
                        if val.startswith("/") or val.startswith("\\"):
                            candidates.append(Path(val[1:]))
                            candidates.append(PROJECT_ROOT / val[1:])
            except Exception:
                pass

    # 3. Standard fallback locations
    candidates.extend([
        PROJECT_ROOT / "data" / "servicepro.db",
        ROOT / "data" / "servicepro.db",
        PROJECT_ROOT / "backend" / "data" / "servicepro.db",
        Path("D:/data/servicepro.db"),
        Path("C:/data/servicepro.db"),
    ])

    # 4. Search recursively for any servicepro.db in the repo
    for p in candidates:
        if p.exists() and p.is_file():
            return p

    for found in PROJECT_ROOT.glob("**/servicepro.db"):
        if found.is_file():
            return found

    for found in PROJECT_ROOT.glob("**/*.db"):
        if found.is_file() and not found.name.endswith("-wal") and not found.name.endswith("-shm"):
            return found

    return candidates[0] if candidates else ROOT / "data" / "servicepro.db"


def hash_pw(p: str) -> str:
    salt = os.urandom(16)
    return f"scrypt${salt.hex()}${hashlib.scrypt(p.encode(), salt=salt, n=2**14, r=8, p=1).hex()}"


def reset_admin(new_password: str, email: str = ""):
    db_path = find_database()
    print(f"🔍 Located database: {db_path}")

    if not db_path.exists():
        print(f"❌ Database not found at: {db_path}")
        print("💡 Hint: If the database is not created yet, start the backend once or check DATABASE_PATH in .env")
        return False

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "users" not in tables:
            print(f"❌ The database at {db_path} does not have a 'users' table yet.")
            conn.close()
            return False

        if email.strip():
            user = cur.execute(
                "SELECT * FROM users WHERE email=? COLLATE NOCASE",
                (email.strip().lower(),),
            ).fetchone()
        else:
            user = cur.execute("SELECT * FROM users WHERE role='admin' LIMIT 1").fetchone()
            if not user:
                user = cur.execute("SELECT * FROM users LIMIT 1").fetchone()

        new_hash = hash_pw(new_password)

        if not user:
            print("⚠️ No user existed. Creating new Admin user...")
            target_email = email.strip().lower() if email.strip() else "admin@servicepro.com"
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role, active) VALUES ('Admin', ?, ?, 'admin', 1)",
                (target_email, new_hash)
            )
            conn.commit()
            print(f"✅ Success! Created new Admin user '{target_email}' with the password.")
        else:
            cur.execute("UPDATE users SET password_hash=?, active=1 WHERE id=?", (new_hash, user["id"]))
            cur.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            conn.commit()
            print(f"✅ Success! Password for '{user['email']}' (Role: {user['role']}) has been updated.")

    except Exception as e:
        print(f"❌ Error updating database: {e}")
        return False
    finally:
        conn.close()

    return True


if __name__ == "__main__":
    pwd = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    em = sys.argv[2].strip() if len(sys.argv) > 2 else ""

    if not pwd:
        pwd = input("Enter new password: ").strip()

    if not pwd:
        print("❌ Password cannot be empty.")
        sys.exit(1)

    reset_admin(pwd, em)
