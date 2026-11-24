// Team, roster and match logic shared by the tabs.

import * as db from "./db.js";
import { numSort } from "./ui.js";

// ---------- teams ----------
export const teams = () => db.all("teams").sort((a, b) => numSort(a.name, b.name));
export function currentTeam() {
  const t = db.get("teams", db.getLocal("current_team"));
  if (t) return t;
  // Nothing chosen yet (e.g. right after importing a setup file): pick the busiest team.
  const size = t => db.where("matches", m => m.team_id === t.id).length * 100 + db.where("roster", r => r.team_id === t.id).length;
  const first = teams().sort((a, b) => size(b) - size(a))[0] || null;
  if (first) db.setLocal("current_team", first.id);
  return first;
}
export const setCurrentTeam = id => db.setLocal("current_team", id);
export const staffFor = teamId => db.where("staff", s => s.team_id === teamId);

// ---------- players ----------
export const fullName = p => `${p?.first || ""} ${p?.last || ""}`.trim() || "(no name)";
// A team's name with its age group, e.g. "13-2 · 13s".
export const teamLabel = t => (t ? t.name + (t.age_group ? " · " + t.age_group : "") : "");
export const clubPlayers = () => db.all("players").sort((a, b) => numSort(a.first, b.first) || numSort(a.last, b.last));

// Roster entries for a team, joined with the player row, sorted by jersey number.
export function rosterFor(teamId) {
  return db.where("roster", r => r.team_id === teamId)
    .map(r => ({ r, p: db.get("players", r.player_id) }))
    .filter(x => x.p)
    .sort((a, b) => numSort(a.r.number, b.r.number) || numSort(a.p.first, b.p.first));
}
export const teamsOfPlayer = pid => db.where("roster", r => r.player_id === pid).map(r => db.get("teams", r.team_id)).filter(Boolean);

export function addToRoster(teamId, player) {
  if (db.where("roster", r => r.team_id === teamId && r.player_id === player.id).length) return null;
  return db.insert("roster", { team_id: teamId, player_id: player.id, number: player.number ?? "", position: player.position ?? "" });
}

// Short labels: "#7 First", adding a last initial when two players share a first name.
export function shortNames(entries) {
  const count = {};
  for (const { p } of entries) { const k = (p.first || "").toLowerCase(); count[k] = (count[k] || 0) + 1; }
  const out = {};
  for (const { p } of entries) out[p.id] = count[(p.first || "").toLowerCase()] > 1 && p.last ? `${p.first} ${p.last[0]}.` : (p.first || p.last || "?");
  return out;
}

// ---------- matches ----------
export const matchesFor = teamId => db.where("matches", m => m.team_id === teamId)
  .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || ""));

export function currentMatch() {
  const m = db.get("matches", db.getLocal("current_match"));
  return m || null;
}
export const setCurrentMatch = id => db.setLocal("current_match", id);
export const curSet = m => Number(m?.cur_set) || 1;

export const setsFor = matchId => db.where("sets", s => s.match_id === matchId).sort((a, b) => a.set_no - b.set_no);
export function setRow(matchId, setNo) { return db.where("sets", s => s.match_id === matchId && Number(s.set_no) === Number(setNo))[0] || null; }
export function saveSetScore(matchId, setNo, us, them) {
  const r = setRow(matchId, setNo);
  return r ? db.update("sets", r.id, { us, them }) : db.insert("sets", { match_id: matchId, set_no: setNo, us, them });
}

// Sets won and lost from saved set scores.
export function matchResult(matchId) {
  let w = 0, l = 0;
  for (const s of setsFor(matchId)) { if (+s.us > +s.them) w++; else if (+s.them > +s.us) l++; }
  return { w, l, text: w || l ? `${w > l ? "Won" : w < l ? "Lost" : "Tied"} ${w}–${l}` : "" };
}

// Running score from point taps (point-by-point matches).
export function liveScore(matchId, setNo) {
  let us = 0, them = 0;
  for (const a of db.where("actions", a => a.match_id === matchId && a.skill === "point" && Number(a.set_no) === Number(setNo)))
    a.result === "us" ? us++ : them++;
  return { us, them };
}

export const actionsFor = (matchId, fn = () => true) => db.where("actions", a => a.match_id === matchId && fn(a));

// Which taps score the rally automatically in point-by-point matches.
// (An assisted block is shared by two players, so tap Point us once for it.)
export function autoPoint(skill, result) {
  if (skill === "serve") return result === "ace" ? "us" : result === "out" ? "them" : null;
  if (skill === "attack") return result === "kill" ? "us" : result === "error" ? "them" : null;
  if (skill === "block") return result === "solo" ? "us" : result === "error" ? "them" : null;
  if (skill === "set") return result === "error" ? "them" : null;
  return null;
}

// Record one tap. `extra` (serving side, lineup snapshot, rotation number) is stored on every row of the tap.
export function record(match, playerId, skill, result, extra = {}) {
  const set_no = curSet(match), tap = extra.tap || db.uuid(), rows = [];
  const pts = match.scoring === "points";
  const score = pts ? liveScore(match.id, set_no) : { us: null, them: null };
  const base = { match_id: match.id, set_no, tap, us: score.us, them: score.them, ...extra, tap };
  if (skill !== "point") rows.push(db.insert("actions", { ...base, player_id: playerId, skill, result }));
  let point = skill === "point" ? result : null;
  if (pts && skill !== "point") point = autoPoint(skill, result);
  if (point && (pts || skill === "point"))
    rows.push(db.insert("actions", { ...base, player_id: skill === "point" ? null : playerId, skill: "point", result: point }));
  if (match.status !== "played" && match.status !== "in progress") db.update("matches", match.id, { status: "in progress" });
  return { rows, point, tap, score: pts ? liveScore(match.id, set_no) : null };
}

// Undo the most recent tap made on this device in this match (all rows of that tap).
export function undoLast(match) {
  const me = db.getLocal("device_name") || db.getLocal("device_id") || "device";
  const mine = actionsFor(match.id, a => a.device === me).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const last = mine[mine.length - 1];
  if (!last) return null;
  const rows = actionsFor(match.id, a => a.tap === last.tap);
  for (const r of rows) db.remove("actions", r.id);
  return rows;
}

// Per-player numbers for a set of actions.
export function tally(actions) {
  const s = { serves: 0, ace: 0, in: 0, out: 0, passes: 0, passPts: 0, p: [0, 0, 0, 0],
              kill: 0, inplay: 0, atkErr: 0, solo: 0, blkAst: 0, blkErr: 0, setAst: 0, setErr: 0 };
  for (const a of actions) {
    if (a.skill === "serve") { s.serves++; if (s[a.result] != null) s[a.result]++; }
    else if (a.skill === "receive") { const v = Number(a.result); if (v >= 0 && v <= 3) { s.passes++; s.passPts += v; s.p[v]++; } }
    else if (a.skill === "attack") { if (a.result === "kill") s.kill++; else if (a.result === "error") s.atkErr++; else s.inplay++; }
    else if (a.skill === "block") { if (a.result === "solo") s.solo++; else if (a.result === "assist") s.blkAst++; else s.blkErr++; }
    else if (a.skill === "set") { if (a.result === "assist") s.setAst++; else s.setErr++; }
  }
  s.srvPct = s.serves ? Math.round(((s.ace + s.in) / s.serves) * 100) : null;
  s.avg = s.passes ? (s.passPts / s.passes).toFixed(2) : null;
  s.ta = s.kill + s.inplay + s.atkErr;
  s.hitPct = s.ta ? ((s.kill - s.atkErr) / s.ta).toFixed(3).replace(/^(-?)0\./, "$1.") : null;
  s.blocks = s.solo + s.blkAst / 2;
  return s;
}

// Team rally numbers from point rows that know who was serving.
export function rallies(actions) {
  const r = { total: 0, won: 0, rec: 0, so: 0, srv: 0, srvWon: 0 };
  for (const a of actions) {
    if (a.skill !== "point") continue;
    r.total++; if (a.result === "us") r.won++;
    if (a.serving === "them") { r.rec++; if (a.result === "us") r.so++; }
    else if (a.serving === "us") { r.srv++; if (a.result === "us") r.srvWon++; }
  }
  r.soPct = r.rec ? Math.round((r.so / r.rec) * 100) : null;
  r.srvPct = r.srv ? Math.round((r.srvWon / r.srv) * 100) : null;
  return r;
}

// Roster helpers for court rules: position and rotation count on this team.
export function rosterRow(teamId, pid) { return db.where("roster", r => r.team_id === teamId && r.player_id === pid)[0] || null; }
export function teamPos(teamId, pid) { return rosterRow(teamId, pid)?.position || db.get("players", pid)?.position || ""; }
export const isLibero = (teamId, pid) => !!pid && teamPos(teamId, pid) === "Libero";

// Club logo: set in Home Base, arrives in the setup file (settings row "club_logo", an image data URL).
export function clubLogo() {
  const r = db.where("settings", x => x.key === "club_logo")[0];
  return r && typeof r.value === "string" && r.value.startsWith("data:image/") ? r.value : null;
}
