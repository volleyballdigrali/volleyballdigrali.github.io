"""
Volleyball Team - Home Base
Keeps the club's master SQLite database (volleyball.db) on this PC, imports sync files from the
coaches' phones, and exports setup files back to them.

Python 3.7 or newer, standard library only.   Run:  python home_base.py   then open http://localhost:8770
Folders next to this file:
  volleyball.db   the master database (open it with any SQLite tool, e.g. DB Browser for SQLite)
  inbox/          drop sync files here; they are imported at start-up or with "Import inbox"
  imports/        a copy of every file that was imported
  backups/        one copy of the database per day
"""
import csv
import datetime
import io
import glob
import html
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import uuid
import webbrowser
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

VERSION = "1.8.1"
PORT = 8770
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "volleyball.db")
INBOX = os.path.join(HERE, "inbox")
IMPORTS = os.path.join(HERE, "imports")
BACKUPS = os.path.join(HERE, "backups")
SYNC_FORMAT, SYNC_FORMAT_VERSION = "vbteam-sync", 1

# Same tables and columns as the phone app (js/schema.js). New columns or tables found in a
# sync file are added automatically, so the database can grow without changing this program.
COMMON = ["id", "created_at", "updated_at", "device", "deleted"]
TABLES = {
    "teams":     ["name", "season", "notes", "levels", "age_group", "sub_limit"],
    "staff":     ["team_id", "role", "first", "last", "phone", "email"],
    "players":   ["first", "last", "number", "position", "notes"],
    "roster":    ["team_id", "player_id", "number", "position", "rot"],
    "matches":   ["team_id", "date", "time", "opponent", "location", "event", "status", "scoring", "cur_set", "notes"],
    "sets":      ["match_id", "set_no", "us", "them"],
    "actions":   ["match_id", "set_no", "player_id", "skill", "result", "tap", "us", "them", "court_pos", "serving", "lineup", "rot_no"],
    "court_log": ["match_id", "set_no", "player_id", "court_pos", "event", "us", "them", "lineup", "rot_no", "subs", "tap"],
    "duties":    ["name", "sort"],
    "work_log":  ["team_id", "match_id", "player_id", "duty_id", "status", "session", "date", "label", "slot"],
    "links":     ["title", "url", "category", "sort"],
    "settings":  ["key", "value"],
    "scout_teams":   ["name", "notes"],
    "scout_players": ["scout_team_id", "number", "position", "comment"],
    "scout_matches": ["date", "team1_id", "team2_id", "location"],
    "scout_passes":  ["match_id", "scout_team_id", "scout_player_id", "rating", "tap"],
}
# Fields that are no longer kept (players' birth date and age): removed from the database at start-up
# and ignored in any sync file, even one from a phone that hasn't updated yet.
DROPPED = {"players": ["age", "birth_date"]}
SETUP_TABLES = ["teams", "staff", "players", "roster", "matches", "sets", "duties", "work_log", "links", "settings",
                "scout_teams", "scout_players", "scout_matches", "scout_passes"]
DUTY_NAMES = ["Score keeper", "Libero tracker", "Scoreboard", "Line Judge 1A", "Line Judge 1B", "Line Judge 2A",
              "Line Judge 2B", "Line Judge 3A", "Line Judge 3B", "Swing Helper"]
# --- TERMS (generated from terms-source.py) ---
TERMS_VERSION = '2026-11-23'
TERMS_SUMMARY = ['Free and open source, provided as is, with no warranty of any kind.', "The authors aren't responsible for lost data, wrong stats, or decisions made with the app (lineups, playing time, tryouts and so on).", 'Your team data stays with you: on your phone and your own PC. Nothing is sent to the authors or anyone else. It only moves when you send a file.', "You're responsible for your own backups (Export or Home Base) and for keeping your phone and files secure.", "You have permission from your club and the players' parents or guardians to record players' information, and you'll follow your club and league rules.", 'Not affiliated with any league, club or governing body. Minnesota law applies.']
TERMS_HTML = '<h3>1. What this is</h3><p>Volleyball Digrali (the Team app, Home Base and the Volleyball Digrali web pages) is free, open-source software made by the Volleyball Digrali contributors for volleyball coaches. The source code is published under the MIT License.</p><h3>2. Agreeing to these terms</h3><p>By installing or using Volleyball Digrali you agree to these terms. If you don&#x27;t agree, don&#x27;t use it.</p><h3>3. Provided as is</h3><p>Volleyball Digrali is provided &quot;as is&quot; and &quot;as available&quot;, without warranty of any kind, express or implied, including any warranty of accuracy, fitness for a particular purpose, or that it will work without errors or interruptions.</p><p>Statistics, playing time, rotations and other results depend on what is entered and may be incomplete or wrong. Check anything important yourself.</p><h3>4. No responsibility for loss or decisions</h3><p>To the fullest extent permitted by law, the Volleyball Digrali contributors are not liable for any damages or losses of any kind arising from using or not being able to use Volleyball Digrali. This includes lost or damaged data, incorrect statistics, and any decision made with its help, such as lineups, substitutions, playing time, tryouts, team placement or recruiting, and any dispute about them.</p><h3>5. Your data stays with you</h3><p>Everything you enter is stored only on your own devices: in the app on each phone or browser, and in Home Base&#x27;s database on your own PC. It is not sent to the Volleyball Digrali contributors or to anyone else.</p><p>Data only moves when you choose to send a sync or setup file to someone. You decide who receives your files.</p><p>Removing the app, clearing your browser&#x27;s data, or losing your phone can delete your data. You are responsible for your own backups (More → Sync → Export, or Home Base) and for keeping your devices and files secure.</p><h3>6. Players&#x27; information</h3><p>The app can hold players&#x27; names, numbers, ages and statistics, and many players are minors. By using it you confirm that you have any permission required from your club and from players&#x27; parents or guardians to record this information, and that you will follow your club&#x27;s, league&#x27;s and school&#x27;s policies and the law.</p><p>Use the information only for coaching your team, share files only with people who need them, and delete information you no longer need. Never post sync or setup files anywhere public.</p><p>When scouting other teams, record players by number only, not by name.</p><h3>7. The web site</h3><p>The app and these pages are served by GitHub Pages, and the app loads its fonts from Google Fonts. Like any web site, those services may see your device&#x27;s internet address when pages load; their own terms and privacy policies apply. No team data is ever sent to them.</p><h3>8. Not affiliated</h3><p>Volleyball Digrali is not affiliated with, endorsed by or sponsored by any league, club, school or governing body, or by Apple or Google.</p><h3>9. Changes</h3><p>These terms may be updated. When they change, the app asks you to review them again. Continuing to use Volleyball Digrali after a change means you accept the updated terms.</p><h3>10. Governing law</h3><p>These terms are governed by the laws of the State of Minnesota, USA. If any part of them can&#x27;t be enforced, the rest still applies.</p><h3>11. Open-source license</h3><p>The software itself is licensed under the MIT License (Copyright (c) 2026 The Volleyball Digrali contributors), which also says it is provided as is, without warranty, and that the authors are not liable for any claim or damages. The license is in the LICENSE.md file of the source code.</p>'
# --- END TERMS ---
NAME_OK = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,62}$")

VIEWS = {
    "v_schedule": """
        SELECT t.name AS team, m.date,
          CASE CAST(strftime('%w', m.date) AS INTEGER) WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
            WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday' ELSE 'Saturday' END AS day,
          m.time, m.opponent, m.location, m.event, m.status
        FROM matches m LEFT JOIN teams t ON t.id = m.team_id
        WHERE m.deleted = 0 ORDER BY t.name, m.date, m.time""",
    "v_match_results": """
        SELECT t.name AS team, m.date, m.opponent, m.status,
          SUM(CASE WHEN s.us > s.them THEN 1 ELSE 0 END) AS sets_won,
          SUM(CASE WHEN s.them > s.us THEN 1 ELSE 0 END) AS sets_lost,
          GROUP_CONCAT(s.us || '-' || s.them, ', ') AS scores
        FROM matches m LEFT JOIN teams t ON t.id = m.team_id
          LEFT JOIN (SELECT * FROM sets WHERE deleted = 0 ORDER BY set_no) s ON s.match_id = m.id
        WHERE m.deleted = 0 GROUP BY m.id ORDER BY t.name, m.date""",
    "_actions_full": """
        SELECT a.*, m.date, m.opponent, t.name AS team, r.number, p.first, p.last
        FROM actions a JOIN matches m ON m.id = a.match_id AND m.deleted = 0
          LEFT JOIN teams t ON t.id = m.team_id
          LEFT JOIN players p ON p.id = a.player_id
          LEFT JOIN roster r ON r.team_id = m.team_id AND r.player_id = a.player_id AND r.deleted = 0
        WHERE a.deleted = 0""",
    "v_serves":   "SELECT team, date, opponent, set_no, number, first, last, result FROM _actions_full WHERE skill = 'serve'",
    "v_receives": "SELECT team, date, opponent, set_no, number, first, last, CAST(result AS INTEGER) AS rating FROM _actions_full WHERE skill = 'receive'",
    "v_attacks":  "SELECT team, date, opponent, set_no, number, first, last, result FROM _actions_full WHERE skill = 'attack'",
    "v_blocks":   "SELECT team, date, opponent, set_no, number, first, last, result FROM _actions_full WHERE skill = 'block'",
    "v_assists":  "SELECT team, date, opponent, set_no, number, first, last, result FROM _actions_full WHERE skill = 'set'",
    "v_points":   "SELECT team, date, opponent, set_no, result AS won_by, us AS us_before, them AS them_before FROM _actions_full WHERE skill = 'point'",
    "v_player_season": """
        SELECT t.name AS team, r.number, p.first, p.last,
          COUNT(CASE WHEN a.skill = 'serve' THEN 1 END) AS serves,
          COUNT(CASE WHEN a.skill = 'serve' AND a.result = 'ace' THEN 1 END) AS aces,
          COUNT(CASE WHEN a.skill = 'serve' AND a.result = 'in' THEN 1 END) AS serves_in,
          COUNT(CASE WHEN a.skill = 'serve' AND a.result = 'out' THEN 1 END) AS serves_out,
          ROUND(100.0 * COUNT(CASE WHEN a.skill = 'serve' AND a.result IN ('ace','in') THEN 1 END)
                / NULLIF(COUNT(CASE WHEN a.skill = 'serve' THEN 1 END), 0), 0) AS serve_pct,
          COUNT(CASE WHEN a.skill = 'receive' THEN 1 END) AS passes,
          ROUND(AVG(CASE WHEN a.skill = 'receive' THEN CAST(a.result AS REAL) END), 2) AS avg_pass,
          COUNT(CASE WHEN a.skill = 'attack' AND a.result = 'kill' THEN 1 END) AS kills,
          COUNT(CASE WHEN a.skill = 'attack' AND a.result = 'error' THEN 1 END) AS attack_errors,
          COUNT(CASE WHEN a.skill = 'attack' THEN 1 END) AS attempts,
          ROUND(1.0 * (COUNT(CASE WHEN a.skill = 'attack' AND a.result = 'kill' THEN 1 END) - COUNT(CASE WHEN a.skill = 'attack' AND a.result = 'error' THEN 1 END))
                / NULLIF(COUNT(CASE WHEN a.skill = 'attack' THEN 1 END), 0), 3) AS hit_pct,
          COUNT(CASE WHEN a.skill = 'block' AND a.result = 'solo' THEN 1 END) AS solo_blocks,
          COUNT(CASE WHEN a.skill = 'block' AND a.result = 'assist' THEN 1 END) AS block_assists,
          COUNT(CASE WHEN a.skill = 'block' AND a.result = 'error' THEN 1 END) AS block_errors,
          COUNT(CASE WHEN a.skill = 'set' AND a.result = 'assist' THEN 1 END) AS set_assists,
          COUNT(CASE WHEN a.skill = 'set' AND a.result = 'error' THEN 1 END) AS set_errors
        FROM roster r JOIN players p ON p.id = r.player_id AND p.deleted = 0
          JOIN teams t ON t.id = r.team_id AND t.deleted = 0
          LEFT JOIN matches m ON m.team_id = r.team_id AND m.deleted = 0
          LEFT JOIN actions a ON a.match_id = m.id AND a.player_id = p.id AND a.deleted = 0
        WHERE r.deleted = 0
        GROUP BY r.id ORDER BY t.name, CAST(r.number AS INTEGER), p.first""",
    "_court_seen": """
        SELECT a.match_id, a.set_no, CAST(COALESCE(a.rot_no, 0) AS INTEGER) AS rot_no, j.value AS player_id, 1 AS rally
        FROM actions a, json_each(a.lineup) j
        WHERE a.skill = 'point' AND a.deleted = 0 AND json_valid(a.lineup) AND j.value IS NOT NULL
        UNION ALL
        SELECT c.match_id, c.set_no, CAST(COALESCE(c.rot_no, 0) AS INTEGER), j.value, 0
        FROM court_log c, json_each(c.lineup) j
        WHERE c.deleted = 0 AND json_valid(c.lineup) AND j.value IS NOT NULL""",
    "v_playing_time": """
        SELECT team, number, first, last, sets, rotations, rallies,
          ROUND(100.0 * rallies / NULLIF(team_rallies, 0), 0) AS pct_of_rallies
        FROM (
          SELECT t.name AS team, r.number, p.first, p.last,
            (SELECT COUNT(DISTINCT s.match_id || ':' || s.set_no) FROM _court_seen s JOIN matches m ON m.id = s.match_id AND m.deleted = 0
               WHERE s.player_id = p.id AND m.team_id = t.id) AS sets,
            (SELECT COUNT(DISTINCT s.match_id || ':' || s.set_no || ':' || s.rot_no) FROM _court_seen s JOIN matches m ON m.id = s.match_id AND m.deleted = 0
               WHERE s.player_id = p.id AND m.team_id = t.id) AS rotations,
            (SELECT COUNT(*) FROM _court_seen s JOIN matches m ON m.id = s.match_id AND m.deleted = 0
               WHERE s.player_id = p.id AND m.team_id = t.id AND s.rally = 1) AS rallies,
            (SELECT COUNT(*) FROM actions a JOIN matches m ON m.id = a.match_id AND m.deleted = 0
               WHERE m.team_id = t.id AND a.skill = 'point' AND a.deleted = 0 AND json_valid(a.lineup)) AS team_rallies
          FROM roster r JOIN players p ON p.id = r.player_id AND p.deleted = 0
            JOIN teams t ON t.id = r.team_id AND t.deleted = 0
          WHERE r.deleted = 0)
        ORDER BY team, CAST(number AS INTEGER), first""",
    "v_work_matrix": """
        SELECT t.name AS team, r.number, p.first, p.last,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-score-keeper' THEN 1 END) AS score_keeper,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-libero-tracker' THEN 1 END) AS libero_tracker,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-scoreboard' THEN 1 END) AS scoreboard,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-1a' THEN 1 END) AS line_judge_1a,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-1b' THEN 1 END) AS line_judge_1b,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-2a' THEN 1 END) AS line_judge_2a,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-2b' THEN 1 END) AS line_judge_2b,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-3a' THEN 1 END) AS line_judge_3a,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-line-judge-3b' THEN 1 END) AS line_judge_3b,
          COUNT(CASE WHEN w.status = 'worked' AND w.duty_id = 'duty-swing-helper' THEN 1 END) AS swing_helper,
          COUNT(CASE WHEN w.status = 'off' THEN 1 END) AS times_off,
          COUNT(CASE WHEN w.status = 'absent' THEN 1 END) AS times_absent,
          MAX(CASE WHEN w.status = 'worked' THEN w.date END) AS last_worked
        FROM roster r JOIN players p ON p.id = r.player_id AND p.deleted = 0
          JOIN teams t ON t.id = r.team_id AND t.deleted = 0
          LEFT JOIN work_log w ON w.player_id = p.id AND w.team_id = t.id AND w.deleted = 0
        WHERE r.deleted = 0
        GROUP BY r.id ORDER BY t.name, CAST(r.number AS INTEGER), p.first""",
    "v_scouting": """
        SELECT st.name AS team, sp.number, sp.position, sp.comment,
          COUNT(ps.id) AS passes, ROUND(AVG(CAST(ps.rating AS REAL)), 2) AS avg_pass,
          COUNT(CASE WHEN CAST(ps.rating AS INTEGER) = 0 THEN 1 END) AS zeros,
          COUNT(CASE WHEN CAST(ps.rating AS INTEGER) = 3 THEN 1 END) AS threes,
          MAX(sm.date) AS last_seen
        FROM scout_players sp JOIN scout_teams st ON st.id = sp.scout_team_id AND st.deleted = 0
          LEFT JOIN scout_passes ps ON ps.scout_player_id = sp.id AND ps.deleted = 0
          LEFT JOIN scout_matches sm ON sm.id = ps.match_id AND sm.deleted = 0
        WHERE sp.deleted = 0
        GROUP BY sp.id
        ORDER BY st.name, (COUNT(ps.id) = 0), AVG(CAST(ps.rating AS REAL)), CAST(sp.number AS INTEGER)""",
    "v_links": "SELECT COALESCE(NULLIF(category, ''), 'Other') AS grp, title, url FROM links WHERE deleted = 0 ORDER BY grp, title",
    "v_side_outs": """
        SELECT t.name AS team, m.date, m.opponent,
          COUNT(CASE WHEN a.serving = 'them' THEN 1 END) AS rallies_receiving,
          COUNT(CASE WHEN a.serving = 'them' AND a.result = 'us' THEN 1 END) AS side_outs,
          ROUND(100.0 * COUNT(CASE WHEN a.serving = 'them' AND a.result = 'us' THEN 1 END) / NULLIF(COUNT(CASE WHEN a.serving = 'them' THEN 1 END), 0), 0) AS side_out_pct,
          COUNT(CASE WHEN a.serving = 'us' THEN 1 END) AS rallies_serving,
          COUNT(CASE WHEN a.serving = 'us' AND a.result = 'us' THEN 1 END) AS points_on_serve
        FROM actions a JOIN matches m ON m.id = a.match_id AND m.deleted = 0 LEFT JOIN teams t ON t.id = m.team_id
        WHERE a.skill = 'point' AND a.deleted = 0
        GROUP BY m.id ORDER BY t.name, m.date""",
}


def now_iso():
    t = datetime.datetime.now(datetime.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (t.microsecond // 1000)


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def columns(conn, table):
    return [r[1] for r in conn.execute('PRAGMA table_info("%s")' % table)]


def ensure_table(conn, table, cols):
    if not NAME_OK.match(table):
        return False
    conn.execute('CREATE TABLE IF NOT EXISTS "%s" (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, device TEXT, deleted INTEGER DEFAULT 0)' % table)
    have = set(columns(conn, table))
    for c in cols:
        if c not in have and NAME_OK.match(c):
            conn.execute('ALTER TABLE "%s" ADD COLUMN "%s"' % (table, c))
            have.add(c)
    return True


def setup_db():
    for d in (INBOX, IMPORTS, BACKUPS):
        os.makedirs(d, exist_ok=True)
    conn = connect()
    with conn:
        for t, cols in TABLES.items():
            ensure_table(conn, t, cols)
        conn.execute("CREATE TABLE IF NOT EXISTS _meta (k TEXT PRIMARY KEY, v TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS _import_log (at TEXT, file TEXT, device TEXT, added INTEGER, updated INTEGER, skipped INTEGER)")
        for ix in ("actions(match_id)", "actions(player_id)", "roster(team_id)", "matches(team_id)", "sets(match_id)", "court_log(match_id)", "work_log(player_id)"):
            conn.execute("CREATE INDEX IF NOT EXISTS ix_%s ON %s" % (re.sub(r"\W+", "_", ix).strip("_"), ix))
        for i, name in enumerate(DUTY_NAMES):
            did = "duty-" + re.sub(r"[^a-z0-9]+", "-", name.lower())
            conn.execute("INSERT OR IGNORE INTO duties (id, created_at, updated_at, device, deleted, name, sort) VALUES (?,?,?,?,?,?,?)",
                         (did, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "seed", 0, name, i + 1))
        if not conn.execute("SELECT v FROM _meta WHERE k='device_id'").fetchone():
            conn.execute("INSERT INTO _meta VALUES ('device_id', ?)", (str(uuid.uuid4()),))
        for v in VIEWS:
            conn.execute('DROP VIEW IF EXISTS "%s"' % v)
        for t, cols in DROPPED.items():   # remove fields that are no longer kept
            for c in [c for c in cols if c in columns(conn, t)]:
                try:
                    conn.execute('ALTER TABLE "%s" DROP COLUMN "%s"' % (t, c))
                except sqlite3.Error:     # older SQLite: blank the values instead
                    conn.execute('UPDATE "%s" SET "%s" = NULL' % (t, c))
        for v, sql in VIEWS.items():
            try:
                conn.execute('CREATE VIEW "%s" AS %s' % (v, sql))
            except sqlite3.Error as e:   # e.g. an old SQLite without JSON support: skip that report only
                print("  Note: report %s is unavailable on this PC (%s)" % (v, e))
    conn.close()


def daily_backup():
    dest = os.path.join(BACKUPS, "volleyball-%s.db" % datetime.date.today().isoformat())
    if os.path.exists(DB_PATH) and not os.path.exists(dest):
        src, out = sqlite3.connect(DB_PATH), sqlite3.connect(dest)
        with out:
            src.backup(out)
        src.close(); out.close()


def sync_tables(conn):
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'")]
    return [t for t in TABLES if t in names] + sorted(t for t in names if t not in TABLES)


def cell(v):
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return v


IMPORT_LOCK = threading.Lock()


# ---------------- locked files ----------------
# Every sync and setup file is locked with the club's file password. The format, shared with the Team app (js/filelock.js):
#   a random 64-byte data key encrypts the content: HMAC-SHA256 in counter mode for the keystream, then an HMAC-SHA256 tag
#   over nonce + ciphertext (encrypt-then-MAC). The data key is stored once per password ("slot"), wrapped with a key made
#   from that password by PBKDF2-SHA256 with its own random salt. New random keys, salts and nonces for every file.
#   Only Python's standard library is used. No password is built in: each club sets its own.
import base64 as _b64
import hashlib as _hl
import hmac as _hm
import unicodedata as _ud

LOCK_FORMAT, LOCK_ITER = "vbteam-locked", 200000


class LockError(Exception):
    pass


def _b64e(b):
    return _b64.b64encode(b).decode("ascii")


def _b64d(x):
    return _b64.b64decode(str(x).encode("ascii"), validate=True)


def _keystream(key, nonce, n):
    base, out, i = _hm.new(key, digestmod=_hl.sha256), [], 0
    while 32 * i < n:
        h = base.copy(); h.update(nonce + i.to_bytes(4, "big")); out.append(h.digest()); i += 1
    return b"".join(out)[:n]


def _xor(a, b):
    return (int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).to_bytes(len(a), "big") if a else b""


def _pw_bytes(pw):
    return _ud.normalize("NFC", (pw or "").strip()).encode("utf-8")


def _kek(pw, salt, it):
    return _hl.pbkdf2_hmac("sha256", _pw_bytes(pw), salt, it, 64)


def lock_data(obj, passwords, kind):
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    dk, nonce = os.urandom(64), os.urandom(16)
    ct = _xor(data, _keystream(dk[:32], nonce, len(data)))
    mac = _hm.new(dk[32:], b"vbteam-locked-v1" + nonce + ct, _hl.sha256).digest()
    slots = []
    for pw in passwords:
        salt, sn = os.urandom(16), os.urandom(16)
        k = _kek(pw, salt, LOCK_ITER)
        w = _xor(dk, _keystream(k[:32], sn, 64))
        slots.append({"salt": _b64e(salt), "nonce": _b64e(sn), "key": _b64e(w),
                      "mac": _b64e(_hm.new(k[32:], b"vbteam-slot-v1" + salt + sn + w, _hl.sha256).digest())})
    return {"format": LOCK_FORMAT, "v": 1, "kind": kind, "kdf": {"alg": "pbkdf2-sha256", "iter": LOCK_ITER},
            "slots": slots, "nonce": _b64e(nonce), "ct": _b64e(ct), "mac": _b64e(mac)}


def is_locked(obj):
    return isinstance(obj, dict) and obj.get("format") == LOCK_FORMAT


def unlock_data(env, passwords):
    """Returns (content, index of the password that opened it). Raises LockError('password') or LockError('damaged')."""
    try:
        if int(env.get("v") or 0) > 1:
            raise LockError("newer")
        it = int(env["kdf"]["iter"])
        if not (1000 <= it <= 10000000):
            raise LockError("damaged")
        nonce, ct, mac = _b64d(env["nonce"]), _b64d(env["ct"]), _b64d(env["mac"])
        slots = [(_b64d(x["salt"]), _b64d(x["nonce"]), _b64d(x["key"]), _b64d(x["mac"])) for x in env["slots"]]
    except LockError:
        raise
    except (KeyError, TypeError, ValueError, AttributeError):
        raise LockError("damaged")
    for i, pw in enumerate(p for p in passwords if p):
        for salt, sn, w, sm in slots:
            k = _kek(pw, salt, it)
            if not _hm.compare_digest(_hm.new(k[32:], b"vbteam-slot-v1" + salt + sn + w, _hl.sha256).digest(), sm):
                continue
            dk = _xor(w, _keystream(k[:32], sn, 64))
            if not _hm.compare_digest(_hm.new(dk[32:], b"vbteam-locked-v1" + nonce + ct, _hl.sha256).digest(), mac):
                raise LockError("damaged")
            try:
                return json.loads(_xor(ct, _keystream(dk[:32], nonce, len(ct))).decode("utf-8")), i
            except ValueError:
                raise LockError("damaged")
    raise LockError("password")


# The club's file password lives in this PC's database only (_meta), never in any file it sends out.
# Older passwords are kept so files made before a change still open.
def file_passwords():
    conn = connect()
    r = conn.execute("SELECT v FROM _meta WHERE k='file_password'").fetchone()
    conn.close()
    try:
        v = json.loads(r[0]) if r else {}
    except ValueError:
        v = {}
    if not v.get("current") and os.environ.get("VB_FILE_PASSWORD"):   # for automated set-ups and tests
        v = {"current": os.environ["VB_FILE_PASSWORD"], "old": [], "carry": True}
    return v


def set_file_password(new, carry=True):
    v = file_passwords()
    old = ([v["current"]] if v.get("current") else []) + [p for p in v.get("old", []) if p != v.get("current")]
    old = [p for p in old if p != new][:10]
    conn = connect()
    with conn:
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('file_password', ?)",
                     (json.dumps({"current": new, "old": old, "carry": bool(carry) and bool(old), "changed": now_iso()}),))
    conn.close()


def lock_for_send(obj, kind):
    v = file_passwords()
    if not v.get("current"):
        raise LockError("nopassword")
    pws = [v["current"]]
    if kind == "setup" and v.get("carry") and v.get("old"):
        pws.append(v["old"][0])                 # phones that only know the previous password can still open it...
        obj = dict(obj, club_password=v["current"])   # ...and learn the new one from inside the locked file
    elif kind == "setup":
        obj = dict(obj, club_password=v["current"])
    return lock_data(obj, pws, kind)


def open_received(obj):
    """Unlock a received file with the club password (or an older one). Plain files are refused."""
    if isinstance(obj, dict) and obj.get("format") == SYNC_FORMAT:
        raise LockError("plain")
    if not is_locked(obj):
        raise LockError("notours")
    v = file_passwords()
    if not v.get("current"):
        raise LockError("nopassword")
    data, i = unlock_data(obj, [v["current"]] + v.get("old", []))
    if isinstance(data, dict):
        data.pop("club_password", None)
        if i > 0:
            data["_older_password"] = True
    return data


LOCK_MESSAGES = {
    "plain": "This file isn't locked. Update the Team app, then export it again.",
    "notours": "This isn't a Team app sync file.",
    "nopassword": "Set the club's file password first (Dashboard, File password).",
    "password": "This file was locked with a different password. Check the password on the Dashboard (File password).",
    "damaged": "This file is damaged or was changed after it was made, so it can't be trusted. Export it again.",
    "newer": "This file is from a newer version of the app. Update Home Base first.",
}


def import_data(data, file_label="(upload)"):
    with IMPORT_LOCK:
        return _import_data(data, file_label)


def _import_data(data, file_label):
    """Merge a sync file. New id -> add; newer updated_at -> replace; otherwise skip. Never deletes."""
    if not isinstance(data, dict) or data.get("format") != SYNC_FORMAT or not isinstance(data.get("tables"), dict):
        return {"ok": False, "error": "This isn't a Team app sync file."}
    if int(data.get("format_version") or 0) > SYNC_FORMAT_VERSION:
        return {"ok": False, "error": "This file is from a newer version of the app. Update Home Base first."}
    conn = connect()
    summary = {"ok": True, "from": data.get("device_name") or "unknown device", "exported_at": data.get("exported_at"), "tables": {}}
    totals = [0, 0, 0]
    try:
        with conn:
            for table, rows in data["tables"].items():
                if not isinstance(rows, list) or not NAME_OK.match(table):
                    continue
                drop = set(DROPPED.get(table, []))
                cols = set(TABLES.get(table, []))
                for r in rows:
                    if isinstance(r, dict):
                        cols.update(k for k in r if k not in COMMON and k not in drop)
                ensure_table(conn, table, sorted(cols))
                s = {"added": 0, "updated": 0, "skipped": 0, "invalid": 0}
                have = set(columns(conn, table))
                for r in rows:
                    if not (isinstance(r, dict) and isinstance(r.get("id"), str) and r["id"] and isinstance(r.get("updated_at"), str)):
                        s["invalid"] += 1
                        continue
                    keys = [k for k in r if k in have and k not in drop]
                    old = conn.execute('SELECT updated_at FROM "%s" WHERE id = ?' % table, (r["id"],)).fetchone()
                    if old is not None and not (r["updated_at"] > (old[0] or "")):
                        s["skipped"] += 1
                        continue
                    conn.execute('INSERT OR REPLACE INTO "%s" (%s) VALUES (%s)' % (table, ", ".join('"%s"' % k for k in keys), ", ".join("?" * len(keys))),
                                 [cell(r[k]) for k in keys])
                    s["added" if old is None else "updated"] += 1
                summary["tables"][table] = s
                totals[0] += s["added"]; totals[1] += s["updated"]; totals[2] += s["skipped"]
            conn.execute("INSERT INTO _import_log VALUES (?,?,?,?,?,?)", (now_iso(), file_label, summary["from"], *totals))
    except sqlite3.Error as e:
        return {"ok": False, "error": "Database error, nothing was imported: %s" % e}
    finally:
        conn.close()
    return summary


def save_copy(raw, label):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(label or "upload.json"))[:80]
    with open(os.path.join(IMPORTS, "%s-%s" % (stamp, safe)), "wb") as f:
        f.write(raw)


CLOUD_RX = re.compile(r"onedrive|dropbox|google ?drive|icloud", re.I)


def scrub_once():
    """One-time clean-up (Home Base 1.5): take players' birth dates and ages out of the saved copies in imports,
    inbox and backups, and compact the database so no trace of them is left. Everything else stays."""
    conn = connect()
    done = conn.execute("SELECT v FROM _meta WHERE k='scrub_birth_age'").fetchone()
    conn.close()
    if done:
        return None
    files = dbs = 0
    for path in glob.glob(os.path.join(IMPORTS, "*.json")) + glob.glob(os.path.join(INBOX, "*.json")):
        try:
            with open(path, "rb") as f:
                data = json.loads(f.read().decode("utf-8-sig"))
            changed = False
            for t, cols in DROPPED.items():
                for r in (data.get("tables") or {}).get(t) or [] if isinstance(data, dict) else []:
                    for c in cols:
                        if isinstance(r, dict) and c in r:
                            del r[c]; changed = True
            if changed:
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=1)
                os.replace(tmp, path)
                files += 1
        except (ValueError, OSError, AttributeError):
            pass
    for path in glob.glob(os.path.join(BACKUPS, "*.db")) + [DB_PATH]:
        try:
            c = sqlite3.connect(path)
            hit = False
            for t, cols in DROPPED.items():
                have = [r[1] for r in c.execute('PRAGMA table_info("%s")' % t)]
                for col in [x for x in cols if x in have]:
                    hit = True
                    try:
                        for (v,) in c.execute("SELECT name FROM sqlite_master WHERE type='view'").fetchall():
                            c.execute('DROP VIEW IF EXISTS "%s"' % v)   # backups only; views are rebuilt on the live database
                        c.execute('ALTER TABLE "%s" DROP COLUMN "%s"' % (t, col))
                    except sqlite3.Error:
                        c.execute('UPDATE "%s" SET "%s" = NULL' % (t, col))
            c.commit()
            c.execute("VACUUM")        # rewrite the file so removed values aren't left behind in free space
            c.close()
            if hit and path != DB_PATH:
                dbs += 1
        except sqlite3.Error:
            pass
    conn = connect()
    with conn:
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('scrub_birth_age', ?)", (json.dumps({"at": now_iso(), "files": files, "backups": dbs, "seen": not (files or dbs)}),))
    conn.close()
    setup_db()   # rebuild the report views (the live database was compacted above)
    return files, dbs


def scrub_note():
    conn = connect()
    r = conn.execute("SELECT v FROM _meta WHERE k='scrub_birth_age'").fetchone()
    conn.close()
    try:
        v = json.loads(r[0]) if r else None
    except ValueError:
        v = None
    if not v or v.get("seen"):
        return ""
    return ("<section class='card' id='scrub'><h2>One-time clean-up done</h2><p>Birth dates and ages are no longer kept. They were removed from "
            "the database, from %d saved file%s in <code>imports</code> and from %d backup%s in <code>backups</code>. Everything else is as it was.</p>"
            "<button class='btn alt' id='scrub-ok'>OK</button></section>"
            "<script>document.getElementById('scrub-ok').onclick=async()=>{await fetch('/api/scrub-ok',{method:'POST'});document.getElementById('scrub').remove();};</script>") % (
        v["files"], "" if v["files"] == 1 else "s", v["backups"], "" if v["backups"] == 1 else "s")


def scrub_seen():
    conn = connect()
    with conn:
        r = conn.execute("SELECT v FROM _meta WHERE k='scrub_birth_age'").fetchone()
        if r:
            v = json.loads(r[0]); v["seen"] = True
            conn.execute("UPDATE _meta SET v = ? WHERE k='scrub_birth_age'", (json.dumps(v),))
    conn.close()


def cloud_note():
    if not CLOUD_RX.search(HERE):
        return ""
    return ("<section class='card' style='border:2px solid #b91c1c'><h2>Home Base is in a cloud-synced folder</h2><p>This folder (<code>%s</code>) looks like "
            "OneDrive, Dropbox, Google Drive or iCloud. The database holds players' names, so the cloud service gets a copy. Move the whole folder to the PC "
            "itself, for example <code>C:\\vb-home-base</code>: close this window, move the folder, then start Home Base from its new place.</p></section>") % html.escape(HERE)


def import_received(raw, label):
    """A file from a phone or another Home Base: unlock it with the club password, then merge it."""
    try:
        data = open_received(json.loads(raw.decode("utf-8-sig")))
    except ValueError:
        return {"ok": False, "error": "That file isn't valid JSON."}
    except LockError as e:
        return {"ok": False, "error": LOCK_MESSAGES.get(str(e), LOCK_MESSAGES["damaged"])}
    older = isinstance(data, dict) and data.pop("_older_password", False)
    res = import_data(data, label)
    if res.get("ok") and older:
        res["note"] = "This file used an older password. Send that phone a new setup file so it learns the current one."
    return res


def import_inbox():
    results = []
    for path in sorted(glob.glob(os.path.join(INBOX, "*.json"))):
        name = os.path.basename(path)
        try:
            with open(path, "rb") as f:
                raw = f.read()
            res = import_received(raw, name)
        except OSError as e:
            res = {"ok": False, "error": "Couldn't read the file: %s" % e}
        if res.get("ok"):
            shutil.move(path, os.path.join(IMPORTS, datetime.datetime.now().strftime("%Y%m%d-%H%M%S-") + name))
        results.append((name, res))
    return results


def build_export(kind="setup"):
    conn = connect()
    device_id = conn.execute("SELECT v FROM _meta WHERE k='device_id'").fetchone()[0]
    names = SETUP_TABLES if kind == "setup" else sync_tables(conn)
    tables = {}
    for t in names:
        try:
            tables[t] = [dict(r) for r in conn.execute('SELECT * FROM "%s"' % t)]
        except sqlite3.Error:
            pass
    conn.close()
    return {"format": SYNC_FORMAT, "format_version": SYNC_FORMAT_VERSION, "schema_version": 1, "app_version": "home-base-" + VERSION,
            "device_id": device_id, "device_name": "Home Base", "exported_at": now_iso(), "kind": kind, "tables": tables}


# ---------------- web pages ----------------
CSS = """body{font-family:Segoe UI,system-ui,sans-serif;margin:0;background:#eef0f1;color:#18191c}
header{background:#17181b;color:#f1f1f2;padding:14px 24px}header h1{margin:0;font-size:24px}header a{color:#f1f1f2;margin-right:16px}
main{max-width:1000px;margin:0 auto;padding:20px;display:grid;gap:16px}.card{background:#fff;border:1px solid #d9dbde;border-radius:12px;padding:16px 20px}
h2{margin:0 0 10px;font-size:20px}table{border-collapse:collapse;width:100%}th,td{padding:6px 10px;border-top:1px solid #d9dbde;text-align:left}
th{font-size:13px;color:#5f636a;text-transform:uppercase}.btn{display:inline-block;font:inherit;font-weight:600;padding:9px 14px;border-radius:8px;border:1px solid #c8102e;
background:#c8102e;color:#fff;text-decoration:none;cursor:pointer;margin:4px 6px 4px 0}.btn.alt{background:#fff;color:#c8102e}
.muted{color:#5f636a}.ok{color:#16803c;font-weight:600}.bad{color:#b91c1c;font-weight:600}code{background:#eef0f1;padding:1px 5px;border-radius:4px}
header{padding:14px 24px 0}.hv{font-size:13px;font-weight:500;opacity:.65}.hd{display:flex;align-items:center;gap:12px}.logo{height:44px;background:#fff;border-radius:6px;padding:2px}
nav{display:flex;flex-wrap:wrap;gap:2px;margin-top:10px}nav a{margin:0;padding:8px 12px;border-radius:8px 8px 0 0;text-decoration:none;font-weight:600;font-size:14px;opacity:.8}
nav a:hover{opacity:1;background:rgba(255,255,255,.08)}nav a.on{background:#eef0f1;color:#17181b;opacity:1}
main{max-width:1200px}main>*{min-width:0}.scroll{overflow-x:auto}td,th{white-space:nowrap}tfoot td{font-weight:700;border-top:2px solid #18191c}
tbody tr:nth-child(even){background:#f7f9fb}
main a:not(.btn){color:#c8102e}
table.work td,table.work th{text-align:center}table.work td:nth-child(2),table.work th:nth-child(2){text-align:left}
.wk{font-weight:700}.wk.off,.wk.abs{color:#5f636a;font-weight:500}.wk.abs{color:#b91c1c}
.filters form{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}.filters label{display:grid;gap:3px;font-size:13px;font-weight:600;color:#5f636a}
.filters select,.filters input{font:inherit;padding:7px 8px;border:1px solid #c9d1da;border-radius:8px;min-width:130px;background:#fff}
.filters .tools{margin-top:8px;border-top:1px solid #e3e8ee;padding-top:8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px}
.kpi{background:#f3f6f9;border-radius:10px;padding:10px 12px}.kpi b{display:block;font-size:26px}.kpi span{font-size:13px;color:#5f636a}
.pc-head{display:flex;gap:14px;align-items:center}.pc-num{font-size:40px;font-weight:800;background:#17181b;color:#fff;border-radius:12px;min-width:64px;text-align:center;padding:4px 10px}
.pc-head h2{margin:0}.pc-head p{margin:2px 0 0}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}.chart h3{margin:0 0 4px;font-size:15px}
.chart svg{width:100%;height:auto;display:block}.chart .grid{stroke:#d9dbde}.chart .ax{font-size:11px;fill:#5f636a}
.chart .ln{fill:none;stroke:#c8102e;stroke-width:2.5}.chart .pt{fill:#c8102e;stroke:#fff;stroke-width:1.5}.chart .val{font-size:11px;font-weight:700;fill:#18191c}
.hbars{display:grid;gap:8px}.hb{display:grid;grid-template-columns:90px 1fr 50px;gap:10px;align-items:center}
.hb-track{height:16px;background:#eef0f1;border-radius:8px;overflow:hidden}.hb-fill{height:100%;border-radius:8px}
.hb-fill.red{background:#b91c1c}.hb-fill.amber{background:#c2620a}.hb-fill.green{background:#16803c}.hb b{text-align:right}

.foot{text-align:center;font-size:13px;color:#5f636a;padding:8px 0}.terms-card{border:2px solid #c8102e}.terms-card form{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.terms h3{margin:14px 0 2px;font-size:16px}.terms p{margin:4px 0}
.gauges{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}.gauge-box{margin:0;text-align:center}.gauge-box figcaption{font-weight:700}.gauge{width:100%;max-width:280px;height:auto}
.coach{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:start}.qr{text-align:center}.qr svg{width:240px;height:auto;display:block}
.coach ol{display:grid;gap:8px;padding-left:22px}@media (max-width:700px){.coach{grid-template-columns:1fr}}
@media print{body{background:#fff}header nav,.noprint,.filters{display:none}header{background:#fff;color:#18191c;padding:0 0 8px}
main{max-width:none;padding:0}.card{border:0;padding:6px 0;break-inside:avoid}.charts{grid-template-columns:1fr 1fr}td,th{padding:3px 6px;font-size:12px}}"""


LOGO_ID = "setting-club-logo"


def get_logo():
    conn = connect()
    row = conn.execute("SELECT value FROM settings WHERE id = ? AND deleted = 0", (LOGO_ID,)).fetchone()
    conn.close()
    v = row[0] if row else None
    return v if isinstance(v, str) and v.startswith("data:image/") else None


def set_logo(value):
    conn = connect()
    with conn:
        t = now_iso()
        if conn.execute("SELECT 1 FROM settings WHERE id = ?", (LOGO_ID,)).fetchone():
            conn.execute("UPDATE settings SET value = ?, updated_at = ?, device = 'Home Base', deleted = 0 WHERE id = ?", (value or "", t, LOGO_ID))
        else:
            conn.execute("INSERT INTO settings (id, created_at, updated_at, device, deleted, key, value) VALUES (?,?,?,?,?,?,?)",
                         (LOGO_ID, t, t, "Home Base", 0, "club_logo", value or ""))
    conn.close()


NAV = [("/", "Dashboard"), ("/report/season", "Season stats"), ("/report/players", "Player cards"), ("/report/match", "Match reports"),
       ("/report/rotations", "Rotations"), ("/report/trends", "Trends"), ("/report/playing", "Playing time"),
       ("/report/matches", "Match results"), ("/report/schedule", "Schedule"), ("/report/work", "Work"),
       ("/report/scouting", "Scouting"), ("/report/links", "Links"), ("/coach", "Add a coach")]


def terms_agreed():
    try:
        conn = connect()
        r = conn.execute("SELECT v FROM _meta WHERE k = 'terms_version'").fetchone()
        conn.close()
        return bool(r) and r[0] == TERMS_VERSION
    except sqlite3.Error:
        return False


def agree_terms():
    conn = connect()
    with conn:
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('terms_version', ?)", (TERMS_VERSION,))
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('terms_at', ?)", (now_iso(),))
    conn.close()


TERMS_CARD = """<section class='card terms-card noprint'><h2>%s</h2>
  <p>Volleyball Digrali is free and open source. Please read these points before using Home Base:</p><ul>%s</ul>
  <p><a href='/terms'>Read the full terms</a></p>
  <form method='post' action='/api/terms'><label><input type='checkbox' required> I have read and agree to the terms of use.</label>
  <button class='btn'>I agree</button></form></section>"""


def terms_page():
    conn = connect()
    r = conn.execute("SELECT v FROM _meta WHERE k = 'terms_at'").fetchone()
    conn.close()
    status = ("<p class='ok'>You agreed on %s.</p>" % html.escape(fmt_date((r[0] or "")[:10]))) if terms_agreed() and r else ""
    body = ("<section class='card'><h2>Terms of use</h2><p class='muted'>Version %s. Free and open source under the MIT License, "
            "made by the Volleyball Digrali contributors. <a href='https://github.com/volleyballdigrali/volleyballdigrali.github.io'>Source code</a></p>%s"
            "<h3>In short</h3><ul>%s</ul></section><section class='card terms'>%s</section>") % (
        html.escape(TERMS_VERSION), status, "".join("<li>%s</li>" % html.escape(x) for x in TERMS_SUMMARY), TERMS_HTML)
    return page("Terms of use", body, "/terms")


def page(title, body, active=None):
    logo = get_logo()
    img = ("<img src='%s' alt='' class='logo'>" % logo) if logo else ""
    nav = "".join("<a href='%s'%s>%s</a>" % (h, " class='on'" if h == active else "", n) for h, n in NAV)
    card = ""
    if active != "/terms" and not terms_agreed():   # shown on every page until agreed (and again if the terms change)
        try:
            conn = connect(); old = conn.execute("SELECT v FROM _meta WHERE k = 'terms_version'").fetchone(); conn.close()
        except sqlite3.Error:
            old = None
        card = TERMS_CARD % ("Updated terms: please review" if old else "Terms of use", "".join("<li>%s</li>" % html.escape(x) for x in TERMS_SUMMARY))
    return ("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
            "<title>%s</title><style>%s</style></head><body>"
            "<header><div class='hd'>%s<h1>Volleyball Home Base <span class='hv'>v%s</span></h1></div><nav>%s</nav></header>"
            "<main>%s%s<footer class='foot noprint'>Free and open source (MIT License) &middot; <a href='/terms'>Terms of use</a></footer></main></body></html>"
            % (html.escape(title), CSS, img, html.escape(VERSION), nav, card, body))


def table_html(rows, cols=None):
    if not rows:
        return "<p class='muted'>Nothing yet.</p>"
    cols = cols or list(rows[0].keys())
    return "<table><tr>%s</tr>%s</table>" % ("".join("<th>%s</th>" % html.escape(c) for c in cols),
        "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % html.escape("" if r[c] is None else str(r[c])) for c in cols) for r in rows))


# ---------------- import players from a CSV file (same columns as the Team app's Import CSV) ----------------
POSITIONS = ["Setter", "Pin", "Middle", "Right Side", "Libero", "DS"]
PLAYER_COLS = [("first", r"first"), ("last", r"last|surname"), ("number", r"^(#|no\.?|num|number|jersey)"), ("position", r"^pos"), ("team", r"team")]
PLAYER_TEMPLATE = "First Name,Last Name,Number,Position,Team\r\n"


def parse_players_csv(text):
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text.lstrip("﻿")))]
    rows = [(i + 1, r) for i, r in enumerate(rows) if any(r)]
    if rows and any(re.search(r"first|last|name|number|jersey|position|team", c, re.I) for c in rows[0][1]):
        head = rows.pop(0)[1]
        idx = {k: next((i for i, c in enumerate(head) if re.search(rx, c, re.I)), -1) for k, rx in PLAYER_COLS}
        if idx["first"] < 0:
            idx["first"] = next((i for i, c in enumerate(head) if re.search(r"name", c, re.I)), -1)
    else:   # no header: first, last, number, position, team (older files had an age column before team)
        old = any(len(r) > 5 for _, r in rows) and all(len(r) < 5 or not r[4] or re.match(r"^\d{1,2}$", r[4]) for _, r in rows)
        idx = {"first": 0, "last": 1, "number": 2, "position": 3, "team": 5 if old else 4}
    out = []
    for line, r in rows:
        g = lambda k: r[idx[k]].strip() if 0 <= idx[k] < len(r) else ""
        first, last = g("first"), g("last")
        if first and not last and idx["last"] < 0 and " " in first:
            first, last = first.split(" ", 1)
        pos_in = g("position")
        pos = next((p for p in POSITIONS if p.lower() == pos_in.lower()), "")
        out.append({"line": line, "first": first, "last": last.strip(), "number": g("number").lstrip("#"),
                    "position": pos, "position_in": pos_in, "team": g("team")})
    return out


def import_players(text, apply=False):
    """Preview (apply=False) or import a player CSV. Players match by first + last name (any capitals)."""
    rows = parse_players_csv(text)
    conn = connect()
    key = lambda f, l: ("%s|%s" % (f, l or "")).lower()
    players = {key(r["first"], r["last"]): dict(r) for r in conn.execute("SELECT * FROM players WHERE deleted = 0")}
    teams = {(r["name"] or "").lower(): dict(r) for r in conn.execute("SELECT id, name FROM teams WHERE deleted = 0")}
    roster = {(r["team_id"], r["player_id"]): dict(r) for r in conn.execute("SELECT * FROM roster WHERE deleted = 0")}
    res = {"ok": True, "rows": [], "new_players": 0, "updated_players": 0, "unchanged": 0, "new_teams": [], "rostered": 0, "skipped": 0}
    seen, t = set(), now_iso()
    try:
        with conn:
            for r in rows:
                notes = []
                if not r["first"]:
                    res["skipped"] += 1; res["rows"].append(dict(r, what="Skipped: no first name")); continue
                k = key(r["first"], r["last"])
                if k in seen:
                    res["skipped"] += 1; res["rows"].append(dict(r, what="Skipped: already earlier in this file")); continue
                seen.add(k)
                if r["position_in"] and not r["position"]:
                    notes.append("position '%s' not recognised" % r["position_in"])
                p = players.get(k)
                if p is None:
                    p = {"id": str(uuid.uuid4()), "first": r["first"], "last": r["last"], "number": r["number"], "position": r["position"]}
                    players[k] = p; res["new_players"] += 1; what = "New player"
                    if apply:
                        conn.execute("INSERT INTO players (id, created_at, updated_at, device, deleted, first, last, number, position) VALUES (?,?,?,?,0,?,?,?,?)",
                                     (p["id"], t, t, "Home Base", p["first"], p["last"], p["number"], p["position"]))
                else:
                    ch = {c: r[c] for c in ("number", "position") if r[c] and r[c] != (p.get(c) or "")}
                    if ch:
                        res["updated_players"] += 1; what = "Update: " + ", ".join("%s %s" % (c, v) for c, v in ch.items())
                        if apply:
                            conn.execute("UPDATE players SET %s, updated_at = ?, device = 'Home Base' WHERE id = ?" % ", ".join("%s = ?" % c for c in ch),
                                         list(ch.values()) + [t, p["id"]])
                        p.update(ch)
                    else:
                        res["unchanged"] += 1; what = "Already here"
                if r["team"]:
                    tm = teams.get(r["team"].lower())
                    if tm is None:
                        tm = {"id": str(uuid.uuid4()), "name": r["team"]}
                        teams[r["team"].lower()] = tm; res["new_teams"].append(r["team"])
                        if apply:
                            conn.execute("INSERT INTO teams (id, created_at, updated_at, device, deleted, name, season) VALUES (?,?,?,?,0,?,?)",
                                         (tm["id"], t, t, "Home Base", tm["name"], ""))
                    if (tm["id"], p["id"]) not in roster:
                        roster[(tm["id"], p["id"])] = {}; res["rostered"] += 1; what += "; added to " + tm["name"]
                        if apply:
                            conn.execute("INSERT INTO roster (id, created_at, updated_at, device, deleted, team_id, player_id, number, position) VALUES (?,?,?,?,0,?,?,?,?)",
                                         (str(uuid.uuid4()), t, t, "Home Base", tm["id"], p["id"], p.get("number") or "", p.get("position") or ""))
                res["rows"].append(dict(r, what=what + ("; " + "; ".join(notes) if notes else "")))
    finally:
        conn.close()
    return res


def file_password_card():
    v = file_passwords()
    cur = v.get("current")
    if not cur:
        return """<section class='card terms-card' id='fpw'><h2>Set the club's file password</h2>
      <p>Every sync and setup file is locked with this password, so only your club can open them. Files that aren't locked are refused. Pick a short phrase only your coaches will know (at least 8 characters), and tell it to them yourself, never in the same message as a file.</p>
      <p><label>Password <input type='password' id='fpw-new' autocomplete='new-password' size='28'></label>
         <label>Again <input type='password' id='fpw-again' autocomplete='new-password' size='28'></label>
         <label><input type='checkbox' id='fpw-see'> Show</label></p>
      <button class='btn' id='fpw-save'>Set password</button><div id='fpw-out'></div></section>""" + FPW_JS
    when = (v.get("changed") or "")[:10]
    return ("""<section class='card' id='fpw'><h2>File password</h2>
      <p>Sync and setup files are locked with the club's file password%s. Phones ask for it the first time and can remember it.</p>
      <p><button class='btn alt' id='fpw-show'>Show password</button> <code id='fpw-cur' hidden>%s</code></p>
      <details><summary>Change the password</summary>
      <p><label>New password <input type='password' id='fpw-new' autocomplete='new-password' size='28'></label>
         <label>Again <input type='password' id='fpw-again' autocomplete='new-password' size='28'></label>
         <label><input type='checkbox' id='fpw-see'> Show</label></p>
      <p><label><input type='checkbox' id='fpw-carry' checked> Phones that know the old password can still open the next setup file, and learn the new password from it</label><br>
      <span class='muted'>Untick this if the old password got out: then tell every coach the new one yourself. Files made before the change still open here.</span></p>
      <button class='btn' id='fpw-save'>Change password</button><div id='fpw-out'></div></details></section>""" % (
        (" (changed %s)" % html.escape(when)) if when else "", html.escape(cur))) + FPW_JS


FPW_JS = """<script>(() => {
  const g = id => document.getElementById(id), out = g('fpw-out');
  if (g('fpw-show')) g('fpw-show').onclick = () => { g('fpw-cur').hidden = !g('fpw-cur').hidden; g('fpw-show').textContent = g('fpw-cur').hidden ? 'Show password' : 'Hide password'; };
  g('fpw-see').onchange = e => { for (const id of ['fpw-new', 'fpw-again']) g(id).type = e.target.checked ? 'text' : 'password'; };
  g('fpw-save').onclick = async () => {
    const a = g('fpw-new').value.trim(), b = g('fpw-again').value.trim();
    if (a !== b) { out.innerHTML = "<p class='bad'>The two passwords don't match.</p>"; return; }
    const r = await (await fetch('/api/file-password', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({password: a, carry: g('fpw-carry') ? g('fpw-carry').checked : true})})).json();
    if (!r.ok) { out.innerHTML = "<p class='bad'>" + r.error + "</p>"; return; }
    out.innerHTML = "<p class='ok'>Saved. New setup files use it from now on.</p>"; setTimeout(() => location.reload(), 1500);
  };
})();</script>"""


def dashboard():
    conn = connect()
    counts = [{"table": t, "rows": conn.execute('SELECT COUNT(*) FROM "%s" WHERE deleted = 0' % t).fetchone()[0]} for t in sync_tables(conn)]
    log = [dict(r) for r in conn.execute("SELECT at, device, file, added, updated, skipped FROM _import_log ORDER BY at DESC LIMIT 15")]
    conn.close()
    body = cloud_note() + scrub_note() + file_password_card() + """<section class='card' id='upd'><h2>Home Base updates</h2><p id='upd-msg' class='muted'>Checking for a newer version&hellip;</p>
      <button class='btn alt' id='upd-again'>Check again</button></section>
    <section class='card'><h2>Import a sync file</h2>
      <p>Choose a sync file a coach exported from the Team app. Newer changes win; importing the same file twice changes nothing.</p>
      <input type='file' id='f' accept='.json' multiple> <button class='btn' id='go'>Import</button>
      <button class='btn alt' id='inbox'>Import inbox folder</button>
      <div id='out'></div>
      <p class='muted'>Inbox folder: <code>%s</code></p></section>
    <section class='card'><h2>Import players</h2>
      <p>Load a roster from a spreadsheet saved as CSV, with the columns <b>First Name, Last Name, Number, Position, Team</b>. A Team column puts each player on that team, and creates the team if it's new. Players already here (same first and last name) are updated, never added twice. You see a preview before anything is saved.</p>
      <p><a class='btn alt' href='/api/players-template'>Download blank template</a></p>
      <input type='file' id='pf' accept='.csv,text/csv'> <button class='btn' id='pgo'>Preview</button>
      <div id='pout'></div>
      <p class='muted'>Positions: Setter, Pin, Middle, Right Side, Libero, DS. Age and birth date aren't kept, so leave them out. Then send the setup file to the phones.</p></section>
    <section class='card'><h2>Send to the phones</h2>
      <p>The setup file has teams, coaches, players, rosters, the schedule, set scores and links. Import it on each coach's phone (Team app &rarr; More &rarr; Sync &rarr; Import file).</p>
      <a class='btn' href='/api/export?kind=setup'>Download setup file</a>
      <a class='btn alt' href='/api/export?kind=all'>Download everything</a></section>
    <section class='card'><h2>Club logo</h2>
      <p>Shown in the Team app's header (after each phone imports the next setup file), on these pages, and on emailed stats.</p>
      <div id='logo-now'></div>
      <input type='file' id='logo-file' accept='image/png,image/jpeg'> <button class='btn' id='logo-save'>Use this logo</button>
      <button class='btn alt' id='logo-icon'>Download app icon</button> <button class='btn alt' id='logo-remove'>Remove logo</button>
      <p class='muted'>For the Home Screen icon on phones: download the app icon (three files: icon.png for iPhones, icon-192.png and icon-512.png for Android), upload them to the team folder on GitHub, then re-add the app to each Home Screen.</p>
      <div id='logo-out'></div></section>
    <section class='card'><h2>Recent imports</h2>%s</section>
    <section class='card'><h2>What's in the database</h2>%s<p class='muted'>Database file: <code>%s</code></p></section>
    <section class='card'><h2>Support Volleyball Digrali</h2>
      <p>Volleyball Digrali is free, with no ads. If it helps your club, you can buy the developer a coffee: <a class='btn alt' href='https://ko-fi.com/volleyballdigrali' target='_blank' rel='noopener'>Support on Ko-fi</a></p>
      <p class='muted'>Questions or problems? Email <a href='mailto:volleyballdigrali@gmail.com'>volleyballdigrali@gmail.com</a>. Help is best effort.</p></section>
    <script>
    const pout = document.getElementById('pout');
    const pe = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
    async function players(apply) {
      const f = document.getElementById('pf').files[0];
      if (!f) { pout.innerHTML = "<p class='bad'>Choose a CSV file first.</p>"; return; }
      const r = await (await fetch('/api/players' + (apply ? '?apply=1' : ''), {method:'POST', headers:{'Content-Type':'text/csv'}, body: await f.text()})).json();
      if (!r.ok) { pout.innerHTML = `<p class='bad'>${pe(r.error)}</p>`; return; }
      const sum = `${r.new_players} new, ${r.updated_players} updated, ${r.unchanged} already here` + (r.new_teams.length ? `, new team${r.new_teams.length > 1 ? 's' : ''}: ${pe(r.new_teams.join(', '))}` : '') + (r.skipped ? `, ${r.skipped} skipped` : '');
      if (apply) { pout.innerHTML = `<p class='ok'>Imported: ${sum}. Download the setup file to send them to the phones.</p>`; setTimeout(() => location.reload(), 3000); return; }
      pout.innerHTML = `<p><b>Preview:</b> ${sum}.</p><div class='scroll'><table><tr><th>Line</th><th>Name</th><th>#</th><th>Position</th><th>Team</th><th>What happens</th></tr>` +
        r.rows.map(x => `<tr><td>${x.line}</td><td>${pe(x.first + ' ' + x.last)}</td><td>${pe(x.number)}</td><td>${pe(x.position || x.position_in)}</td><td>${pe(x.team)}</td><td>${pe(x.what)}</td></tr>`).join('') +
        `</table></div>` + (r.new_players + r.updated_players + r.rostered + r.new_teams.length ? `<p><button class='btn' id='papply'>Import these players</button></p>` : `<p class='muted'>Nothing to change.</p>`);
      const b = document.getElementById('papply'); if (b) b.onclick = () => players(true);
    }
    document.getElementById('pgo').onclick = () => players(false);
    const out = document.getElementById('out');
    function show(name, r){ out.insertAdjacentHTML('beforeend', r.ok
      ? `<p class='ok'>${name}: from ${r.from} — ` + Object.entries(r.tables).map(([t,s])=>`${t} +${s.added} / ${s.updated} updated`).filter(x=>!/\\+0 \\/ 0/.test(x)).join(', ') + `</p>` + (r.note ? `<p class='bad'>${r.note}</p>` : '')
      : `<p class='bad'>${name}: ${r.error}</p>`); }
    document.getElementById('go').onclick = async () => {
      const files = document.getElementById('f').files; out.innerHTML = '';
      if (!files.length) { out.innerHTML = "<p class='bad'>Choose a file first.</p>"; return; }
      for (const f of files) {
        const res = await fetch('/api/import', {method:'POST', headers:{'Content-Type':'application/json','X-File-Name':encodeURIComponent(f.name)}, body: await f.text()});
        show(f.name, await res.json());
      }
      setTimeout(()=>location.reload(), 2500);
    };
    const LOGO = %s;
    const lnow = document.getElementById('logo-now'), lout = document.getElementById('logo-out');
    if (LOGO) lnow.innerHTML = `<img src="${LOGO}" alt="" style="height:96px;background:#fff;border:1px solid #d9dbde;border-radius:8px;padding:4px">`;
    else lnow.innerHTML = "<p class='muted'>No logo yet.</p>";
    function loadImg(file) { return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = r.result; }; r.onerror = bad; r.readAsDataURL(file); }); }
    function draw(img, w, h, bg, pad) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
      const s = Math.min((w - 2*pad) / img.width, (h - 2*pad) / img.height); const dw = img.width*s, dh = img.height*s;
      x.drawImage(img, (w-dw)/2, (h-dh)/2, dw, dh); return c; }
    document.getElementById('logo-save').onclick = async () => {
      const f = document.getElementById('logo-file').files[0];
      if (!f) { lout.innerHTML = "<p class='bad'>Choose an image first.</p>"; return; }
      try {
        const img = await loadImg(f), k = Math.min(1, 256 / Math.max(img.width, img.height));
        const data = draw(img, Math.round(img.width*k), Math.round(img.height*k), null, 0).toDataURL('image/png');
        const r = await (await fetch('/api/logo', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({value: data})})).json();
        lout.innerHTML = r.ok ? "<p class='ok'>Logo saved. Download a new setup file and import it on each phone.</p>" : `<p class='bad'>${r.error}</p>`;
        if (r.ok) setTimeout(() => location.reload(), 1500);
      } catch { lout.innerHTML = "<p class='bad'>That file couldn't be read as an image. Use a PNG or JPG.</p>"; }
    };
    document.getElementById('logo-remove').onclick = async () => {
      await fetch('/api/logo', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({value: null})});
      location.reload();
    };
    const checkUpd = async () => {
      const m = document.getElementById('upd-msg');
      m.textContent = 'Checking for a newer version\u2026';
      try {
        const r = await (await fetch('/api/update-check')).json();
        if (!r.ok) { m.textContent = 'You have v' + r.current + '. ' + r.error; return; }
        if (!r.newer) { m.innerHTML = "<span class='ok'>You have the latest version (v" + r.current + ").</span>"; return; }
        m.innerHTML = "<b>Home Base v" + r.latest + " is available</b> (you have v" + r.current + "). Your database and the current program are backed up first. <button class='btn' id='upd-go'>Update now</button>";
        document.getElementById('upd-go').onclick = async () => {
          m.textContent = 'Updating: backing up, installing, restarting\u2026';
          const u = await (await fetch('/api/update', {method: 'POST'})).json();
          if (!u.ok) { m.innerHTML = "<span class='bad'>" + u.error + "</span>"; return; }
          const t0 = Date.now();
          const wait = async () => {
            try { const v = await (await fetch('/api/version', {cache: 'no-store'})).json(); if (v.version === u.version) { location.reload(); return; } } catch (e) {}
            if (Date.now() - t0 > 60000) { m.innerHTML = "Installed v" + u.version + ". If this page doesn't come back, close the Home Base window and double-click <b>start-home-base.bat</b>."; return; }
            setTimeout(wait, 1500);
          };
          setTimeout(wait, 2500);
        };
      } catch (e) { m.textContent = "Couldn't check for updates."; }
    };
    checkUpd();
    document.getElementById('upd-again').onclick = checkUpd;
    document.getElementById('logo-icon').onclick = async () => {
      if (!LOGO) { lout.innerHTML = "<p class='bad'>Save a logo first.</p>"; return; }
      const img = new Image(); img.onload = () => {
        // iPhone uses icon.png (180); Android uses icon-192.png and icon-512.png
        [['icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]].forEach(([n, z], i) => setTimeout(() => {
          const a = document.createElement('a'); a.download = n; a.href = draw(img, z, z, '#ffffff', Math.round(z * 0.08)).toDataURL('image/png'); a.click(); }, i * 400));
        lout.innerHTML = "<p class='ok'>Three icon files downloaded (icon.png, icon-192.png, icon-512.png). Upload all three into the team folder on GitHub. If the browser asks, allow multiple downloads.</p>"; };
      img.src = LOGO;
    };
    document.getElementById('inbox').onclick = async () => {
      out.innerHTML = ''; const r = await (await fetch('/api/inbox', {method:'POST'})).json();
      if (!r.length) out.innerHTML = "<p class='muted'>The inbox folder is empty.</p>";
      for (const [n, x] of r) show(n, x);
      if (r.length) setTimeout(()=>location.reload(), 2500);
    };
    </script>""" % (html.escape(INBOX), table_html(log), table_html(counts), html.escape(DB_PATH), json.dumps(get_logo()))
    return page("Home Base", body, "/")


def report(view, title, note=""):
    conn = connect()
    rows = [dict(r) for r in conn.execute('SELECT * FROM "%s"' % view)]
    conn.close()
    return page(title, "<section class='card'><h2>%s</h2>%s%s</section>" % (html.escape(title), note, table_html(rows)))


def links_page():
    conn = connect()
    rows = [dict(r) for r in conn.execute("SELECT * FROM v_links")]
    conn.close()
    body, grp = "", None
    for r in rows:
        if r["grp"] != grp:
            body += ("</ul>" if grp else "") + "<h2>%s</h2><ul>" % html.escape(r["grp"])
            grp = r["grp"]
        body += "<li><a href='%s' target='_blank' rel='noopener'>%s</a> <span class='muted'>%s</span></li>" % (
            html.escape(r["url"] or "", quote=True), html.escape(r["title"] or ""), html.escape(r["url"] or ""))
    body = (body + "</ul>") if rows else "<p class='muted'>No links yet. Add them on the Team app's Links tab, then sync.</p>"
    return page("Links", "<section class='card'><h2>Links</h2>%s</section>" % body, "/report/links")


# ---------------- reports ----------------
# Every report takes the same filters (team, tournament, date range) from the web address, shows as a page,
# and downloads as a CSV file for Excel when the address ends in &format=csv.

DATE_OK = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DUTY_SHORT = ["Score", "LibTr", "Board", "LJ1A", "LJ1B", "LJ2A", "LJ2B", "LJ3A", "LJ3B", "Swing"]
DUTY_IDS = ["duty-" + re.sub(r"[^a-z0-9]+", "-", n.lower()) for n in DUTY_NAMES]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
STAT_COLS = ["Serves", "Aces", "Out", "Serve %", "Passes", "Avg pass", "Kills", "Atk err", "Attempts", "Hit %",
             "Solo", "Blk ast", "Blocks", "Blk err", "Set ast", "Set err"]


def fmt_date(d, short=False):
    if not d or not DATE_OK.match(str(d)):
        return d or ""
    y, m, dd = str(d).split("-")
    return "%d/%d" % (int(m), int(dd)) if short else "%s %d, %s" % (MONTHS[int(m) - 1], int(dd), y)


def day_name(d):
    try:
        return datetime.date.fromisoformat(d).strftime("%A")
    except (TypeError, ValueError):
        return ""


def num_key(v):
    try:
        return (0, float(v))
    except (TypeError, ValueError):
        return (1, str(v or ""))


def pct(v):
    return "" if v is None else "%d" % round(v)


def hitf(v):
    if v is None:
        return ""
    s = "%.3f" % v
    return s.replace("0.", ".", 1) if abs(v) < 1 else s


def avgf(v):
    return "" if v is None else "%.2f" % v


def halves(v):
    return ("%d" % v) if v == int(v) else ("%.1f" % v)


def tally(acts):
    def c(skill, res=None):
        return sum(1 for a in acts if a["skill"] == skill and (res is None or a["result"] in res))
    serves, good = c("serve"), c("serve", ("ace", "in"))
    ps = []
    for a in acts:
        if a["skill"] == "receive":
            try:
                ps.append(float(a["result"]))
            except (TypeError, ValueError):
                pass
    kills, aerr, ta = c("attack", ("kill",)), c("attack", ("error",)), c("attack")
    solo, bast = c("block", ("solo",)), c("block", ("assist",))
    return {"serves": serves, "aces": c("serve", ("ace",)), "out": c("serve", ("out",)),
            "srv": (100.0 * good / serves) if serves else None,
            "passes": len(ps), "pass": (sum(ps) / len(ps)) if ps else None,
            "kills": kills, "aerr": aerr, "ta": ta, "hit": ((kills - aerr) / ta) if ta else None,
            "solo": solo, "bast": bast, "blocks": solo + 0.5 * bast, "berr": c("block", ("error",)),
            "sast": c("set", ("assist",)), "serr": c("set", ("error",)), "any": len(acts)}


def stat_vals(t):
    return [t["serves"], t["aces"], t["out"], pct(t["srv"]), t["passes"], avgf(t["pass"]), t["kills"], t["aerr"], t["ta"],
            hitf(t["hit"]), t["solo"], t["bast"], halves(t["blocks"]), t["berr"], t["sast"], t["serr"]]


class Filt:
    """The filters shown at the top of every report."""

    def __init__(self, conn, q, need_team=False):
        g = lambda k: (q.get(k, [""])[0] or "").strip()
        self.q = q
        self.team, self.event = g("team"), g("event")
        self.frm = g("from") if DATE_OK.match(g("from")) else ""
        self.to = g("to") if DATE_OK.match(g("to")) else ""
        self.teams = [dict(r) for r in conn.execute(
            "SELECT id, name || CASE WHEN COALESCE(age_group, '') <> '' THEN ' · ' || age_group ELSE '' END AS name FROM teams WHERE deleted = 0 ORDER BY name")]
        if self.team not in {t["id"] for t in self.teams}:
            self.team = ""
        if need_team and not self.team and self.teams:
            r = conn.execute("""SELECT m.team_id FROM matches m JOIN teams t ON t.id = m.team_id AND t.deleted = 0
                                WHERE m.deleted = 0 GROUP BY m.team_id ORDER BY COUNT(*) DESC LIMIT 1""").fetchone()
            self.team = r[0] if r else self.teams[0]["id"]
        self.need_team = need_team
        self.events = [r[0] for r in conn.execute(
            "SELECT DISTINCT event FROM matches WHERE deleted = 0 AND COALESCE(event, '') <> ''" +
            (" AND team_id = ?" if self.team else "") + " ORDER BY event", (self.team,) if self.team else ())]

    def team_name(self):
        return next((t["name"] for t in self.teams if t["id"] == self.team), "")

    def matches(self, conn):
        sql, args = """SELECT m.*, t.name AS team FROM matches m JOIN teams t ON t.id = m.team_id AND t.deleted = 0
                       WHERE m.deleted = 0""", []
        if self.team:
            sql += " AND m.team_id = ?"; args.append(self.team)
        if self.event:
            sql += " AND m.event = ?"; args.append(self.event)
        if self.frm:
            sql += " AND m.date >= ?"; args.append(self.frm)
        if self.to:
            sql += " AND m.date <= ?"; args.append(self.to)
        return [dict(r) for r in conn.execute(sql + " ORDER BY m.date, m.time", args)]

    def label(self):
        bits = [self.team_name() or "All teams"]
        if self.event:
            bits.append(self.event)
        if self.frm or self.to:
            bits.append("%s to %s" % (fmt_date(self.frm) or "start", fmt_date(self.to) or "today"))
        return " · ".join(bits)


def load_actions(conn, match_ids):
    out, ids = [], list(match_ids)
    for i in range(0, len(ids), 400):
        chunk = ids[i:i + 400]
        out += [dict(r) for r in conn.execute("SELECT * FROM actions WHERE deleted = 0 AND match_id IN (%s)" % ",".join("?" * len(chunk)), chunk)]
    return out


def roster_entries(conn, team_id=""):
    sql = """SELECT r.id AS rid, r.team_id, t.name AS team, p.id AS pid, r.number, p.first, p.last,
               COALESCE(NULLIF(r.position, ''), p.position) AS position
             FROM roster r JOIN players p ON p.id = r.player_id AND p.deleted = 0 JOIN teams t ON t.id = r.team_id AND t.deleted = 0
             WHERE r.deleted = 0""" + (" AND r.team_id = ?" if team_id else "")
    rows = [dict(r) for r in conn.execute(sql, (team_id,) if team_id else ())]
    return sorted(rows, key=lambda e: (e["team"], num_key(e["number"]), e["first"] or ""))


def pname(e):
    return ("%s %s" % (e.get("first") or "", e.get("last") or "")).strip() or "(no name)"


def lineup_of(a):
    try:
        v = json.loads(a.get("lineup") or "")
        return [x for x in v if x] if isinstance(v, list) else []
    except (TypeError, ValueError):
        return []


def set_scores(conn, match_ids):
    out = {}
    for mid in match_ids:
        out[mid] = [dict(r) for r in conn.execute("SELECT set_no, us, them FROM sets WHERE deleted = 0 AND match_id = ? ORDER BY CAST(set_no AS INTEGER)", (mid,))]
    return out


def result_of(sets):
    w = sum(1 for s in sets if num_key(s["us"]) > num_key(s["them"]))
    l = sum(1 for s in sets if num_key(s["them"]) > num_key(s["us"]))
    return w, l, ", ".join("%s-%s" % (s["us"], s["them"]) for s in sets)


def esc(v):
    return html.escape("" if v is None else str(v))


def qs(q, **over):
    d = {k: v[0] for k, v in q.items() if v and v[0] and k != "format"}
    d.update({k: v for k, v in over.items() if v is not None})
    return "&".join("%s=%s" % (k, quote(str(v))) for k, v in d.items() if v != "")


def filter_bar(f, path, show=("team", "event", "dates"), hidden=None, extra="", printable=False, copyable=False):
    h = "".join("<input type='hidden' name='%s' value='%s'>" % (esc(k), esc(v)) for k, v in (hidden or {}).items() if v)
    if "team" in show:
        opts = ("" if f.need_team else "<option value=''>All teams</option>") + "".join(
            "<option value='%s'%s>%s</option>" % (esc(t["id"]), " selected" if t["id"] == f.team else "", esc(t["name"])) for t in f.teams)
        h += "<label>Team<select name='team' onchange='this.form.submit()'>%s</select></label>" % opts
    if "event" in show:
        h += "<label>Tournament<select name='event'><option value=''>All</option>%s</select></label>" % "".join(
            "<option%s>%s</option>" % (" selected" if e == f.event else "", esc(e)) for e in f.events)
    if "dates" in show:
        h += "<label>From<input type='date' name='from' value='%s'></label><label>To<input type='date' name='to' value='%s'></label>" % (f.frm, f.to)
    h += extra
    q = qs(f.q)
    btns = "<button class='btn'>Apply</button><a class='btn alt' href='%s%s'>Clear</a>" % (path, ("?" + qs({k: f.q[k] for k in (hidden or {}) if k in f.q})) if hidden else "")
    tools = "<a class='btn alt' href='%s?%s'>Download for Excel</a>" % (path, (q + "&" if q else "") + "format=csv")
    if printable:
        tools += "<button type='button' class='btn alt' onclick='window.print()'>Print</button>"
    if copyable:
        tools += "<button type='button' class='btn alt' id='copy-email'>Copy for email</button><span id='copy-out' class='muted'></span>"
    return "<section class='card filters noprint'><form method='get' action='%s'>%s<span class='fbtns'>%s</span></form><div class='tools'>%s</div></section>" % (path, h, btns, tools)


def table_block(cols, rows, foot=None, cls=""):
    if not rows:
        return "<p class='muted'>Nothing recorded for these filters.</p>"
    def tr(r, tag="td"):
        return "<tr>%s</tr>" % "".join("<%s>%s</%s>" % (tag, v if isinstance(v, Raw) else esc(v), tag) for v in r)
    return "<div class='scroll'><table class='%s'><thead>%s</thead><tbody>%s</tbody>%s</table></div>" % (
        cls, tr(cols, "th"), "".join(tr(r) for r in rows), ("<tfoot>%s</tfoot>" % tr(foot)) if foot else "")


class Raw(str):
    """Already-built HTML for a table cell (a link)."""


def link(href, text):
    return Raw("<a href='%s'>%s</a>" % (esc(href), esc(text)))


def out(path, f, title, parts, csv_tables, note="", **bar):
    """parts: HTML pieces for the page. csv_tables: [(heading, cols, rows, foot)] for the Excel file."""
    if f.q.get("format", [""])[0] == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([title]); w.writerow([f.label()]); w.writerow([])
        for heading, cols, rows, foot in csv_tables:
            if heading:
                w.writerow([heading])
            w.writerow(cols)
            for r in rows + ([foot] if foot else []):
                w.writerow([str(v) if isinstance(v, Raw) else v for v in r])
            w.writerow([])
        name = re.sub(r"[^A-Za-z0-9]+", "-", "%s %s %s" % (title, f.team_name(), datetime.date.today().strftime("%Y%m%d"))).strip("-")
        return ("csv", name + ".csv", buf.getvalue())
    head = "<section class='card'><h2>%s</h2><p class='muted'>%s</p>%s</section>" % (esc(title), esc(f.label()), note)
    return ("html", page(title, filter_bar(f, path, **bar) + head + "".join(parts), path))


def card(h, inner, cls=""):
    return "<section class='card %s'>%s%s</section>" % (cls, ("<h2>%s</h2>" % esc(h)) if h else "", inner)


# Colour levels per team (same presets as the app's levels.js); stored on the team row as JSON.
LEVEL_PRESETS = {"young": {"pass": [1.0, 1.75], "serve": [60, 80], "hit": [-0.05, 0.10]},
                 "intermediate": {"pass": [1.5, 2.0], "serve": [70, 85], "hit": [0, 0.15]},
                 "advanced": {"pass": [1.8, 2.2], "serve": [80, 90], "hit": [0.10, 0.25]}}


def team_cuts(conn, team_id):
    row = conn.execute("SELECT levels FROM teams WHERE id = ?", (team_id,)).fetchone() if team_id else None
    try:
        v = json.loads(row[0]) if row and row[0] else {}
    except (TypeError, ValueError):
        v = {}
    base = LEVEL_PRESETS.get(v.get("preset"), LEVEL_PRESETS["young"])
    if v.get("preset") == "custom":
        def ok(x, d):
            try:
                a, b = float(x[0]), float(x[1])
                return [a, b] if a <= b else d
            except (TypeError, ValueError, IndexError, KeyError):
                return d
        return {k: ok(v.get(k), LEVEL_PRESETS["intermediate"][k]) for k in ("pass", "serve", "hit")}
    return dict(base)


BAND_COL = ("#fde2e2", "#fdebd3", "#dcf2e3")


def gauge_svg(title, value, lo, hi, cuts, fmt, sub):
    W, cx, cy, R, T = 220, 110, 112, 92, 22
    def ang(v):
        return math.pi * (1 - (min(hi, max(lo, v)) - lo) / float(hi - lo))
    def P(r, a):
        return "%.1f %.1f" % (cx + r * math.cos(a), cy - r * math.sin(a))
    def arc(v0, v1, col):
        a0, a1 = ang(v0), ang(v1)
        return "<path d='M%s A%d %d 0 0 1 %s L%s A%d %d 0 0 0 %s Z' fill='%s'/>" % (P(R, a0), R, R, P(R, a1), P(R - T, a1), R - T, R - T, P(R - T, a0), col)
    s = ["<svg viewBox='-22 0 %d 150' class='gauge' role='img' aria-label='%s'>" % (W + 44, esc(title))]
    s.append(arc(lo, cuts[0], "#c3262e") + arc(cuts[0], cuts[1], "#e0a800") + arc(cuts[1], hi, "#1d7a3e"))
    for t in [lo, cuts[0], cuts[1], hi]:
        a = ang(t)
        s.append("<line x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='#5f636a' stroke-width='2'/>" % (cx + (R + 2) * math.cos(a), cy - (R + 2) * math.sin(a), cx + (R + 7) * math.cos(a), cy - (R + 7) * math.sin(a)))
        s.append("<text x='%.1f' y='%.1f' font-size='11' fill='#5f636a' text-anchor='middle'>%s</text>" % (cx + (R + 16) * math.cos(a), cy - (R + 16) * math.sin(a) + 4, esc(fmt(t))))
    if value is not None:
        a = ang(value)
        s.append("<line x1='%d' y1='%d' x2='%.1f' y2='%.1f' stroke='#18191c' stroke-width='4' stroke-linecap='round'/>" % (cx, cy, cx + (R - 6) * math.cos(a), cy - (R - 6) * math.sin(a)))
        s.append("<polygon points='%s %s %s' fill='#18191c'/>" % (P(R - 2, a), P(R - 18, a + 0.07), P(R - 18, a - 0.07)))
    s.append("<circle cx='%d' cy='%d' r='7' fill='#18191c'/><text x='%d' y='%d' font-size='26' font-weight='700' fill='#18191c' text-anchor='middle'>%s</text></svg>" % (
        cx, cy, cx, cy + 26, "–" if value is None else esc(fmt(value))))
    return "<figure class='gauge-box'><figcaption>%s</figcaption>%s<div class='muted'>%s</div></figure>" % (esc(title), "".join(s), esc(sub))


def line_chart(title, labels, values, kind, lo, hi, fmt, ticks=None, cuts=None):
    pts = [(i, v) for i, v in enumerate(values) if v is not None]
    if not pts:
        return "<div class='chart'><h3>%s</h3><p class='muted'>Not enough data yet.</p></div>" % esc(title)
    W, H, L, R, T, B = 640, 210, 46, 36, 18, 38
    n = len(values)
    x = lambda i: L + (W - L - R) * (i / (n - 1) if n > 1 else 0.5)
    y = lambda v: T + (H - T - B) * (1 - (min(max(v, lo), hi) - lo) / float(hi - lo))
    s = ["<svg viewBox='0 0 %d %d' role='img' aria-label='%s'>" % (W, H, esc(title))]
    key = {"srv": "serve", "pass": "pass", "hit": "hit"}.get(kind)
    bands = [] if not (cuts and key) else [(min(lo, cuts[key][0]), cuts[key][0], BAND_COL[0]), (cuts[key][0], cuts[key][1], BAND_COL[1]), (cuts[key][1], max(hi, cuts[key][1]), BAND_COL[2])]
    for a, b, col in bands:
        a, b = max(a, lo), min(b, hi)
        if b > a:
            s.append("<rect x='%d' y='%.1f' width='%d' height='%.1f' fill='%s'/>" % (L, y(b), W - L - R, y(a) - y(b), col))
    for v in ticks or [lo + (hi - lo) * k / 4.0 for k in range(5)]:
        s.append("<line x1='%d' x2='%d' y1='%.1f' y2='%.1f' class='grid'/><text x='%d' y='%.1f' class='ax' text-anchor='end'>%s</text>" % (
            L, W - R, y(v), y(v), L - 6, y(v) + 4, esc(fmt(v))))
    step = max(1, -(-n // 8))
    for i in range(0, n, step):
        s.append("<text x='%.1f' y='%d' class='ax' text-anchor='middle'>%s</text>" % (x(i), H - B + 18, esc(labels[i])))
    d, pen = "", False
    for i, v in enumerate(values):
        if v is None:
            pen = False
            continue
        d += ("L" if pen else "M") + "%.1f %.1f " % (x(i), y(v)); pen = True
    s.append("<path d='%s' class='ln'/>" % d)
    for i, v in pts:
        s.append("<circle cx='%.1f' cy='%.1f' r='4' class='pt'><title>%s: %s</title></circle>" % (x(i), y(v), esc(labels[i]), esc(fmt(v))))
        if n <= 14:
            s.append("<text x='%.1f' y='%.1f' class='val' text-anchor='middle'>%s</text>" % (x(i), y(v) - 9, esc(fmt(v))))
    return "<div class='chart'><h3>%s</h3>%s</svg></div>" % (esc(title), "".join(s))


def hit_range(vals):
    lo = min([-0.2] + vals); hi = max([0.5] + vals)
    lo, hi = math.floor(lo * 10) / 10.0, math.ceil(hi * 10) / 10.0
    step = 0.1 if hi - lo <= 0.8 else 0.2 if hi - lo <= 1.6 else 0.5
    ticks, v = [], lo
    while v <= hi + 1e-9:
        ticks.append(round(v, 2)); v += step
    return lo, hi, ticks


PCT_TICKS, PASS_TICKS = [0, 25, 50, 75, 100], [0, 1, 2, 3]


def kpis(items):
    return "<div class='kpis'>%s</div>" % "".join("<div class='kpi'><b>%s</b><span>%s</span></div>" % (esc(v if v != "" else "–"), esc(k)) for k, v in items)


# ---------- Season stats ----------
def season_report(conn, q):
    f = Filt(conn, q)
    ms = f.matches(conn)
    team_of = {m["id"]: m["team_id"] for m in ms}
    acts = load_actions(conn, team_of)
    by = {}
    for a in acts:
        by.setdefault((team_of.get(a["match_id"]), a["player_id"]), []).append(a)
    ents = roster_entries(conn, f.team)
    many = not f.team
    cols = (["Team"] if many else []) + ["#", "Player"] + STAT_COLS
    rows = [([e["team"]] if many else []) + [e["number"], pname(e)] + stat_vals(tally(by.get((e["team_id"], e["pid"]), []))) for e in ents]
    foot = None
    if not many:
        foot = ["", "Team"] + stat_vals(tally([a for a in acts if a["skill"] != "point"]))
    note = "<p class='muted'>Serve % counts aces and in serves out of all serves. Avg pass is the mean 0&ndash;3 rating. Hit % = (kills &minus; errors) &divide; attempts. Blocks = solo + half of each assist.</p>"
    return out("/report/season", f, "Season stats", [card(None, table_block(cols, rows, foot))], [("", cols, rows, foot)], note)


# ---------- Player cards ----------
def players_report(conn, q):
    f = Filt(conn, q)
    rid = (q.get("p", [""])[0] or "")
    ents = roster_entries(conn, f.team)
    e = next((x for x in roster_entries(conn) if x["rid"] == rid), None)
    if not e:
        ms = f.matches(conn)
        team_of = {m["id"]: m["team_id"] for m in ms}
        acts = load_actions(conn, team_of)
        cols = ["#", "Player", "Team", "Matches", "Serve %", "Avg pass", "Hit %", "Blocks"]
        rows = []
        for x in ents:
            mine = [a for a in acts if a["player_id"] == x["pid"] and team_of.get(a["match_id"]) == x["team_id"]]
            t = tally(mine)
            rows.append([x["number"], link("/report/players?" + qs(q, p=x["rid"]), pname(x)), x["team"],
                         len({a["match_id"] for a in mine}), pct(t["srv"]), avgf(t["pass"]), hitf(t["hit"]), halves(t["blocks"])])
        return out("/report/players", f, "Player cards", [card("Pick a player", table_block(cols, rows))], [("", cols, rows, None)],
                   "<p class='muted'>Click a name to open her card.</p>")
    ms = [m for m in f.matches(conn) if m["team_id"] == e["team_id"]]
    acts = [a for a in load_actions(conn, [m["id"] for m in ms]) if a["player_id"] == e["pid"]]
    by = {}
    for a in acts:
        by.setdefault(a["match_id"], []).append(a)
    played = [m for m in ms if m["id"] in by]
    tot = tally(acts)
    labels = ["%s %s" % (fmt_date(m["date"], True), (m["opponent"] or "")[:10]) for m in played]
    per = [tally(by[m["id"]]) for m in played]
    cols = ["Date", "Opponent", "Tournament"] + STAT_COLS
    rows = [[fmt_date(m["date"]), m["opponent"], m["event"]] + stat_vals(t) for m, t in zip(played, per)]
    foot = ["Total", "%d match%s" % (len(played), "" if len(played) == 1 else "es"), ""] + stat_vals(tot)
    cuts = team_cuts(conn, e["team_id"])
    pfmt = lambda v: ("%.2f" % v).rstrip("0").rstrip(".") or "0"
    gauges = "<div class='gauges'>%s%s</div>" % (
        gauge_svg("Serve %", tot["srv"], 0, 100, cuts["serve"], lambda v: "%d%%" % round(v),
                  ("%d serves · %d aces · %d out" % (tot["serves"], tot["aces"], tot["out"])) if tot["serves"] else "No serves yet"),
        gauge_svg("Serve receive", tot["pass"], 0, 3, cuts["pass"], pfmt,
                  ("average of %d passes (0–3)" % tot["passes"]) if tot["passes"] else "No passes yet"))
    head = card(None, "<div class='pc-head'><span class='pc-num'>%s</span><div><h2>%s</h2><p class='muted'>%s%s</p></div></div>" % (
        esc(e["number"]), esc(pname(e)), esc(e["team"]), (" · " + esc(e["position"])) if e["position"] else "") +
        kpis([("Serve %", pct(tot["srv"])), ("Avg pass", avgf(tot["pass"])), ("Hit %", hitf(tot["hit"])),
              ("Aces", tot["aces"]), ("Kills", tot["kills"]), ("Blocks", halves(tot["blocks"]))]) + gauges +
        "<p class='muted'>Gauge colours follow the team's colour levels (set on the Team app's Team page).</p>")
    hits = [t["hit"] for t in per if t["hit"] is not None]
    charts = card("Match by match", "<div class='charts'>%s%s%s</div>" % (
        line_chart("Serve %", labels, [t["srv"] for t in per], "srv", 0, 100, lambda v: "%d%%" % round(v), PCT_TICKS, cuts),
        line_chart("Average pass (0–3)", labels, [t["pass"] for t in per], "pass", 0, 3, lambda v: "%.1f" % v, PASS_TICKS, cuts),
        line_chart("Hitting %", labels, [t["hit"] for t in per], "hit", *hit_range(hits)[:2], hitf, hit_range(hits)[2], cuts)))
    back = "<p class='noprint'><a href='/report/players?%s'>&lsaquo; All players</a></p>" % qs(q, p="")
    return out("/report/players", f, "Player card: %s" % pname(e), [head, charts, card("Every match", table_block(cols, rows, foot))],
               [("", cols, rows, foot)], back, hidden={"p": rid}, printable=True)


# ---------- Match reports ----------
def match_report(conn, q):
    f = Filt(conn, q)
    mid = q.get("m", [""])[0] or ""
    m = conn.execute("SELECT m.*, t.name AS team FROM matches m LEFT JOIN teams t ON t.id = m.team_id WHERE m.id = ? AND m.deleted = 0", (mid,)).fetchone()
    if not m:
        ms = list(reversed(f.matches(conn)))
        ss = set_scores(conn, [x["id"] for x in ms])
        cols = ["Date", "Team", "Opponent", "Tournament", "Result", "Scores"]
        rows = []
        for x in ms:
            w, l, sc = result_of(ss[x["id"]])
            rows.append([fmt_date(x["date"]), x["team"], link("/report/match?" + qs(q, m=x["id"]), "vs " + (x["opponent"] or "?")),
                         x["event"], ("Won %d-%d" % (w, l) if w > l else "Lost %d-%d" % (w, l) if l > w else "%d-%d" % (w, l)) if (w or l) else "", sc])
        return out("/report/match", f, "Match reports", [card("Pick a match", table_block(cols, rows))], [("", cols, rows, None)],
                   "<p class='muted'>Newest first. Click a match to open its report.</p>")
    m = dict(m)
    sets = set_scores(conn, [mid])[mid]
    w, l, sc = result_of(sets)
    acts = load_actions(conn, [mid])
    ents = [e for e in roster_entries(conn, m["team_id"])]
    by = {}
    for a in acts:
        by.setdefault(a["player_id"], []).append(a)
    cols = ["#", "Player"] + STAT_COLS
    rows = [[e["number"], pname(e)] + stat_vals(tally(by[e["pid"]])) for e in ents if e["pid"] in by and any(a["skill"] != "point" for a in by[e["pid"]])]
    foot = ["", "Team"] + stat_vals(tally([a for a in acts if a["skill"] != "point"]))
    set_cols = ["Set", "Us", "Them"]
    set_rows = [[s["set_no"], s["us"], s["them"]] for s in sets]
    pts = [a for a in acts if a["skill"] == "point"]
    recv = [a for a in pts if a["serving"] == "them"]
    srv = [a for a in pts if a["serving"] == "us"]
    so = sum(1 for a in recv if a["result"] == "us")
    ps = sum(1 for a in srv if a["result"] == "us")
    result = ("Won %d-%d" % (w, l)) if w > l else ("Lost %d-%d" % (w, l)) if l > w else ("%d-%d" % (w, l) if (w or l) else "No set scores yet")
    info = "%s · %s%s%s" % (fmt_date(m["date"]), esc(m["team"]), (" · " + esc(m["event"])) if m["event"] else "", (" · " + esc(m["location"])) if m["location"] else "")
    k = [("Result", result), ("Sets", sc or "–")]
    if pts:
        k += [("Side-out %", pct(100.0 * so / len(recv)) if recv else ""), ("Points on our serve", "%d of %d" % (ps, len(srv)))]
    head = card(None, "<h2>vs %s</h2><p class='muted'>%s</p>%s" % (esc(m["opponent"] or "?"), info, kpis(k)))
    body = [head, card("Set scores", table_block(set_cols, set_rows)), card("Box score", table_block(cols, rows, foot))]
    # email copy: plain tables with inline styles
    st = "border:1px solid #c9d1da;padding:4px 8px"
    def etable(c, r, ft=None):
        return "<table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'><tr>%s</tr>%s</table>" % (
            "".join("<th style='%s;background:#eef2f6'>%s</th>" % (st, esc(x)) for x in c),
            "".join("<tr>%s</tr>" % "".join("<td style='%s'>%s</td>" % (st, esc(v)) for v in rr) for rr in r + ([ft] if ft else [])))
    email = "<p><b>vs %s</b> &ndash; %s<br>%s%s</p>%s<p></p>%s" % (esc(m["opponent"] or "?"), info, esc(result), (" (" + esc(sc) + ")") if sc else "",
                                                             etable(set_cols, set_rows), etable(cols, rows, foot))
    copyjs = """<template id='email'>%s</template><script>
    document.getElementById('copy-email').onclick = async () => {
      const h = document.getElementById('email').innerHTML, o = document.getElementById('copy-out');
      const t = document.createElement('div'); t.innerHTML = h;
      try { await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([h], {type: 'text/html'}), 'text/plain': new Blob([t.innerText], {type: 'text/plain'})})]); o.textContent = ' Copied. Paste it into your email.'; }
      catch (e) { document.body.appendChild(t); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        o.textContent = document.execCommand('copy') ? ' Copied. Paste it into your email.' : " Couldn't copy here."; s.removeAllRanges(); t.remove(); }
    };</script>""" % email
    back = "<p class='noprint'><a href='/report/match?%s'>&lsaquo; All matches</a></p>" % qs(q, m="")
    return out("/report/match", f, "Match report: vs %s, %s" % (m["opponent"] or "?", fmt_date(m["date"])), body + [copyjs],
               [("Set scores", set_cols, set_rows, None), ("Box score", cols, rows, foot)], back,
               hidden={"m": mid}, printable=True, copyable=True)


# ---------- Rotations ----------


def rot_index(a):
    try:
        return int(a["rot_no"] or 0) % 6
    except (TypeError, ValueError):
        return 0


def rotations_report(conn, q):
    f = Filt(conn, q, need_team=True)
    ms = [m for m in f.matches(conn) if m["scoring"] == "points"]
    acts = load_actions(conn, [m["id"] for m in ms])
    full = [a for a in acts if len(lineup_of(a)) == 6]
    skipped = sum(1 for a in acts if a["skill"] == "point" and len(lineup_of(a)) < 6)
    R = [{"pts": [], "recv": [], "srv": []} for _ in range(6)]
    for a in full:
        r = R[rot_index(a)]
        if a["skill"] == "point" and a["serving"] in ("us", "them"):
            r["pts"].append(a)
        elif a["skill"] == "receive":
            r["recv"].append(a)
        elif a["skill"] == "serve":
            r["srv"].append(a)
    cols = ["Rotation", "Rallies", "Won", "Lost", "+/-", "Receiving", "Side outs", "Side-out %",
            "Serving", "Won on serve", "Serve-point %", "Passes", "Avg pass", "Serve %"]
    rows, so_pct = [], []
    def line(label, pts, recv, srv):
        won = sum(1 for a in pts if a["result"] == "us")
        rc = [a for a in pts if a["serving"] == "them"]
        sv = [a for a in pts if a["serving"] == "us"]
        so = sum(1 for a in rc if a["result"] == "us")
        ws = sum(1 for a in sv if a["result"] == "us")
        t = tally(recv + srv)
        sop = (100.0 * so / len(rc)) if rc else None
        return [label, len(pts), won, len(pts) - won, ("%+d" % (2 * won - len(pts))) if pts else "", len(rc), so, pct(sop),
                len(sv), ws, pct((100.0 * ws / len(sv)) if sv else None), t["passes"], avgf(t["pass"]), pct(t["srv"])], sop
    for i, r in enumerate(R):
        row, sop = line("Rotation %d" % (i + 1), r["pts"], r["recv"], r["srv"])
        rows.append(row); so_pct.append(sop)
    foot = line("All", sum((r["pts"] for r in R), []), sum((r["recv"] for r in R), []), sum((r["srv"] for r in R), []))[0]
    if not any(r["pts"] for r in R):
        rows = []
    bars = "".join("<div class='hb'><span>Rotation %d</span><div class='hb-track'><div class='hb-fill %s' style='width:%d%%'></div></div><b>%s</b></div>" % (
        i + 1, "" if v is None else ("red" if v < 40 else "amber" if v < 55 else "green"), 0 if v is None else max(2, round(v)), "–" if v is None else "%d%%" % round(v))
        for i, v in enumerate(so_pct))
    note = ("<p class='muted'>From point-by-point matches tracked with the Court tab. Rotation 1 is each set's starting lineup; "
            "Rotation 2 is after one rotation, and so on. A side out is winning a rally on their serve. "
            "Passes and serve %% are the taps made in that rotation.%s</p>") % (
        (" %d rall%s without a full lineup on the Court tab %s left out." % (skipped, "y" if skipped == 1 else "ies", "was" if skipped == 1 else "were")) if skipped else "")
    parts = [card("Side-out % by rotation", "<div class='hbars'>%s</div>" % bars) if rows else "", card("Every rotation", table_block(cols, rows, foot if rows else None))]
    return out("/report/rotations", f, "Rotations", parts, [("", cols, rows, foot if rows else None)], note, printable=True)


# ---------- Trends ----------
def trends_report(conn, q):
    f = Filt(conn, q, need_team=True)
    ms = f.matches(conn)
    acts = load_actions(conn, [m["id"] for m in ms])
    by = {}
    for a in acts:
        by.setdefault(a["match_id"], []).append(a)
    ms = [m for m in ms if m["id"] in by]
    ss = set_scores(conn, [m["id"] for m in ms])
    labels, srv, pas, hit, so, rows = [], [], [], [], [], []
    for m in ms:
        a = by[m["id"]]
        t = tally([x for x in a if x["skill"] != "point"])
        rc = [x for x in a if x["skill"] == "point" and x["serving"] == "them"]
        sop = (100.0 * sum(1 for x in rc if x["result"] == "us") / len(rc)) if rc else None
        w, l, sc = result_of(ss[m["id"]])
        labels.append("%s %s" % (fmt_date(m["date"], True), (m["opponent"] or "")[:10]))
        srv.append(t["srv"]); pas.append(t["pass"]); hit.append(t["hit"]); so.append(sop)
        rows.append([fmt_date(m["date"]), m["opponent"], m["event"], ("W" if w > l else "L" if l > w else "") + (" %d-%d" % (w, l) if (w or l) else ""),
                     t["serves"], pct(t["srv"]), t["passes"], avgf(t["pass"]), t["ta"], hitf(t["hit"]), len(rc), pct(sop)])
    cols = ["Date", "Opponent", "Tournament", "Result", "Serves", "Serve %", "Passes", "Avg pass", "Attempts", "Hit %", "Receiving", "Side-out %"]
    hs = [v for v in hit if v is not None]
    cuts = team_cuts(conn, f.team)
    charts = "<div class='charts'>%s%s%s%s</div>" % (
        line_chart("Team serve %", labels, srv, "srv", 0, 100, lambda v: "%d%%" % round(v), PCT_TICKS, cuts),
        line_chart("Team average pass (0–3)", labels, pas, "pass", 0, 3, lambda v: "%.1f" % v, PASS_TICKS, cuts),
        line_chart("Team hitting %", labels, hit, "hit", *hit_range(hs)[:2], hitf, hit_range(hs)[2], cuts),
        line_chart("Side-out % (point-by-point matches)", labels, so, "", 0, 100, lambda v: "%d%%" % round(v), PCT_TICKS))
    note = "<p class='muted'>One point per match, oldest on the left. Shading: red, amber and green use the team's colour levels (set on the Team app's Team page), the same as the Board and the gauges.</p>"
    return out("/report/trends", f, "Trends", [card(None, charts), card("Match by match", table_block(cols, rows))], [("", cols, rows, None)], note, printable=True)


# ---------- Playing time ----------
def playing_report(conn, q):
    f = Filt(conn, q)
    ms = f.matches(conn)
    team_of = {m["id"]: m["team_id"] for m in ms}
    acts = load_actions(conn, team_of)
    logs = []
    ids = list(team_of)
    for i in range(0, len(ids), 400):
        ch = ids[i:i + 400]
        logs += [dict(r) for r in conn.execute("SELECT * FROM court_log WHERE deleted = 0 AND match_id IN (%s)" % ",".join("?" * len(ch)), ch)]
    sets, rots, rallies, team_rallies = {}, {}, {}, {}
    for a in [x for x in acts if x["skill"] == "point"] + logs:
        lu = lineup_of(a)
        if not lu:
            continue
        tm, is_rally = team_of.get(a["match_id"]), a.get("skill") == "point"
        if is_rally:
            team_rallies[tm] = team_rallies.get(tm, 0) + 1
        for pid in lu:
            k = (tm, pid)
            sets.setdefault(k, set()).add((a["match_id"], str(a["set_no"])))
            rots.setdefault(k, set()).add((a["match_id"], str(a["set_no"]), str(a["rot_no"])))
            if is_rally:
                rallies[k] = rallies.get(k, 0) + 1
    many = not f.team
    cols = (["Team"] if many else []) + ["#", "Player", "Sets", "Rotations", "Rallies", "% of rallies"]
    rows = []
    for e in roster_entries(conn, f.team):
        k = (e["team_id"], e["pid"])
        tr = team_rallies.get(e["team_id"], 0)
        rows.append(([e["team"]] if many else []) + [e["number"], pname(e), len(sets.get(k, ())), len(rots.get(k, ())), rallies.get(k, 0),
                     pct(100.0 * rallies.get(k, 0) / tr) if tr else ""])
    note = "<p class='muted'>Counted from the Team app's Court tab. Rallies are counted in point-by-point matches; rotations and sets in every match.</p>"
    return out("/report/playing", f, "Playing time", [card(None, table_block(cols, rows))], [("", cols, rows, None)], note)


# ---------- Match results and schedule ----------
def results_report(conn, q):
    f = Filt(conn, q)
    ms = f.matches(conn)
    ss = set_scores(conn, [m["id"] for m in ms])
    cols = ["Team", "Date", "Opponent", "Tournament", "Status", "Sets won", "Sets lost", "Scores"]
    rows = []
    for m in ms:
        w, l, sc = result_of(ss[m["id"]])
        rows.append([m["team"], fmt_date(m["date"]), link("/report/match?" + qs(q, m=m["id"]), m["opponent"] or "?"), m["event"], m["status"], w, l, sc])
    won = sum(1 for r in rows if r[5] > r[6]); lost = sum(1 for r in rows if r[6] > r[5])
    return out("/report/matches", f, "Match results", [card(None, kpis([("Matches won", won), ("Matches lost", lost)]) + table_block(cols, rows))],
               [("", cols, rows, None)], "<p class='muted'>Click an opponent for the full match report.</p>")


def schedule_report(conn, q):
    f = Filt(conn, q)
    cols = ["Team", "Date", "Day", "Time", "Opponent", "Location", "Tournament", "Status"]
    rows = [[m["team"], fmt_date(m["date"]), day_name(m["date"]), m["time"], m["opponent"], m["location"], m["event"], m["status"]] for m in f.matches(conn)]
    return out("/report/schedule", f, "Schedule", [card(None, table_block(cols, rows))], [("", cols, rows, None)])


# ---------- Work ----------
def work_report(conn, q):
    """Laid out like the app's "Who did what": players down the side, one column per time the team worked (newest first)."""
    f = Filt(conn, q, need_team=True)
    sql, args = "SELECT * FROM work_log WHERE deleted = 0 AND COALESCE(session, '') <> '' AND team_id = ?", [f.team]
    if f.frm:
        sql += " AND date >= ?"; args.append(f.frm)
    if f.to:
        sql += " AND date <= ?"; args.append(f.to)
    by = {}
    for w in conn.execute(sql, args):
        by.setdefault(w["session"], []).append(dict(w))
    sess = sorted(by.values(), key=lambda rows: (rows[0]["date"] or "", min(r["created_at"] or "" for r in rows)), reverse=True)

    def code(w):
        if w["status"] == "absent":
            return "Abs"
        if w["status"] == "off" or not w["duty_id"]:
            return "Off"
        return DUTY_SHORT[DUTY_IDS.index(w["duty_id"])] if w["duty_id"] in DUTY_IDS else "?"
    ents = roster_entries(conn, f.team)
    heads = [Raw("%s%s" % (esc(fmt_date(r[0]["date"], True)), ("<br><span class='muted'>%s</span>" % esc((r[0]["label"] or "")[:14])) if r[0]["label"] else ""))
             for r in sess]
    cols = ["#", "Player"] + heads
    rows, crow = [], []
    for e in ents:
        cells = []
        for r in sess:
            w = next((x for x in r if x["player_id"] == e["pid"]), None)
            c = code(w) if w else ""
            cells.append(Raw("<span class='wk %s'>%s</span>" % ({"Off": "off", "Abs": "abs"}.get(c, ""), esc(c))) if c else "")
        rows.append([e["number"], pname(e)] + cells)
        mine = [x for r in sess for x in r if x["player_id"] == e["pid"]]
        worked = [x for x in mine if x["status"] == "worked"]
        crow.append([e["number"], pname(e)] + [sum(1 for x in worked if x["duty_id"] == d) for d in DUTY_IDS] +
                    [sum(1 for x in mine if x["status"] == "off"), sum(1 for x in mine if x["status"] == "absent")])
    ccols = ["#", "Player"] + DUTY_SHORT + ["Off", "Abs"]
    key = ("<p class='muted'><b>Key:</b> " + " · ".join("%s = %s" % (a, b) for a, b in zip(DUTY_SHORT, DUTY_NAMES)) +
           " · Off = sat out this time · Abs = absent</p>")
    csv_cols = ["#", "Player"] + [("%s %s" % (fmt_date(r[0]["date"], True), r[0]["label"] or "")).strip() for r in sess]
    csv_rows = [[r[0], r[1]] + [str(c).split(">")[1].split("<")[0] if c else "" for c in r[2:]] for r in rows]
    parts = [card("Who did what", (table_block(cols, rows, cls="work") if sess else "<p class='muted'>No work recorded for these filters.</p>") + key),
             card("How many times each job", table_block(ccols, crow) if sess else "")]
    return out("/report/work", f, "Work rotation", parts,
               [("Who did what (newest first)", csv_cols, csv_rows, None), ("How many times each job", ccols, crow, None)],
               "<p class='muted'>Recorded on the Team app's Work tab. Newest on the left, the same as in the app.</p>", show=("team", "dates"), printable=True)


# ---------- Scouting ----------
def scouting_report(conn, q):
    f = Filt(conn, q)
    st = q.get("st", [""])[0] or ""
    teams = [dict(r) for r in conn.execute("SELECT id, name FROM scout_teams WHERE deleted = 0 ORDER BY name")]
    if st not in {t["id"] for t in teams}:
        st = ""
    ms = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM scout_matches WHERE deleted = 0")}
    ok = {k for k, m in ms.items() if (not f.frm or (m["date"] or "") >= f.frm) and (not f.to or (m["date"] or "") <= f.to)}
    passes = [dict(r) for r in conn.execute("SELECT * FROM scout_passes WHERE deleted = 0") if r["match_id"] in ok]
    rows = []
    for t in teams:
        if st and t["id"] != st:
            continue
        group = []
        for p in conn.execute("SELECT * FROM scout_players WHERE deleted = 0 AND scout_team_id = ?", (t["id"],)):
            mine = [x for x in passes if x["scout_player_id"] == p["id"]]
            vals = [float(x["rating"]) for x in mine if str(x["rating"]).strip() not in ("", "None")]
            avg = sum(vals) / len(vals) if vals else None
            last = max([ms[x["match_id"]]["date"] or "" for x in mine] or [""])
            group.append((avg is None, avg or 0, num_key(p["number"]),
                          [t["name"], p["number"], p["position"], p["comment"], len(vals), avgf(avg),
                           sum(1 for v in vals if v == 0), sum(1 for v in vals if v == 3), fmt_date(last)]))
        rows += [g[3] for g in sorted(group, key=lambda g: g[:3])]
    cols = ["Team", "#", "Position", "Comment", "Passes", "Avg pass", "0s", "3s", "Last seen"]
    extra = "<label>Scouted team<select name='st'><option value=''>All</option>%s</select></label>" % "".join(
        "<option value='%s'%s>%s</option>" % (esc(t["id"]), " selected" if t["id"] == st else "", esc(t["name"])) for t in teams)
    note = "<p class='muted'>Rated 0&ndash;3 on the Team app's Scout screen. Each team's weakest passers are listed first.</p>"
    return out("/report/scouting", f, "Scouting: other teams' passers", [card(None, table_block(cols, rows))], [("", cols, rows, None)], note,
               show=("dates",), extra=extra, printable=True)


REPORTS = {"/report/season": season_report, "/report/players": players_report, "/report/match": match_report,
           "/report/rotations": rotations_report, "/report/trends": trends_report, "/report/playing": playing_report,
           "/report/matches": results_report, "/report/schedule": schedule_report, "/report/work": work_report,
           "/report/scouting": scouting_report}


def run_report(path, query):
    conn = connect()
    try:
        return REPORTS[path](conn, parse_qs(query))
    finally:
        conn.close()


# ---------------- QR code (built in: no libraries) ----------------
# Byte mode, error correction level M, versions 1-6 (up to 106 characters): plenty for a web address.
QR_M = {1: (10, [(1, 16)]), 2: (16, [(1, 28)]), 3: (26, [(1, 44)]), 4: (18, [(2, 32)]), 5: (24, [(2, 43)]), 6: (16, [(4, 27)])}
QR_ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]}
_EXP, _LOG = [0] * 512, [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x; _LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _gmul(a, b):
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]


def _rs(data, n):
    gen = [1]
    for i in range(n):
        gen = [a ^ b for a, b in zip(gen + [0], [0] + [_gmul(g, _EXP[i]) for g in gen])]
    rem = list(data) + [0] * n
    for i in range(len(data)):
        c = rem[i]
        if c:
            for j in range(1, len(gen)):
                rem[i + j] ^= _gmul(gen[j], c)
    return rem[len(data):]


def qr_matrix(text):
    data = text.encode("utf-8")
    ver = next((v for v in range(1, 7) if len(data) <= sum(c * d for c, d in QR_M[v][1]) - 2), None)
    if ver is None:
        raise ValueError("Address too long for the built-in QR code.")
    ecn, groups = QR_M[ver]
    cap = sum(c * d for c, d in groups)
    bits = [0, 1, 0, 0] + [int(b) for b in format(len(data), "08b")] + [int(b) for byte in data for b in format(byte, "08b")]
    bits += [0] * min(4, cap * 8 - len(bits))
    bits += [0] * (-len(bits) % 8)
    words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]
    while len(words) < cap:
        words.append(pad[(len(words) - len(bits) // 8) % 2])
    blocks, k = [], 0
    for cnt, dlen in groups:
        for _ in range(cnt):
            blocks.append(words[k:k + dlen]); k += dlen
    ecs = [_rs(b, ecn) for b in blocks]
    final = [b[i] for i in range(max(len(b) for b in blocks)) for b in blocks if i < len(b)] + [e[i] for i in range(ecn) for e in ecs]
    stream = [int(b) for w in final for b in format(w, "08b")] + [0] * (0 if ver == 1 else 7)

    n = ver * 4 + 17
    M = [[None] * n for _ in range(n)]

    def finder(r, c):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                rr, cc = r + dr, c + dc
                if 0 <= rr < n and 0 <= cc < n:
                    on = 0 <= dr <= 6 and 0 <= dc <= 6 and (dr in (0, 6) or dc in (0, 6) or (2 <= dr <= 4 and 2 <= dc <= 4))
                    M[rr][cc] = 1 if on else 0
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0)
    for i in range(8, n - 8):
        M[6][i] = M[i][6] = 1 if i % 2 == 0 else 0
    al = QR_ALIGN[ver]
    for r in al:
        for c in al:
            if M[r][c] is None:
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        M[r + dr][c + dc] = 1 if max(abs(dr), abs(dc)) in (0, 2) else 0
    M[4 * ver + 9][8] = 1
    reserved = set()
    for i in range(9):
        reserved.add((8, i)); reserved.add((i, 8))
    for i in range(8):
        reserved.add((8, n - 1 - i)); reserved.add((n - 1 - i, 8))
    func = [[M[r][c] is not None or (r, c) in reserved for c in range(n)] for r in range(n)]
    # data placement (zigzag)
    idx, up, col = 0, True, n - 1
    while col > 0:
        if col == 6:
            col -= 1
        for i in range(n):
            r = n - 1 - i if up else i
            for c in (col, col - 1):
                if not func[r][c]:
                    M[r][c] = stream[idx] if idx < len(stream) else 0
                    idx += 1
        up = not up
        col -= 2

    masks = [lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0, lambda r, c: (r + c) % 3 == 0,
             lambda r, c: (r // 2 + c // 3) % 2 == 0, lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
             lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0, lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0]

    def fmt_bits(mask):
        d = (0b00 << 3) | mask            # level M = 00
        v = d << 10
        for i in range(14, 9, -1):
            if v >> i & 1:
                v ^= 0x537 << (i - 10)
        return ((d << 10) | v) ^ 0x5412

    def build(mask):
        A = [[(M[r][c] ^ 1) if (not func[r][c] and masks[mask](r, c)) else (M[r][c] or 0) for c in range(n)] for r in range(n)]
        f = fmt_bits(mask)
        b = [(f >> i) & 1 for i in range(15)]
        for i in range(6):
            A[i][8] = b[i]
        A[7][8], A[8][8], A[8][7] = b[6], b[7], b[8]
        for i in range(9, 15):
            A[8][14 - i] = b[i]
        for i in range(8):
            A[8][n - 1 - i] = b[i]
        for i in range(8, 15):
            A[n - 15 + i][8] = b[i]
        A[4 * ver + 9][8] = 1
        return A

    def penalty(A):
        p = 0
        for line in A + [list(x) for x in zip(*A)]:
            run = 1
            for i in range(1, n):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    if run >= 5:
                        p += run - 2
                    run = 1
            if run >= 5:
                p += run - 2
            s = "".join(map(str, line))
            p += 40 * (s.count("10111010000") + s.count("00001011101"))
        for r in range(n - 1):
            for c in range(n - 1):
                if A[r][c] == A[r][c + 1] == A[r + 1][c] == A[r + 1][c + 1]:
                    p += 3
        dark = sum(map(sum, A)) * 100 // (n * n)
        p += 10 * (abs(dark - 50) // 5)
        return p

    return min((build(m) for m in range(8)), key=penalty)


def qr_svg(text, scale=8, quiet=4):
    A = qr_matrix(text)
    n = len(A)
    size = (n + 2 * quiet) * scale
    rects = "".join("<rect x='%d' y='%d' width='%d' height='%d'/>" % ((c + quiet) * scale, (r + quiet) * scale, scale, scale)
                    for r in range(n) for c in range(n) if A[r][c])
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 %d %d' width='%d' height='%d' shape-rendering='crispEdges' role='img' aria-label='QR code'>"
            "<rect width='100%%' height='100%%' fill='#fff'/><g fill='#000'>%s</g></svg>" % (size, size, size, size, rects))

# ---------------- self-update and "Add a coach" ----------------
# The published site holds program files only (never data). Home Base checks it for a newer home_base.py.
SITE_URL = "https://volleyballdigrali.github.io/"
APP_URL = SITE_URL + "team/"
UPDATE_URL = os.environ.get("VB_UPDATE_URL") or SITE_URL + "home-base/home_base.py"   # override only for testing
SERVER = None
RESTARTING = False
RESTART_CODE = 3            # start-home-base.bat starts Home Base again when it exits with this code


def ver_tuple(v):
    nums = [int(x) for x in re.findall(r"\d+", str(v or ""))][:3]
    return tuple(nums + [0] * (3 - len(nums)))


def fetch_latest():
    import urllib.request
    req = urllib.request.Request(UPDATE_URL + "?t=%d" % int(datetime.datetime.now().timestamp()), headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=10) as r:
        text = r.read().decode("utf-8")
    m = re.search(r'^VERSION = "([\d.]+)"', text, re.M)
    if not m or "Volleyball Team - Home Base" not in text[:300]:
        raise ValueError("The file on the site doesn't look like Home Base.")
    compile(text, "home_base.py", "exec")          # refuse anything that isn't valid Python
    return m.group(1), text


def check_update():
    try:
        latest, _ = fetch_latest()
        return {"ok": True, "current": VERSION, "latest": latest, "newer": ver_tuple(latest) > ver_tuple(VERSION)}
    except Exception as e:
        return {"ok": False, "current": VERSION, "error": "Couldn't check for updates (%s)." % e.__class__.__name__}


def restart_soon():
    def go():
        global RESTARTING
        RESTARTING = True
        SERVER.shutdown()
        SERVER.server_close()
        if os.environ.get("VB_HOME_BASE_LAUNCHER") == "1":
            return                                   # main() exits with RESTART_CODE; the .bat starts the new version
        import subprocess
        flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
        subprocess.Popen([sys.executable, os.path.abspath(__file__), "--no-browser"], cwd=HERE, creationflags=flags)
        print("Home Base was updated and started in a new window. You can close this one.")
    threading.Timer(1.0, go).start()


def install_update():
    latest, text = fetch_latest()
    if ver_tuple(latest) <= ver_tuple(VERSION):
        return {"ok": False, "error": "You already have the latest version (v%s)." % VERSION}
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    src, out = sqlite3.connect(DB_PATH), sqlite3.connect(os.path.join(BACKUPS, "volleyball-before-v%s-%s.db" % (latest, stamp)))
    with out:
        src.backup(out)
    src.close(); out.close()
    me = os.path.abspath(__file__)
    shutil.copy2(me, os.path.join(BACKUPS, "home_base-v%s.py" % VERSION))
    tmp = me + ".new"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, me)
    restart_soon()
    return {"ok": True, "version": latest}


def coach_page():
    svg = qr_svg(APP_URL, scale=7)
    body = """<section class='card noprint'><h2>Add a coach</h2>
      <p>Everything a new coach needs on one page. <b>Print</b> it as a handout, or show the QR code on your screen.</p>
      <button class='btn' onclick='window.print()'>Print this page</button></section>
    <section class='card coach'>
      <div class='qr'>%s<p class='muted'><code>%s</code></p></div>
      <div><h2>Put the Team app on your phone</h2>
        <ol>
          <li><b>Scan the QR code</b> with your phone's camera and tap the link. (iPhone: it must open in <b>Safari</b>. Android: <b>Chrome</b>.)</li>
          <li><b>Install it.</b> iPhone: tap <b>Share</b> &rarr; <b>Add to Home Screen</b> &rarr; <b>Add</b>. Android: tap <b>&#8942;</b> &rarr; <b>Install app</b>.</li>
          <li><b>Open Team from your Home Screen</b> (always open it that way) and give your phone a name, for example <i>Assistant coach phone</i>.</li>
          <li><b>Load the team:</b> save the setup file your head coach sends you, then in the app go to <b>More &rarr; Sync &rarr; Import file</b> and choose it.</li>
        </ol>
        <p class='muted'>To send your stats back: <b>More &rarr; Sync &rarr; Export</b> and send the file to your head coach.</p></div>
    </section>
    <section class='card noprint'><h2>The setup file</h2>
      <p>Download it and send it to the coach yourself, by email or text. It has the teams, players, rosters, schedule and links.</p>
      <a class='btn' href='/api/export?kind=setup'>Download setup file</a>
      <p class='bad'>It contains players' names and ages: never post it anywhere public, including GitHub.</p></section>""" % (svg, html.escape(APP_URL))
    return page("Add a coach", body, "/coach")


class Handler(BaseHTTPRequestHandler):
    timeout = 30   # drop browser connections that never send a request

    def log_message(self, *a):
        pass

    def send(self, body, ctype="text/html; charset=utf-8", status=200, extra=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        try:
            if u.path == "/":
                return self.send(dashboard())
            if u.path in REPORTS:
                r = run_report(u.path, u.query)
                if r[0] == "csv":   # with a BOM so Excel reads accents and dashes correctly
                    return self.send("\ufeff" + r[2], "text/csv; charset=utf-8", extra={"Content-Disposition": 'attachment; filename="%s"' % r[1]})
                return self.send(r[1])
            if u.path == "/terms":
                return self.send(terms_page())
            if u.path == "/coach":
                return self.send(coach_page())
            if u.path == "/api/update-check":
                return self.send(json.dumps(check_update()), "application/json")
            if u.path == "/api/players-template":
                return self.send("\ufeff" + PLAYER_TEMPLATE, "text/csv; charset=utf-8", extra={"Content-Disposition": 'attachment; filename="players-template.csv"'})
            if u.path == "/api/version":
                return self.send(json.dumps({"version": VERSION}), "application/json")
            if u.path == "/report/sideouts":
                return self.send(report("v_side_outs", "Side outs by match"))
            if u.path == "/report/links":
                return self.send(links_page())
            if u.path == "/api/export":
                kind = "all" if parse_qs(u.query).get("kind", ["setup"])[0] == "all" else "setup"
                try:
                    data = json.dumps(lock_for_send(build_export(kind), kind))   # always locked
                except LockError as e:
                    return self.send(page("File password needed", "<p class='bad'>%s</p><p><a href='/'>Back to the Dashboard</a></p>" % html.escape(LOCK_MESSAGES.get(str(e), str(e)))), status=400)
                name = "vb-%s-HomeBase-%s.json" % ("setup" if kind != "all" else "all", datetime.datetime.now().strftime("%Y%m%d-%H%M"))
                return self.send(data, "application/json", extra={"Content-Disposition": 'attachment; filename="%s"' % name})
            self.send(page("Not found", "<p>Page not found.</p>"), status=404)
        except Exception as e:  # keep the server running
            self.send(page("Error", "<p class='bad'>%s</p>" % html.escape(str(e))), status=500)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/logo":
            n = int(self.headers.get("Content-Length") or 0)
            try:
                v = json.loads(self.rfile.read(n).decode("utf-8")).get("value")
            except ValueError:
                return self.send(json.dumps({"ok": False, "error": "Bad request."}), "application/json", 400)
            if v and (not isinstance(v, str) or not v.startswith("data:image/") or len(v) > 700000):
                return self.send(json.dumps({"ok": False, "error": "Use a PNG or JPG image."}), "application/json", 400)
            set_logo(v)
            return self.send(json.dumps({"ok": True}), "application/json")
        if u.path == "/api/terms":
            agree_terms()
            self.send_response(303)
            self.send_header("Location", self.headers.get("Referer") or "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if u.path == "/api/update":
            try:
                return self.send(json.dumps(install_update()), "application/json")
            except Exception as e:
                return self.send(json.dumps({"ok": False, "error": "Update failed, nothing was changed (%s)." % e}), "application/json")
        if u.path == "/api/players":
            n = int(self.headers.get("Content-Length") or 0)
            if n > 5 * 1024 * 1024:
                return self.send(json.dumps({"ok": False, "error": "File too large."}), "application/json", 413)
            raw = self.rfile.read(n)
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("cp1252", "replace")   # Excel's older "CSV" on Windows
            try:
                res = import_players(text, apply=parse_qs(u.query).get("apply", ["0"])[0] == "1")
            except (csv.Error, sqlite3.Error) as e:
                res = {"ok": False, "error": "Couldn't read that file: %s" % e}
            return self.send(json.dumps(res), "application/json")
        if u.path == "/api/file-password":
            n = int(self.headers.get("Content-Length") or 0)
            try:
                v = json.loads(self.rfile.read(n).decode("utf-8"))
                pw = (v.get("password") or "").strip()
            except (ValueError, AttributeError):
                return self.send(json.dumps({"ok": False, "error": "Bad request."}), "application/json", 400)
            if len(pw) < 8:
                return self.send(json.dumps({"ok": False, "error": "Use at least 8 characters. A short phrase is easiest to remember."}), "application/json")
            set_file_password(pw, carry=v.get("carry", True))
            return self.send(json.dumps({"ok": True}), "application/json")
        if u.path == "/api/scrub-ok":
            scrub_seen()
            return self.send(json.dumps({"ok": True}), "application/json")
        if u.path == "/api/inbox":
            return self.send(json.dumps(import_inbox()), "application/json")
        if u.path == "/api/import":
            n = int(self.headers.get("Content-Length") or 0)
            if n > 200 * 1024 * 1024:
                return self.send(json.dumps({"ok": False, "error": "File too large."}), "application/json", 413)
            raw = self.rfile.read(n)
            label = self.headers.get("X-File-Name") or "upload.json"
            from urllib.parse import unquote
            label = unquote(label)
            res = import_received(raw, label)
            if res.get("ok"):
                save_copy(raw, label)
            return self.send(json.dumps(res), "application/json")
        self.send(json.dumps({"ok": False, "error": "Unknown request"}), "application/json", 404)


def main():
    setup_db()
    r = scrub_once()
    if r:
        print("  One-time clean-up: birth dates and ages removed (%d saved files, %d backups)." % r)
    daily_backup()
    print("Volleyball Home Base v%s" % VERSION)
    print("Database: %s" % DB_PATH)
    for name, res in import_inbox():
        print("  Imported %s: %s" % (name, "OK" if res.get("ok") else res.get("error")))
    try:
        global SERVER
        server = SERVER = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        server.daemon_threads = True
    except OSError:
        print("Port %d is already in use. Home Base may already be running: open http://localhost:%d" % (PORT, PORT))
        return 1
    url = "http://localhost:%d" % PORT
    print("Open %s in your browser. Leave this window open while you use Home Base; close it to stop." % url)
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    if RESTARTING and os.environ.get("VB_HOME_BASE_LAUNCHER") == "1":
        print("Restarting with the new version...")
        return RESTART_CODE
    return 0


if __name__ == "__main__":
    sys.exit(main())
