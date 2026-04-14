import cgi
import hashlib
import json
import secrets
import shutil
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_DIR = STORAGE_DIR / "uploads"
DB_PATH = STORAGE_DIR / "campus_companion.db"
HOST = "0.0.0.0"
PORT = 8000


def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def ensure_storage():
    STORAGE_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    ensure_storage()
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY,
                student_name TEXT DEFAULT '',
                college_name TEXT DEFAULT '',
                branch_name TEXT DEFAULT '',
                semester_name TEXT DEFAULT '2nd Semester',
                section_name TEXT DEFAULT '',
                goal_name TEXT DEFAULT '',
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS timetable_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                day TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                subject TEXT NOT NULL,
                room TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS class_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                subject TEXT NOT NULL,
                note_date TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tech_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                tag TEXT DEFAULT '',
                note_date TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS daily_work (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                work_date TEXT NOT NULL,
                title TEXT NOT NULL,
                focus TEXT DEFAULT '',
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS daily_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                daily_work_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                content_type TEXT DEFAULT 'application/octet-stream',
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (daily_work_id) REFERENCES daily_work(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )


def hash_password(password, salt_hex=None):
    salt_hex = salt_hex or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        200_000,
    )
    return derived.hex(), salt_hex


def row_to_profile(row):
    if not row:
        return {
            "studentName": "",
            "collegeName": "",
            "branchName": "",
            "semesterName": "2nd Semester",
            "sectionName": "",
            "goalName": "",
        }

    return {
        "studentName": row["student_name"],
        "collegeName": row["college_name"],
        "branchName": row["branch_name"],
        "semesterName": row["semester_name"],
        "sectionName": row["section_name"],
        "goalName": row["goal_name"],
    }


class CampusHandler(BaseHTTPRequestHandler):
    server_version = "CampusCompanion/1.0"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/bootstrap":
            self.handle_bootstrap()
            return
        if path.startswith("/api/files/") and path.endswith("/download"):
            self.handle_file_download(path)
            return
        if path == "/" or path in {"/index.html", "/styles.css", "/app.js"}:
            self.serve_static(path)
            return

        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/register":
            self.handle_register()
            return
        if path == "/api/login":
            self.handle_login()
            return
        if path == "/api/logout":
            self.handle_logout()
            return
        if path == "/api/timetable":
            self.handle_create_timetable()
            return
        if path == "/api/class-notes":
            self.handle_create_class_note()
            return
        if path == "/api/tech-notes":
            self.handle_create_tech_note()
            return
        if path == "/api/daily-work":
            self.handle_create_daily_work()
            return

        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/profile":
            self.handle_update_profile()
            return

        self.send_json({"error": "Not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        for prefix, table_name in [
            ("/api/timetable/", "timetable_entries"),
            ("/api/class-notes/", "class_notes"),
            ("/api/tech-notes/", "tech_notes"),
            ("/api/daily-work/", "daily_work"),
        ]:
            if path.startswith(prefix):
                self.handle_delete(path, prefix, table_name)
                return

        self.send_json({"error": "Not found"}, 404)

    def serve_static(self, path):
        file_map = {
            "/": BASE_DIR / "index.html",
            "/index.html": BASE_DIR / "index.html",
            "/styles.css": BASE_DIR / "styles.css",
            "/app.js": BASE_DIR / "app.js",
        }
        target = file_map.get(path)
        if not target or not target.exists():
            self.send_json({"error": "Not found"}, 404)
            return

        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
        }.get(target.suffix, "application/octet-stream")

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(target.read_bytes())

    def parse_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body.decode("utf-8"))

    def parse_multipart_body(self):
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )
        return form

    def send_json(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def get_current_user(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None

        token = header.split(" ", 1)[1].strip()
        if not token:
            return None

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT users.id, users.name, users.email, sessions.token
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
            return dict(row) if row else None

    def require_user(self):
        user = self.get_current_user()
        if not user:
            self.send_json({"error": "Please login first."}, 401)
            return None
        return user

    def handle_register(self):
        data = self.parse_json_body()
        name = data.get("name", "").strip()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not name or not email or len(password) < 6:
            self.send_json({"error": "Name, email, and a password of at least 6 characters are required."}, 400)
            return

        password_hash, salt = hash_password(password)
        created_at = now_iso()
        token = secrets.token_urlsafe(32)

        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO users (name, email, password_hash, password_salt, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (name, email, password_hash, salt, created_at),
                )
                user_id = cursor.lastrowid
                connection.execute(
                    """
                    INSERT INTO profiles (user_id, updated_at)
                    VALUES (?, ?)
                    """,
                    (user_id, created_at),
                )
                connection.execute(
                    """
                    INSERT INTO sessions (token, user_id, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (token, user_id, created_at),
                )
        except sqlite3.IntegrityError:
            self.send_json({"error": "This email is already registered."}, 409)
            return

        self.send_json(
            {
                "token": token,
                "user": {"id": user_id, "name": name, "email": email},
            },
            201,
        )

    def handle_login(self):
        data = self.parse_json_body()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT id, name, email, password_hash, password_salt
                FROM users
                WHERE email = ?
                """,
                (email,),
            ).fetchone()

            if not row:
                self.send_json({"error": "Invalid email or password."}, 401)
                return

            derived_hash, _ = hash_password(password, row["password_salt"])
            if derived_hash != row["password_hash"]:
                self.send_json({"error": "Invalid email or password."}, 401)
                return

            token = secrets.token_urlsafe(32)
            connection.execute(
                """
                INSERT INTO sessions (token, user_id, created_at)
                VALUES (?, ?, ?)
                """,
                (token, row["id"], now_iso()),
            )

        self.send_json(
            {
                "token": token,
                "user": {"id": row["id"], "name": row["name"], "email": row["email"]},
            }
        )

    def handle_logout(self):
        user = self.require_user()
        if not user:
            return

        token = self.headers.get("Authorization", "").split(" ", 1)[1].strip()
        with get_connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

        self.send_json({"success": True})

    def handle_bootstrap(self):
        user = self.require_user()
        if not user:
            return

        with get_connection() as connection:
            profile_row = connection.execute(
                "SELECT * FROM profiles WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
            timetable_rows = connection.execute(
                """
                SELECT id, day, start_time, end_time, subject, room
                FROM timetable_entries
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()
            class_note_rows = connection.execute(
                """
                SELECT id, title, subject, note_date, content
                FROM class_notes
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()
            tech_note_rows = connection.execute(
                """
                SELECT id, title, tag, note_date, content
                FROM tech_notes
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()
            daily_rows = connection.execute(
                """
                SELECT id, work_date, title, focus, summary
                FROM daily_work
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()
            file_rows = connection.execute(
                """
                SELECT id, daily_work_id, original_name, content_type, size
                FROM daily_files
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user["id"],),
            ).fetchall()

        files_by_work = {}
        for row in file_rows:
            files_by_work.setdefault(row["daily_work_id"], []).append(
                {
                    "id": row["id"],
                    "originalName": row["original_name"],
                    "contentType": row["content_type"],
                    "size": row["size"],
                }
            )

        self.send_json(
            {
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                },
                "profile": row_to_profile(profile_row),
                "timetable": [
                    {
                        "id": row["id"],
                        "day": row["day"],
                        "startTime": row["start_time"],
                        "endTime": row["end_time"],
                        "subject": row["subject"],
                        "room": row["room"],
                    }
                    for row in timetable_rows
                ],
                "classNotes": [
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "subject": row["subject"],
                        "date": row["note_date"],
                        "content": row["content"],
                    }
                    for row in class_note_rows
                ],
                "techNotes": [
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "tag": row["tag"],
                        "date": row["note_date"],
                        "content": row["content"],
                    }
                    for row in tech_note_rows
                ],
                "dailyWork": [
                    {
                        "id": row["id"],
                        "date": row["work_date"],
                        "title": row["title"],
                        "focus": row["focus"],
                        "summary": row["summary"],
                        "files": files_by_work.get(row["id"], []),
                    }
                    for row in daily_rows
                ],
            }
        )

    def handle_update_profile(self):
        user = self.require_user()
        if not user:
            return

        data = self.parse_json_body()
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE profiles
                SET student_name = ?, college_name = ?, branch_name = ?, semester_name = ?,
                    section_name = ?, goal_name = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (
                    data.get("studentName", "").strip(),
                    data.get("collegeName", "").strip(),
                    data.get("branchName", "").strip(),
                    data.get("semesterName", "2nd Semester").strip() or "2nd Semester",
                    data.get("sectionName", "").strip(),
                    data.get("goalName", "").strip(),
                    now_iso(),
                    user["id"],
                ),
            )

        self.send_json({"success": True})

    def handle_create_timetable(self):
        user = self.require_user()
        if not user:
            return

        data = self.parse_json_body()
        required = [data.get("day"), data.get("startTime"), data.get("endTime"), data.get("subject")]
        if not all(required):
            self.send_json({"error": "Day, start time, end time, and subject are required."}, 400)
            return

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO timetable_entries (user_id, day, start_time, end_time, subject, room, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    data["day"],
                    data["startTime"],
                    data["endTime"],
                    data["subject"].strip(),
                    data.get("room", "").strip(),
                    now_iso(),
                ),
            )
            entry_id = cursor.lastrowid

        self.send_json(
            {
                "entry": {
                    "id": entry_id,
                    "day": data["day"],
                    "startTime": data["startTime"],
                    "endTime": data["endTime"],
                    "subject": data["subject"].strip(),
                    "room": data.get("room", "").strip(),
                }
            },
            201,
        )

    def handle_create_class_note(self):
        user = self.require_user()
        if not user:
            return

        data = self.parse_json_body()
        required = [data.get("title"), data.get("subject"), data.get("date"), data.get("content")]
        if not all(required):
            self.send_json({"error": "All class note fields are required."}, 400)
            return

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO class_notes (user_id, title, subject, note_date, content, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    data["title"].strip(),
                    data["subject"].strip(),
                    data["date"],
                    data["content"].strip(),
                    now_iso(),
                ),
            )
            entry_id = cursor.lastrowid

        self.send_json(
            {
                "entry": {
                    "id": entry_id,
                    "title": data["title"].strip(),
                    "subject": data["subject"].strip(),
                    "date": data["date"],
                    "content": data["content"].strip(),
                }
            },
            201,
        )

    def handle_create_tech_note(self):
        user = self.require_user()
        if not user:
            return

        data = self.parse_json_body()
        required = [data.get("title"), data.get("date"), data.get("content")]
        if not all(required):
            self.send_json({"error": "Title, date, and content are required."}, 400)
            return

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO tech_notes (user_id, title, tag, note_date, content, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    data["title"].strip(),
                    data.get("tag", "").strip(),
                    data["date"],
                    data["content"].strip(),
                    now_iso(),
                ),
            )
            entry_id = cursor.lastrowid

        self.send_json(
            {
                "entry": {
                    "id": entry_id,
                    "title": data["title"].strip(),
                    "tag": data.get("tag", "").strip(),
                    "date": data["date"],
                    "content": data["content"].strip(),
                }
            },
            201,
        )

    def handle_create_daily_work(self):
        user = self.require_user()
        if not user:
            return

        form = self.parse_multipart_body()
        date = form.getfirst("date", "").strip()
        title = form.getfirst("title", "").strip()
        focus = form.getfirst("focus", "").strip()
        summary = form.getfirst("summary", "").strip()

        if not date or not title or not summary:
            self.send_json({"error": "Date, title, and summary are required."}, 400)
            return

        created_at = now_iso()
        user_upload_dir = UPLOAD_DIR / str(user["id"])
        user_upload_dir.mkdir(exist_ok=True)

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO daily_work (user_id, work_date, title, focus, summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user["id"], date, title, focus, summary, created_at),
            )
            work_id = cursor.lastrowid

            files = []
            field_items = form["workFiles"] if "workFiles" in form else []
            if not isinstance(field_items, list):
                field_items = [field_items]

            for item in field_items:
                if not getattr(item, "filename", None):
                    continue

                stored_name = f"{secrets.token_hex(16)}_{Path(item.filename).name}"
                target_path = user_upload_dir / stored_name
                with open(target_path, "wb") as output:
                    shutil.copyfileobj(item.file, output)

                size = target_path.stat().st_size
                file_cursor = connection.execute(
                    """
                    INSERT INTO daily_files (
                        daily_work_id, user_id, original_name, stored_name, content_type, size, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        work_id,
                        user["id"],
                        Path(item.filename).name,
                        stored_name,
                        item.type or "application/octet-stream",
                        size,
                        created_at,
                    ),
                )
                files.append(
                    {
                        "id": file_cursor.lastrowid,
                        "originalName": Path(item.filename).name,
                        "contentType": item.type or "application/octet-stream",
                        "size": size,
                    }
                )

        self.send_json(
            {
                "entry": {
                    "id": work_id,
                    "date": date,
                    "title": title,
                    "focus": focus,
                    "summary": summary,
                    "files": files,
                }
            },
            201,
        )

    def handle_delete(self, path, prefix, table_name):
        user = self.require_user()
        if not user:
            return

        item_id = path.replace(prefix, "", 1).strip()
        if not item_id.isdigit():
            self.send_json({"error": "Invalid item id."}, 400)
            return

        with get_connection() as connection:
            if table_name == "daily_work":
                file_rows = connection.execute(
                    "SELECT stored_name FROM daily_files WHERE daily_work_id = ? AND user_id = ?",
                    (int(item_id), user["id"]),
                ).fetchall()
                user_upload_dir = UPLOAD_DIR / str(user["id"])
                for row in file_rows:
                    file_path = user_upload_dir / row["stored_name"]
                    if file_path.exists():
                        file_path.unlink()

            cursor = connection.execute(
                f"DELETE FROM {table_name} WHERE id = ? AND user_id = ?",
                (int(item_id), user["id"]),
            )

        if cursor.rowcount == 0:
            self.send_json({"error": "Record not found."}, 404)
            return

        self.send_json({"success": True})

    def handle_file_download(self, path):
        user = self.require_user()
        if not user:
            return

        file_id = path.replace("/api/files/", "", 1).replace("/download", "", 1).strip("/")
        if not file_id.isdigit():
            self.send_json({"error": "Invalid file id."}, 400)
            return

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT original_name, stored_name, content_type
                FROM daily_files
                WHERE id = ? AND user_id = ?
                """,
                (int(file_id), user["id"]),
            ).fetchone()

        if not row:
            self.send_json({"error": "File not found."}, 404)
            return

        file_path = UPLOAD_DIR / str(user["id"]) / row["stored_name"]
        if not file_path.exists():
            self.send_json({"error": "File missing on server."}, 404)
            return

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", row["content_type"] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f'attachment; filename="{row["original_name"]}"')
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), CampusHandler)
    print(f"Campus Companion running on http://{HOST}:{PORT}")
    server.serve_forever()
