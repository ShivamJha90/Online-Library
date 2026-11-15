#!/usr/bin/env python3
"""
ScholarScroll local backend
===========================

A zero-dependency HTTP API for ScholarScroll, built with Python's standard
library and SQLite. It provides:

* server-side accounts with PBKDF2 password hashing and bearer sessions
* the two-device limit, enforced on the server (the oldest device is evicted)
* paid premium plans, orders and entitlements
* single-use, email-bound certificate discount vouchers
* a cached Hindi catalogue/text proxy for public-domain Archive.org scans
* static hosting for the ScholarScroll front end

Run it with:

    python server/app.py

Then open http://127.0.0.1:8000/

The front end also works from the old static server. In that case it probes
this API and falls back to local demo behaviour when the API is unavailable.

Environment variables
---------------------
SCHOLARSCROLL_HOST              bind host (default 127.0.0.1, or 0.0.0.0 when PORT is set)
SCHOLARSCROLL_PORT              bind port (default 8000, or the PORT env var)
SCHOLARSCROLL_DATA_DIR          data directory (default server/data)
SCHOLARSCROLL_DB                SQLite file path (default <data>/scholarscroll.sqlite3)
SCHOLARSCROLL_HINDI_FIXTURES    optional folder of "<key>.txt" fixtures used
                                instead of downloading Hindi texts (tests/offline)
SCHOLARSCROLL_HINDI_CACHE_DAYS  cache lifetime for downloaded texts (default 30)
"""

from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_NAME = "ScholarScroll"
API_VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("SCHOLARSCROLL_DATA_DIR") or (ROOT / "server" / "data"))
DB_PATH = Path(os.environ.get("SCHOLARSCROLL_DB") or (DATA_DIR / "scholarscroll.sqlite3"))
HINDI_FIXTURES = Path(os.environ["SCHOLARSCROLL_HINDI_FIXTURES"]) if os.environ.get("SCHOLARSCROLL_HINDI_FIXTURES") else None
HINDI_CACHE_DAYS = int(os.environ.get("SCHOLARSCROLL_HINDI_CACHE_DAYS", "30"))
HOST = os.environ.get("SCHOLARSCROLL_HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
PORT = int(os.environ.get("SCHOLARSCROLL_PORT") or os.environ.get("PORT") or "8000")

MAX_DEVICES = 2
VOUCHER_PERCENTS = [10, 20, 30, 40, 50]
VOUCHER_VALID_DAYS = 7
SESSION_VALID_DAYS = 30
MAX_JSON_BODY = 1024 * 1024
MAX_HINDI_BYTES = 8 * 1024 * 1024
HINDI_USER_AGENT = "ScholarScroll/1.0 (local library demo; +https://github.com/ShivamJha90/Online-Library)"

PLANS = {
    "monthly": {
        "id": "monthly",
        "name": "Monthly access",
        "price": 50,
        "scope": "all",
        "durationDays": 30,
    },
    "single": {
        "id": "single",
        "name": "Lifetime single book",
        "price": 150,
        "scope": "book",
        "durationDays": None,
    },
    "lifetime": {
        "id": "lifetime",
        "name": "Lifetime all-access",
        "price": 1000,
        "scope": "all",
        "durationDays": None,
    },
}

HINDI_BOOKS = [
    {
        "key": "hindi-bhagavad-gita",
        "title": "श्रीमद्भगवद्गीता",
        "author": "वेद व्यास · गीताप्रेस संस्करण",
        "category": "भगवद्गीता",
        "summary": "कर्म, ज्ञान और भक्ति का अमर संवाद — श्रीकृष्ण और अर्जुन के बीच जीवन के अर्थ पर सरल हिंदी टीका सहित।",
        "archiveId": "geeta_202007",
        "archiveFile": "श्रीमद भगवत गीता Geeta_djvu.txt",
    },
    {
        "key": "hindi-valmiki-ramayan",
        "title": "वाल्मीकि रामायण · अयोध्याकांड",
        "author": "महर्षि वाल्मीकि",
        "category": "रामायण",
        "summary": "राम के वनवास, भरत के त्याग और अयोध्या की भावनाओं का मार्मिक कांड — संस्कृत श्लोक और हिंदी अनुवाद सहित।",
        "archiveId": "ramayan_202005",
        "archiveFile": "बालमीकि रामायण अयोध्याकांड_djvu.txt",
    },
    {
        "key": "hindi-ramcharitmanas",
        "title": "रामचरितमानस",
        "author": "गोस्वामी तुलसीदास",
        "category": "रामायण",
        "summary": "अवधी की सबसे प्रिय रामकथा — बालकांड से उत्तरकांड तक, दोहा-चौपाई की लय में जीवन की मर्यादा और भक्ति।",
        "archiveId": "in.ernet.dli.2015.342236",
        "archiveFile": "2015.342236.99999990231847_djvu.txt",
    },
    {
        "key": "hindi-mahabharat-ashramvasik",
        "title": "महाभारत · आश्रमवासिक पर्व",
        "author": "वेद व्यास",
        "category": "महाभारत",
        "summary": "युद्ध के बाद हस्तिनापुर के राजा और वनगमन — वृद्धावस्था, राजधर्म और वनप्रस्थ की शिक्षा देने वाला पर्व।",
        "archiveId": "15ashramvasikparva",
        "archiveFile": "15ashramvasikparva_djvu.txt",
    },
    {
        "key": "hindi-mahabharat-shalya",
        "title": "महाभारत · शल्य पर्व",
        "author": "वेद व्यास",
        "category": "महाभारत",
        "summary": "कुरुक्षेत्र का निर्णायक संग्राम, शल्य की सेनापतित्व और कर्ण-अर्जुन संघर्ष की गाथा।",
        "archiveId": "09shalyaparva",
        "archiveFile": "09shalyaparva_djvu.txt",
    },
    {
        "key": "hindi-chanakya-niti",
        "title": "सम्पूर्ण चाणक्य नीति",
        "author": "आचार्य चाणक्य",
        "category": "नीति और जीवन",
        "summary": "राजनीति, मित्रता, परिश्रम और चरित्र पर चाणक्य के कालजयी सूत्र — आज के जीवन में सीधे काम आने वाली नीति।",
        "archiveId": "hindi_202507",
        "archiveFile": "सम्पूर्ण चाणक्य नीति Hindi_djvu.txt",
    },
    {
        "key": "hindi-godaan",
        "title": "गोदान",
        "author": "प्रेमचंद",
        "category": "उपन्यास",
        "summary": "होरी और धनिया की कथा — किसानी, गरीबी, सपनों और सामाजिक बदलाव का हिंदी का सबसे बड़ा महाकाव्यात्मक उपन्यास।",
        "archiveId": "godaan-upanyas-premchand-parikalpana",
        "archiveFile": "Godaan upanyas -- Premchand --  Parikalpana_djvu.txt",
    },
    {
        "key": "hindi-premchand-stories",
        "title": "प्रेमचंद की कहानियाँ",
        "author": "प्रेमचंद",
        "category": "कहानी",
        "summary": "ईदगाह, कफन, पूस की रात जैसी कहानियों का संग्रह — आम आदमी की करुणा, हास्य और संघर्ष।",
        "archiveId": "StoriesByPremchand",
        "archiveFile": "Stories By Premchand_djvu.txt",
    },
    {
        "key": "hindi-bhagwat-puran",
        "title": "भागवत पुराण",
        "author": "वेद व्यास",
        "category": "पुराण",
        "summary": "श्रीकृष्ण की लीलाओं, भक्ति और दशावतार की कथाएँ — भारतीय भक्ति परंपरा का हृदय।",
        "archiveId": "puran_bhagwat",
        "archiveFile": "Bhagvat_djvu.txt",
    },
    {
        "key": "hindi-shiv-puran",
        "title": "शिव पुराण",
        "author": "वेद व्यास",
        "category": "पुराण",
        "summary": "शिव की महिमा, ज्योतिर्लिंग, सती-कथा और शैव दर्शन — भोले शंकर की कथा का विस्तृत हिंदी वर्णन।",
        "archiveId": "puran_shiv",
        "archiveFile": "Shiv_djvu.txt",
    },
    {
        "key": "hindi-vishnu-puran",
        "title": "विष्णु पुराण",
        "author": "वेद व्यास",
        "category": "पुराण",
        "summary": "सृष्टि, प्रलय, मन्वंतर और विष्णु के अवतारों की पुराणकथा — ब्रह्मांड के रहस्यों का हिंदी वर्णन।",
        "archiveId": "vishnu-puran_hindi",
        "archiveFile": "Vishnu Purana_djvu.txt",
    },
    {
        "key": "hindi-kabir-bijak",
        "title": "कबीर बीजक",
        "author": "संत कबीर",
        "category": "कविता और दर्शन",
        "summary": "कबीर के साखी, सबद और रमैनी — सांप्रदायिकता और आडंबर पर तीखा प्रहार, भीतर की खोज का संदेश।",
        "archiveId": "bijak",
        "archiveFile": "कबीर साहेब का बीजक_djvu.txt",
    },
    {
        "key": "hindi-hitopadesh",
        "title": "हितोपदेश",
        "author": "नारायण पंडित",
        "category": "नीति और जीवन",
        "summary": "मित्रता, विवेक और व्यवहार कौशल सिखाने वाली पशु-कथाएँ — पंचतंत्र परंपरा की सरल हिंदी प्रस्तुति।",
        "archiveId": "hindi_202408",
        "archiveFile": "हितोपदेश _ hindi_djvu.txt",
    },
    {
        "key": "hindi-panchatantra",
        "title": "पंचतंत्र की कहानियाँ",
        "author": "विष्णु शर्मा",
        "category": "नीति और जीवन",
        "summary": "चालाक लोमड़ी, कौवे और शेर की कहानियों से जीवन की व्यावहारिक बुद्धि — हर उम्र के पाठकों के लिए।",
        "archiveId": "panchan-part2",
        "archiveFile": "panchan-part2_djvu.txt",
    },
    {
        "key": "hindi-panchatantra-vistar",
        "title": "पंचतंत्र · विस्तृत संस्करण",
        "author": "विष्णु शर्मा",
        "category": "नीति और जीवन",
        "summary": "पंचतंत्र की अधिक कहानियाँ और विस्तृत टीका — राजनीति, मित्रता और व्यवहारिक ज्ञान का भंडार।",
        "archiveId": "panchatantra0000vidy",
        "archiveFile": "panchatantra0000vidy_djvu.txt",
    },
    {
        "key": "hindi-yoga-vasistha",
        "title": "योग वासिष्ठ",
        "author": "महर्षि वाल्मीकि",
        "category": "दर्शन",
        "summary": "राम और वसिष्ठ का संवाद — मन, माया, वैराग्य और मुक्ति पर भारतीय दर्शन का सबसे गहरा ग्रंथ।",
        "archiveId": "ag-1_20210526_202105",
        "archiveFile": "AG-1_new_djvu.txt",
    },
    {
        "key": "hindi-surdas",
        "title": "सूरदास पदावली",
        "author": "सूरदास",
        "category": "कविता और दर्शन",
        "summary": "कृष्ण-भक्ति की सर्वोत्तम पदावली — वात्सल्य, मिलन और विरह के भावों में डूबी ब्रजभाषा की कविता।",
        "archiveId": "dli.language.1229",
        "archiveFile": "dli.language.1229_djvu.txt",
    },
    {
        "key": "hindi-meera-padawali",
        "title": "मीराबाई पदावली",
        "author": "मीराबाई",
        "category": "कविता और दर्शन",
        "summary": "गिरधर के प्रति मीरा की निर्मल भक्ति — राजमहल से वन तक, प्रेम और समर्पण के अमर पद।",
        "externalUrl": "https://hi.wikisource.org/wiki/%E0%A4%AE%E0%A5%80%E0%A4%B0%E0%A4%BE%E0%A4%AC%E0%A4%BE%E0%A4%88",
    },
    {
        "key": "hindi-kautilya-arthashastra",
        "title": "कौटिल्य अर्थशास्त्र",
        "author": "आचार्य कौटिल्य",
        "category": "नीति और जीवन",
        "summary": "राज्य, अर्थ, न्याय और कूटनीति का प्राचीन भारतीय शास्त्र — चाणक्य की राजनीतिक बुद्धि का मूल ग्रंथ।",
        "externalUrl": "https://archive.org/search?query=%E0%A4%85%E0%A4%B0%E0%A5%8D%E0%A4%A5%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0",
    },
    {
        "key": "hindi-garud-puran",
        "title": "गरुड़ पुराण",
        "author": "वेद व्यास",
        "category": "पुराण",
        "summary": "जीवन, मृत्यु और परलोक की अवधारणा — गरुड़ और विष्णु के संवाद में नैतिकता और कर्म का वर्णन।",
        "externalUrl": "https://archive.org/details/full-garuda-puran-in-hindi-mannmandir-garudpuran",
    },
]

for _book in HINDI_BOOKS:
    if _book.get("archiveId"):
        _book["sourceUrl"] = f"https://archive.org/details/{_book['archiveId']}"
        _book["coverUrl"] = f"https://archive.org/services/img/{_book['archiveId']}"
    else:
        _book["sourceUrl"] = _book.get("externalUrl", "")
        _book["coverUrl"] = ""


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    value = value or utc_now()
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    iterations = 200_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), b64decode(salt), int(iterations))
        return secrets.compare_digest(computed, b64decode(digest))
    except (ValueError, TypeError):
        return False


def voucher_percent(certificate_id: str) -> int:
    digest = hashlib.sha256(f"scholarscroll-voucher:{certificate_id}".encode("utf-8")).hexdigest()
    return VOUCHER_PERCENTS[int(digest[:8], 16) % len(VOUCHER_PERCENTS)]


def voucher_code(certificate_id: str) -> str:
    digest = hashlib.sha256(f"scholarscroll-code:{certificate_id}".encode("utf-8")).hexdigest()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(alphabet[byte % len(alphabet)] for byte in bytes.fromhex(digest)[:6])
    return f"SCHOLAR-{suffix}"


def initials_for(name: str) -> str:
    parts = [part for part in re.split(r"\s+", str(name).strip()) if part]
    return "".join(part[0].upper() for part in parts[:2]) or "SS"


def clean_text(value: object, limit: int = 200) -> str:
    return str(value or "").strip()[:limit]


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'student',
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen  TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id    TEXT NOT NULL,
    label        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_seen    TEXT NOT NULL,
    UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS entitlements (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    monthly_until TEXT,
    lifetime_all  INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_entitlements (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_key     TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    price_paid   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, book_key)
);

CREATE TABLE IF NOT EXISTS orders (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id          TEXT NOT NULL,
    book_key         TEXT,
    list_price       INTEGER NOT NULL,
    discount_percent INTEGER NOT NULL DEFAULT 0,
    amount           INTEGER NOT NULL,
    voucher_code     TEXT,
    status           TEXT NOT NULL,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
    code             TEXT PRIMARY KEY,
    certificate_id   TEXT NOT NULL UNIQUE,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email            TEXT NOT NULL,
    discount_percent INTEGER NOT NULL,
    issued_at        TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    redeemed_at      TEXT,
    order_id         TEXT,
    plan_id          TEXT,
    book_key         TEXT
);

CREATE TABLE IF NOT EXISTS hindi_texts (
    book_key   TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_user ON vouchers(user_id);
"""

SEED_USERS = [
    {
        "id": "student-maya",
        "name": "Maya Chen",
        "email": "maya@scholarscroll.local",
        "password": "reader2026",
        "role": "student",
    },
    {
        "id": "admin-elena",
        "name": "Elena Brooks",
        "email": "elena@scholarscroll.local",
        "password": "admin2026",
        "role": "admin",
    },
]


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        now = iso()
        for seed in SEED_USERS:
            row = conn.execute("SELECT id FROM users WHERE email = ?", (seed["email"],)).fetchone()
            if row:
                continue
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (seed["id"], seed["name"], seed["email"], hash_password(seed["password"]), seed["role"], now),
            )
            conn.execute(
                "INSERT OR IGNORE INTO entitlements (user_id, monthly_until, lifetime_all, updated_at) VALUES (?, NULL, 0, ?)",
                (seed["id"], now),
            )
        conn.commit()
    finally:
        conn.close()


def user_public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "initials": initials_for(row["name"]),
    }


def entitlements_for(conn: sqlite3.Connection, user_id: str) -> dict:
    row = conn.execute("SELECT * FROM entitlements WHERE user_id = ?", (user_id,)).fetchone()
    books = {}
    for item in conn.execute("SELECT * FROM book_entitlements WHERE user_id = ? ORDER BY purchased_at", (user_id,)):
        books[item["book_key"]] = {
            "lifetime": True,
            "plan": "single",
            "purchasedAt": item["purchased_at"],
            "pricePaid": item["price_paid"],
        }
    return {
        "monthlyUntil": row["monthly_until"] if row else None,
        "lifetimeAll": bool(row["lifetime_all"]) if row else False,
        "books": books,
    }


def devices_for(conn: sqlite3.Connection, user_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC, created_at DESC",
        (user_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "deviceId": row["device_id"],
            "label": row["label"],
            "createdAt": row["created_at"],
            "lastSeenAt": row["last_seen"],
            "active": True,
            "revokedAt": None,
        }
        for row in rows
    ]


def vouchers_for(conn: sqlite3.Connection, user_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM vouchers WHERE user_id = ? ORDER BY issued_at DESC",
        (user_id,),
    ).fetchall()
    now = utc_now()
    result = []
    for row in rows:
        expires = parse_iso(row["expires_at"])
        result.append(
            {
                "code": row["code"],
                "certificateId": row["certificate_id"],
                "userId": row["user_id"],
                "email": row["email"],
                "discountPercent": row["discount_percent"],
                "issuedAt": row["issued_at"],
                "expiresAt": row["expires_at"],
                "redeemedAt": row["redeemed_at"],
                "orderId": row["order_id"],
                "planId": row["plan_id"],
                "bookKey": row["book_key"],
                "expired": bool(expires and expires < now),
            }
        )
    return result


def orders_for(conn: sqlite3.Connection, user_id: str, limit: int = 30) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "userId": row["user_id"],
            "planId": row["plan_id"],
            "bookKey": row["book_key"],
            "listPrice": row["list_price"],
            "discountPercent": row["discount_percent"],
            "amount": row["amount"],
            "voucherCode": row["voucher_code"],
            "status": row["status"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def register_device(conn: sqlite3.Connection, user_id: str, device_id: str, label: str) -> tuple[str, list[dict]]:
    """Create a session for this device and enforce the two-device limit.

    The oldest device (by last activity) is removed when a third device signs
    in. Its sessions are deleted, so the evicted browser cannot keep using an
    old token.
    """
    now = iso()
    row = conn.execute(
        "SELECT id FROM devices WHERE user_id = ? AND device_id = ?",
        (user_id, device_id),
    ).fetchone()
    if row:
        conn.execute("UPDATE devices SET label = ?, last_seen = ? WHERE id = ?", (label, now, row["id"]))
    else:
        conn.execute(
            "INSERT INTO devices (id, user_id, device_id, label, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
            (f"device-{secrets.token_hex(6)}", user_id, device_id, label, now, now),
        )

    active = conn.execute(
        "SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC, created_at DESC",
        (user_id,),
    ).fetchall()
    evicted = []
    # Evict the least-recently-seen device, never the one that just signed in.
    # Timestamps have second precision, so rowid breaks ties deterministically.
    while len(active) > MAX_DEVICES:
        oldest = conn.execute(
            "SELECT rowid AS row_id, * FROM devices WHERE user_id = ? AND device_id != ? "
            "ORDER BY last_seen ASC, created_at ASC, rowid ASC LIMIT 1",
            (user_id, device_id),
        ).fetchone()
        if not oldest:
            break
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND device_id = ?", (user_id, oldest["device_id"]))
        conn.execute("DELETE FROM devices WHERE id = ?", (oldest["id"],))
        evicted.append(
            {
                "id": oldest["id"],
                "deviceId": oldest["device_id"],
                "label": oldest["label"],
                "lastSeenAt": oldest["last_seen"],
                "active": False,
                "revokedAt": now,
            }
        )
        active = conn.execute(
            "SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC, created_at DESC",
            (user_id,),
        ).fetchall()

    conn.execute("DELETE FROM sessions WHERE user_id = ? AND device_id = ?", (user_id, device_id))
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token, user_id, device_id, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        (token, user_id, device_id, now, now, iso(utc_now() + timedelta(days=SESSION_VALID_DAYS))),
    )
    return token, evicted


def session_payload(conn: sqlite3.Connection, user_id: str, token: str | None = None, evicted: list[dict] | None = None) -> dict:
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise ApiError("Account not found.", 404, "user_not_found")
    payload = {
        "user": user_public(user),
        "entitlements": entitlements_for(conn, user_id),
        "devices": devices_for(conn, user_id),
        "vouchers": vouchers_for(conn, user_id),
        "orders": orders_for(conn, user_id),
        "evictedDevices": evicted or [],
        "serverTime": iso(),
    }
    if token:
        payload["token"] = token
    return payload


def require_auth(conn: sqlite3.Connection, handler: "ApiHandler") -> tuple[sqlite3.Row, sqlite3.Row]:
    header = handler.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        raise ApiError("Sign in to continue.", 401, "unauthorized")
    session = conn.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()
    if not session:
        raise ApiError("Your session has ended. Sign in again.", 401, "session_ended")
    if (parse_iso(session["expires_at"]) or utc_now()) < utc_now():
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        raise ApiError("Your session has expired. Sign in again.", 401, "session_expired")
    user = conn.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    if not user:
        raise ApiError("Account not found.", 401, "user_not_found")
    now = iso()
    conn.execute("UPDATE sessions SET last_seen = ? WHERE token = ?", (now, token))
    conn.execute(
        "UPDATE devices SET last_seen = ? WHERE user_id = ? AND device_id = ?",
        (now, session["user_id"], session["device_id"]),
    )
    conn.commit()
    return user, session


# ---------------------------------------------------------------------------
# Premium / voucher logic
# ---------------------------------------------------------------------------


def find_voucher(conn: sqlite3.Connection, code: str, user_id: str) -> sqlite3.Row:
    normalized = clean_text(code, 64).upper()
    if not normalized:
        raise ApiError("Enter a voucher code first.", 400, "voucher_missing")
    row = conn.execute("SELECT * FROM vouchers WHERE code = ?", (normalized,)).fetchone()
    if not row or row["user_id"] != user_id:
        raise ApiError("That voucher code is not registered to this account.", 400, "voucher_not_found")
    if row["redeemed_at"]:
        raise ApiError("This voucher has already been used.", 400, "voucher_used")
    expires = parse_iso(row["expires_at"])
    if expires and expires < utc_now():
        raise ApiError("This voucher has expired.", 400, "voucher_expired")
    return row


def quote_plan(
    conn: sqlite3.Connection,
    user_id: str,
    plan_id: str,
    book_key: str | None = None,
    voucher_code_value: str | None = None,
) -> dict:
    plan = PLANS.get(clean_text(plan_id, 32))
    if not plan:
        raise ApiError("Choose a valid premium plan.", 400, "plan_invalid")
    entitlements = entitlements_for(conn, user_id)
    book_key = clean_text(book_key, 160) or None
    if plan["scope"] == "book":
        if not book_key:
            raise ApiError("Choose a readable premium book first.", 400, "book_missing")
        if entitlements["lifetimeAll"] or book_key in entitlements["books"]:
            raise ApiError("You already have lifetime access to this book.", 409, "already_owned")
    elif entitlements["lifetimeAll"]:
        raise ApiError("You already have lifetime all-access.", 409, "already_owned")

    percent = 0
    voucher = None
    if voucher_code_value:
        row = find_voucher(conn, voucher_code_value, user_id)
        percent = int(row["discount_percent"])
        voucher = {
            "code": row["code"],
            "certificateId": row["certificate_id"],
            "discountPercent": percent,
            "expiresAt": row["expires_at"],
        }
    list_price = int(plan["price"])
    total = max(0, round(list_price * (100 - percent) / 100))
    return {
        "plan": plan,
        "bookKey": book_key,
        "listPrice": list_price,
        "percent": percent,
        "discount": list_price - total,
        "total": total,
        "voucher": voucher,
    }


def apply_purchase(conn: sqlite3.Connection, user_id: str, quote: dict) -> dict:
    now = iso()
    plan = quote["plan"]
    order_id = f"order-{secrets.token_hex(8)}"
    conn.execute("BEGIN IMMEDIATE")
    try:
        if plan["id"] == "monthly":
            row = conn.execute("SELECT monthly_until FROM entitlements WHERE user_id = ?", (user_id,)).fetchone()
            current = parse_iso(row["monthly_until"]) if row else None
            base = max(utc_now(), current) if current else utc_now()
            monthly_until = iso(base + timedelta(days=plan["durationDays"]))
            conn.execute(
                "UPDATE entitlements SET monthly_until = ?, updated_at = ? WHERE user_id = ?",
                (monthly_until, now, user_id),
            )
        elif plan["id"] == "lifetime":
            conn.execute(
                "UPDATE entitlements SET lifetime_all = 1, updated_at = ? WHERE user_id = ?",
                (now, user_id),
            )
        else:
            conn.execute(
                "INSERT OR REPLACE INTO book_entitlements (user_id, book_key, purchased_at, price_paid) VALUES (?, ?, ?, ?)",
                (user_id, quote["bookKey"], now, quote["total"]),
            )
        conn.execute(
            """INSERT INTO orders
               (id, user_id, plan_id, book_key, list_price, discount_percent, amount, voucher_code, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo-paid', ?)""",
            (
                order_id,
                user_id,
                plan["id"],
                quote["bookKey"],
                quote["listPrice"],
                quote["percent"],
                quote["total"],
                quote["voucher"]["code"] if quote["voucher"] else None,
                now,
            ),
        )
        if quote["voucher"]:
            updated = conn.execute(
                """UPDATE vouchers SET redeemed_at = ?, order_id = ?, plan_id = ?, book_key = ?
                   WHERE code = ? AND user_id = ? AND redeemed_at IS NULL""",
                (
                    now,
                    order_id,
                    plan["id"],
                    quote["bookKey"],
                    quote["voucher"]["code"],
                    user_id,
                ),
            )
            if updated.rowcount != 1:
                raise ApiError("This voucher was already used.", 409, "voucher_used")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {
        "id": order_id,
        "userId": user_id,
        "planId": plan["id"],
        "bookKey": quote["bookKey"],
        "listPrice": quote["listPrice"],
        "discountPercent": quote["percent"],
        "amount": quote["total"],
        "voucherCode": quote["voucher"]["code"] if quote["voucher"] else None,
        "status": "demo-paid",
        "createdAt": now,
    }


def issue_voucher(conn: sqlite3.Connection, user: sqlite3.Row, certificate_id: str) -> dict:
    certificate_id = clean_text(certificate_id, 160)
    if not certificate_id or not certificate_id.startswith("certificate-"):
        raise ApiError("A valid certificate ID is required.", 400, "certificate_invalid")
    existing = conn.execute("SELECT * FROM vouchers WHERE certificate_id = ?", (certificate_id,)).fetchone()
    if existing:
        if existing["user_id"] != user["id"]:
            raise ApiError("That certificate belongs to another account.", 409, "certificate_owned")
        return next(item for item in vouchers_for(conn, user["id"]) if item["code"] == existing["code"])

    now = utc_now()
    code = voucher_code(certificate_id)
    percent = voucher_percent(certificate_id)
    expires_at = iso(now + timedelta(days=VOUCHER_VALID_DAYS))
    conn.execute(
        """INSERT INTO vouchers
           (code, certificate_id, user_id, email, discount_percent, issued_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (code, certificate_id, user["id"], user["email"], percent, iso(now), expires_at),
    )
    conn.commit()
    return next(item for item in vouchers_for(conn, user["id"]) if item["code"] == code)


# ---------------------------------------------------------------------------
# Hindi text proxy
# ---------------------------------------------------------------------------


def hindi_book(key: str) -> dict | None:
    return next((book for book in HINDI_BOOKS if book["key"] == key), None)


def public_hindi_book(book: dict) -> dict:
    return {
        "key": book["key"],
        "title": book["title"],
        "author": book["author"],
        "category": book["category"],
        "summary": book["summary"],
        "sourceUrl": book.get("sourceUrl", ""),
        "coverUrl": book.get("coverUrl", ""),
        "archiveId": book.get("archiveId"),
        "available": bool(book.get("archiveId")),
        "textUrl": f"/api/hindi/text/{book['key']}" if book.get("archiveId") else None,
        "language": "hi",
    }


def load_hindi_text(conn: sqlite3.Connection, book: dict, refresh: bool = False) -> dict:
    key = book["key"]
    if not book.get("archiveId"):
        raise ApiError("This title is available through an external source.", 404, "hindi_external")

    fixture = HINDI_FIXTURES / f"{key}.txt" if HINDI_FIXTURES else None
    if fixture and fixture.is_file():
        content = fixture.read_text(encoding="utf-8", errors="replace")
        return {
            "key": key,
            "title": book["title"],
            "author": book["author"],
            "text": content,
            "source": "fixture",
            "sourceUrl": book.get("sourceUrl", ""),
            "cached": False,
            "fetchedAt": iso(),
        }

    cached = conn.execute("SELECT * FROM hindi_texts WHERE book_key = ?", (key,)).fetchone()
    if cached and not refresh:
        fetched = parse_iso(cached["fetched_at"])
        if fetched and fetched > utc_now() - timedelta(days=HINDI_CACHE_DAYS):
            return {
                "key": key,
                "title": book["title"],
                "author": book["author"],
                "text": cached["content"],
                "source": "cache",
                "sourceUrl": cached["source_url"],
                "cached": True,
                "fetchedAt": cached["fetched_at"],
            }

    source_url = (
        "https://archive.org/download/"
        + urllib.parse.quote(book["archiveId"], safe="")
        + "/"
        + urllib.parse.quote(book["archiveFile"], safe="")
    )
    request = urllib.request.Request(source_url, headers={"User-Agent": HINDI_USER_AGENT, "Accept": "text/plain"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(MAX_HINDI_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        if cached:
            return {
                "key": key,
                "title": book["title"],
                "author": book["author"],
                "text": cached["content"],
                "source": "stale-cache",
                "sourceUrl": cached["source_url"],
                "cached": True,
                "fetchedAt": cached["fetched_at"],
            }
        raise ApiError(f"The source text could not be downloaded: {error}", 502, "hindi_unavailable")
    if len(raw) > MAX_HINDI_BYTES:
        raise ApiError("This text is larger than the local proxy limit.", 413, "hindi_too_large")
    content = raw.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    conn.execute(
        "INSERT INTO hindi_texts (book_key, content, source_url, fetched_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(book_key) DO UPDATE SET content = excluded.content, source_url = excluded.source_url, fetched_at = excluded.fetched_at",
        (key, content, source_url, iso()),
    )
    conn.commit()
    return {
        "key": key,
        "title": book["title"],
        "author": book["author"],
        "text": content,
        "source": "archive.org",
        "sourceUrl": source_url,
        "cached": False,
        "fetchedAt": iso(),
    }


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class ApiHandler(BaseHTTPRequestHandler):
    server_version = f"ScholarScroll/{API_VERSION}"
    protocol_version = "HTTP/1.1"

    # -- helpers ---------------------------------------------------------

    def send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, status: int, body: str) -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def send_error_json(self, error: ApiError) -> None:
        self.send_json(error.status, {"error": error.message, "code": error.code})

    def _read_body(self) -> bytes:
        """Read and cache the request body exactly once.

        Heartbeats and other fire-and-forget POSTs still carry a body, so it has
        to be drained even when the handler never inspects the payload. Leaving
        bytes in the socket would be parsed as the next request line.
        """
        if getattr(self, "_body_raw", None) is not None:
            return self._body_raw
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_JSON_BODY:
            raise ApiError("Request body is too large.", 413, "body_too_large")
        self._body_raw = self.rfile.read(length) if length > 0 else b""
        return self._body_raw

    def read_json(self) -> dict:
        if getattr(self, "_cached_body", None) is not None:
            return self._cached_body
        raw = self._read_body()
        if not raw:
            self._cached_body = {}
            return self._cached_body
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError("Send a valid JSON body.", 400, "json_invalid")
        if not isinstance(payload, dict):
            raise ApiError("Send a JSON object.", 400, "json_invalid")
        self._cached_body = payload
        return payload

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - stdlib signature
        sys.stdout.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    # -- routing ---------------------------------------------------------

    def handle(self) -> None:
        # Browsers routinely drop idle keep-alive sockets; treat that as normal
        # instead of letting socketserver print a traceback for every close.
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        self.route("HEAD")

    def do_GET(self) -> None:  # noqa: N802
        self.route("GET")

    def do_POST(self) -> None:  # noqa: N802
        self.route("POST")

    def do_DELETE(self) -> None:  # noqa: N802
        self.route("DELETE")

    def route(self, method: str) -> None:
        # A keep-alive connection reuses this handler instance, so per-request
        # body caches must be reset before the next request is dispatched.
        self._body_raw = None
        self._cached_body = None
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/api/health":
                self.send_json(
                    200,
                    {
                        "ok": True,
                        "service": APP_NAME,
                        "version": API_VERSION,
                        "serverTime": iso(),
                        "maxDevices": MAX_DEVICES,
                        "hindiBooks": len(HINDI_BOOKS),
                        "features": ["auth", "devices", "premium", "vouchers", "hindi"],
                    },
                )
                return

            if path == "/api/premium/plans":
                self.send_json(200, {"plans": list(PLANS.values())})
                return

            if path == "/api/hindi/books":
                self.send_json(200, {"books": [public_hindi_book(book) for book in HINDI_BOOKS]})
                return

            if path.startswith("/api/hindi/text/"):
                key = path.rsplit("/", 1)[-1]
                book = hindi_book(key)
                if not book:
                    raise ApiError("Hindi title not found.", 404, "hindi_not_found")
                conn = connect()
                try:
                    payload = load_hindi_text(conn, book, refresh=query.get("refresh", ["0"])[0] == "1")
                finally:
                    conn.close()
                # The browser reader expects plain text; the JSON shape is kept
                # for API clients and tests.
                if query.get("raw", ["0"])[0] == "1":
                    self.send_text(200, payload["text"])
                else:
                    self.send_json(200, payload)
                return

            if path.startswith("/api/"):
                conn = connect()
                try:
                    self.handle_api(method, path, query, conn)
                finally:
                    conn.close()
                return

            if method in ("GET", "HEAD"):
                self.serve_static(path)
                return

            raise ApiError("Not found.", 404, "not_found")
        except ApiError as error:
            self.send_error_json(error)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:  # pragma: no cover - defensive
            traceback.print_exc()
            self.send_json(500, {"error": f"Server error: {error}", "code": "server_error"})
        finally:
            if method in ("POST", "PUT", "PATCH", "DELETE"):
                try:
                    self._read_body()
                except Exception:
                    pass

    def handle_api(self, method: str, path: str, query: dict, conn: sqlite3.Connection) -> None:
        parts = [part for part in path.strip("/").split("/") if part]

        # ---- auth ------------------------------------------------------
        if path == "/api/auth/register" and method == "POST":
            payload = self.read_json()
            name = clean_text(payload.get("name"), 80)
            email = clean_text(payload.get("email"), 160).lower()
            password = str(payload.get("password") or "")
            if len(name) < 2:
                raise ApiError("Enter your name.", 400, "name_invalid")
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                raise ApiError("Enter a valid email address.", 400, "email_invalid")
            if len(password) < 8:
                raise ApiError("Use a password of at least 8 characters.", 400, "password_short")
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                raise ApiError("An account already exists for this email.", 409, "email_exists")
            user_id = f"user-{secrets.token_hex(8)}"
            now = iso()
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'student', ?)",
                (user_id, name, email, hash_password(password), now),
            )
            conn.execute(
                "INSERT INTO entitlements (user_id, monthly_until, lifetime_all, updated_at) VALUES (?, NULL, 0, ?)",
                (user_id, now),
            )
            device_id = clean_text(payload.get("deviceId"), 120) or f"web-{secrets.token_hex(6)}"
            label = clean_text(payload.get("deviceLabel"), 120) or "Web browser"
            token, evicted = register_device(conn, user_id, device_id, label)
            conn.commit()
            self.send_json(201, session_payload(conn, user_id, token, evicted))
            return

        if path == "/api/auth/login" and method == "POST":
            payload = self.read_json()
            email = clean_text(payload.get("email"), 160).lower()
            password = str(payload.get("password") or "")
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                raise ApiError("The email or password is incorrect.", 401, "credentials_invalid")
            device_id = clean_text(payload.get("deviceId"), 120) or f"web-{secrets.token_hex(6)}"
            label = clean_text(payload.get("deviceLabel"), 120) or "Web browser"
            token, evicted = register_device(conn, user["id"], device_id, label)
            conn.commit()
            self.send_json(200, session_payload(conn, user["id"], token, evicted))
            return

        if path == "/api/auth/logout" and method == "POST":
            user, session = require_auth(conn, self)
            conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
            conn.commit()
            self.send_json(200, {"ok": True})
            return

        if path == "/api/me" and method == "GET":
            user, session = require_auth(conn, self)
            payload = session_payload(conn, user["id"])
            payload["session"] = {"deviceId": session["device_id"], "createdAt": session["created_at"]}
            self.send_json(200, payload)
            return

        # ---- devices ---------------------------------------------------
        if path == "/api/devices" and method == "GET":
            user, _ = require_auth(conn, self)
            self.send_json(200, {"devices": devices_for(conn, user["id"]), "maxDevices": MAX_DEVICES})
            return

        if path == "/api/devices/heartbeat" and method == "POST":
            user, session = require_auth(conn, self)
            self.send_json(
                200,
                {
                    "ok": True,
                    "devices": devices_for(conn, user["id"]),
                    "entitlements": entitlements_for(conn, user["id"]),
                    "vouchers": vouchers_for(conn, user["id"]),
                    "currentDeviceId": session["device_id"],
                },
            )
            return

        if path.startswith("/api/devices/") and method == "DELETE":
            user, session = require_auth(conn, self)
            device_row_id = path.rsplit("/", 1)[-1]
            target = conn.execute(
                "SELECT * FROM devices WHERE id = ? AND user_id = ?",
                (device_row_id, user["id"]),
            ).fetchone()
            if not target:
                raise ApiError("That device is not connected.", 404, "device_not_found")
            if target["device_id"] == session["device_id"]:
                raise ApiError("You cannot disconnect the device you are using.", 400, "device_current")
            conn.execute("DELETE FROM sessions WHERE user_id = ? AND device_id = ?", (user["id"], target["device_id"]))
            conn.execute("DELETE FROM devices WHERE id = ?", (target["id"],))
            conn.commit()
            self.send_json(200, {"ok": True, "devices": devices_for(conn, user["id"])})
            return

        # ---- premium ---------------------------------------------------
        if path == "/api/premium/entitlements" and method == "GET":
            user, _ = require_auth(conn, self)
            self.send_json(
                200,
                {
                    "entitlements": entitlements_for(conn, user["id"]),
                    "vouchers": vouchers_for(conn, user["id"]),
                    "orders": orders_for(conn, user["id"]),
                },
            )
            return

        if path == "/api/premium/quote" and method == "POST":
            user, _ = require_auth(conn, self)
            payload = self.read_json()
            quote = quote_plan(
                conn,
                user["id"],
                payload.get("planId"),
                payload.get("bookKey"),
                payload.get("voucherCode"),
            )
            self.send_json(200, {"ok": True, **quote})
            return

        if path == "/api/premium/purchase" and method == "POST":
            user, _ = require_auth(conn, self)
            payload = self.read_json()
            quote = quote_plan(
                conn,
                user["id"],
                payload.get("planId"),
                payload.get("bookKey"),
                payload.get("voucherCode"),
            )
            order = apply_purchase(conn, user["id"], quote)
            response = session_payload(conn, user["id"])
            response.update({"ok": True, "order": order})
            self.send_json(201, response)
            return

        if path == "/api/orders" and method == "GET":
            user, _ = require_auth(conn, self)
            self.send_json(200, {"orders": orders_for(conn, user["id"])})
            return

        # ---- vouchers --------------------------------------------------
        if path == "/api/vouchers" and method == "GET":
            user, _ = require_auth(conn, self)
            self.send_json(200, {"vouchers": vouchers_for(conn, user["id"])})
            return

        if path == "/api/vouchers/issue" and method == "POST":
            user, _ = require_auth(conn, self)
            payload = self.read_json()
            voucher = issue_voucher(conn, user, payload.get("certificateId"))
            self.send_json(201, {"ok": True, "voucher": voucher, "vouchers": vouchers_for(conn, user["id"])})
            return

        if path == "/api/vouchers/validate" and method == "POST":
            user, _ = require_auth(conn, self)
            payload = self.read_json()
            row = find_voucher(conn, payload.get("code"), user["id"])
            self.send_json(
                200,
                {
                    "ok": True,
                    "code": row["code"],
                    "discountPercent": row["discount_percent"],
                    "expiresAt": row["expires_at"],
                    "email": row["email"],
                },
            )
            return

        raise ApiError("API route not found.", 404, "not_found")

    # -- static files ----------------------------------------------------

    def serve_static(self, path: str) -> None:
        relative = path.lstrip("/") or "index.html"
        if relative.endswith("/"):
            relative += "index.html"
        candidate = (ROOT / relative).resolve()
        try:
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            raise ApiError("Not found.", 404, "not_found")
        blocked = ("server/data", ".git", "server/app.py", "server/__pycache__")
        normalized = candidate.as_posix()
        if any(f"/{item}" in normalized or normalized.endswith(item) for item in blocked):
            raise ApiError("Not found.", 404, "not_found")
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            raise ApiError("Not found.", 404, "not_found")

        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix == ".mjs":
            content_type = "text/javascript; charset=utf-8"
        elif candidate.suffix in (".js", ".css", ".html", ".json", ".webmanifest"):
            content_type = f"{content_type}; charset=utf-8"
        data = candidate.read_bytes()
        # Tell the front end that this origin is the backend. Static hosts keep
        # the empty meta value and therefore skip doomed /api probes.
        if candidate.name == "index.html":
            try:
                html = data.decode("utf-8")
            except UnicodeDecodeError:
                html = ""
            if html:
                if 'name="scholarscroll-backend"' in html:
                    html = re.sub(
                        r'<meta name="scholarscroll-backend" content="[^"]*"\s*/?>',
                        '<meta name="scholarscroll-backend" content="auto" />',
                        html,
                        count=1,
                    )
                else:
                    html = html.replace(
                        "</head>",
                        '  <meta name="scholarscroll-backend" content="auto" />\n  </head>',
                        1,
                    )
                data = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        # A separately hosted front end (Vercel) fetches premium PDFs and the
        # Hindi proxy from this origin, so static assets need the same CORS
        # policy as the JSON API.
        self.send_cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)


def main() -> int:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    print(f"{APP_NAME} backend {API_VERSION}")
    print(f"  App:  http://{HOST}:{PORT}/")
    print(f"  API:  http://{HOST}:{PORT}/api/health")
    print(f"  DB:   {DB_PATH}")
    print("  Demo: maya@scholarscroll.local / reader2026")
    print("        elena@scholarscroll.local / admin2026")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping ScholarScroll backend.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
