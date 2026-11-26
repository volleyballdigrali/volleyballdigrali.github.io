// Court rules: lineup by position, court roles, rotation, substitutions (15 per set unless the team sets 12 or 18; the libero is not counted),
// libero front-row notice, rotation-count-3 and libero-for-Middle prompts, and who is serving.
// The court turns like a lazy Susan at a team dinner: everyone moves one seat, and the libero only ever sits in the back.
//
// The live court for each match and set is kept on this device (the coach running the Court tab).
// Every change is also written to court_log with a snapshot of all six positions, and every rally
// stores the lineup it was played with. Playing time is counted from those snapshots.

import * as db from "./db.js";
import * as model from "./model.js";
import { DEFAULT_ROLES } from "./schema.js";

export const SUB_LIMIT = 15;                 // the usual limit; each team can set its own (Team tab)
export const SUB_CHOICES = [12, 15, 18];
export const subLimit = m => +db.get("teams", m.team_id)?.sub_limit || SUB_LIMIT;
export const FRONT = [4, 3, 2], BACK = [5, 6, 1];
const key = (m, set) => `court:${m.id}:${set ?? model.curSet(m)}`;

function blank() {
  return { lineup: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, roles: { ...DEFAULT_ROLES },
           subs: 0, rot: 0, hist: [], prompts: [], first: null, auto: true, plan: [], libFor: null };
}
// A new set starts with an empty court but keeps the previous set's rotation plan;
// a new match starts with the plan this team used last (most teams use the same plan every match).
const teamPlanKey = m => `plan:${m.team_id}`;
export function state(m, set) {
  const n = set ?? model.curSet(m);
  const s = db.getLocal(key(m, n));
  if (s) return { ...blank(), ...JSON.parse(JSON.stringify(s)) };
  const b = blank(), prev = n > 1 ? db.getLocal(key(m, n - 1)) : null;
  const from = prev ? prev.plan : n === 1 ? db.getLocal(teamPlanKey(m)) : null;
  if (from?.length) b.plan = JSON.parse(JSON.stringify(from));
  return b;
}
export const save = (m, s) => db.setLocal(key(m), s);

export const snapshot = s => [1, 2, 3, 4, 5, 6].map(p => s.lineup[p] || null);
export const onCourt = s => new Set(Object.values(s.lineup).filter(Boolean));
export const full = s => [1, 2, 3, 4, 5, 6].every(p => s.lineup[p]);
export const posOf = (s, pid) => +(Object.keys(s.lineup).find(p => s.lineup[p] === pid) || 0);

// What a box shows under the player: her own position from the roster (court positions themselves carry no role,
// since any player can start anywhere).
export function dispRole(m, s, pos) {
  const pid = s.lineup[pos];
  if (!pid) return "";
  return model.isLibero(m.team_id, pid) ? "Libero" : model.teamPos(m.team_id, pid) || "";
}

function remember(s, tap = null, kind = null) {
  s.hist.push({ lineup: { ...s.lineup }, roles: { ...s.roles }, subs: s.subs, rot: s.rot, libFor: s.libFor, tap, kind });
  if (s.hist.length > 30) s.hist.shift();
}
function log(m, s, event, pos, pid, tap = null) {
  const sc = m.scoring === "points" ? model.liveScore(m.id, model.curSet(m)) : { us: null, them: null };
  db.insert("court_log", { match_id: m.id, set_no: model.curSet(m), player_id: pid || null, court_pos: pos || null, event,
    us: sc.us, them: sc.them, lineup: JSON.stringify(snapshot(s)), rot_no: s.rot, subs: s.subs, tap });
}
const benchLibero = (m, s) => model.rosterFor(m.team_id).map(x => x.p.id).find(id => !onCourt(s).has(id) && model.isLibero(m.team_id, id)) || null;

// ---------- rotation plan ----------
// s.plan = [{ front, back, when }]: `front` plays the front row; `back` ("L" = the libero) replaces her in the back row.
// when = "serve": the back-row player comes in as the spot rotates 2 -> 1, and serves.
// when = "after": the front-row player serves; the back-row player comes in when we lose that serve.
// The front-row player always comes back as the spot rotates 5 -> 4 (the libero must leave the front row).
export const LIB = "L";
export const planOf = s => s.plan || [];
export const pairFor = (s, pid) => planOf(s).find(p => p.front === pid || p.back === pid) || null;

// "#18 Name (DS)" from the team's own roster, for messages.
export function who(m, pid) {
  const entries = model.rosterFor(m.team_id), e = entries.find(x => x.p.id === pid);
  if (!e) return "a player no longer on the roster";
  const pos = model.teamPos(m.team_id, pid);
  return `#${e.r.number ?? ""} ${model.shortNames(entries)[pid]}${pos ? ` (${pos})` : ""}`;
}

// Order matters: the front row (4) is handled first, so a libero who has to leave at 4 is free to come in at 1.
// trigger: "toBack" (spot just reached 1 from 2), "toFront" (just reached 4 from 5), "lostServe" (we lost the serve; spot at 1),
// "after6" (spot just reached 6 and her "after she serves" swap hasn't happened, e.g. in matches scored by set only).
// Changes s in place; returns [{ pos, inPid, outPid, counted }] and notes for anything that couldn't happen. dry = preview only.
function applyPlan(m, s, triggers, tap, dry = false) {
  const swaps = [], notes = [], plan = planOf(s);
  if (!plan.length) return { swaps, notes };
  const isL = pid => model.isLibero(m.team_id, pid);
  for (const [pos, trig] of triggers) {
    const out = s.lineup[pos];
    if (!out) continue;
    let pair = null, inc = null;
    if (trig === "toFront") {
      pair = isL(out) ? plan.find(p => p.back === LIB && p.front === s.libFor) || plan.find(p => p.back === LIB && !onCourt(s).has(p.front))
                      : plan.find(p => p.back === out);
      inc = pair?.front;
    } else {
      pair = plan.find(p => p.front === out && p.when === (trig === "toBack" ? "serve" : "after"));   // "lostServe" or "after6"
      if (pair) inc = pair.back === LIB ? benchLibero(m, s) : pair.back;
      if (pair && pair.back === LIB && !inc) {
        // The libero is already on the court in the back row for someone else: she moves here (e.g. 5 -> 1 to serve)
        // and the player she was covering comes back in where she was. Neither counts as a substitution.
        const lib = [...onCourt(s)].find(isL), from = lib ? posOf(s, lib) : 0, back = s.libFor;
        if (!lib || from === pos) continue;
        if (!BACK.includes(from)) { notes.push(`Planned swap skipped at position ${pos}: the libero ${who(m, lib)} was supposed to come in for ${who(m, out)}, but she is in the front row at position ${from}.`); continue; }
        if (!back || onCourt(s).has(back)) {
          notes.push(`Planned swap skipped at position ${pos}: the libero ${who(m, lib)} was supposed to come in for ${who(m, out)}, but she is already on the court at position ${from}` +
            (back ? ` for ${who(m, back)}, who is also on the court (position ${posOf(s, back)}), so nobody can take the libero's place there.` : `, and the app doesn't know whose place she took there.`));
          continue;
        }
        s.lineup[from] = back; s.lineup[pos] = lib; s.libFor = out;
        if (!dry) { log(m, s, "libero", from, back, tap); log(m, s, "libero", pos, lib, tap); }
        swaps.push({ pos, from, inPid: lib, outPid: out, counted: false, move: true });
        swaps.push({ pos: from, inPid: back, outPid: lib, counted: false, ret: true });
        continue;
      }
    }
    if (!pair || !inc) continue;
    const verb = trig === "toFront" ? "come back in for" : "come in for";
    if (onCourt(s).has(inc)) { notes.push(`Planned swap skipped at position ${pos}: ${who(m, inc)} was supposed to ${verb} ${who(m, out)}, but ${who(m, inc)} is already on the court at position ${posOf(s, inc)}.`); continue; }
    const counted = !isL(inc) && !isL(out);
    if (counted && s.subs >= subLimit(m)) { notes.push(`Planned swap skipped at position ${pos}: ${who(m, inc)} was supposed to ${verb} ${who(m, out)}, but all ${subLimit(m)} substitutions in this set are used.`); continue; }
    s.lineup[pos] = inc;
    if (counted) s.subs++;
    if (isL(inc)) s.libFor = out;
    if (isL(out)) s.libFor = null;
    if (!dry) log(m, s, counted ? "sub" : "libero", pos, inc, tap);
    swaps.push({ pos, inPid: inc, outPid: out, counted });
  }
  return { swaps, notes };
}

// What the next Rotate would do (for the Rotation tab), without changing anything.
export function previewRotate(m, s) {
  const c = JSON.parse(JSON.stringify(s)), L = c.lineup;
  c.lineup = { 1: L[2], 2: L[3], 3: L[4], 4: L[5], 5: L[6], 6: L[1] };
  return applyPlan(m, c, [[4, "toFront"], [1, "toBack"], [6, "after6"]], null, true);
}
function planned(s, pid) { return !!pairFor(s, pid); }
// The planned subs that just happened become their own step, so "Undo" on the popup reverses only them.
function planStep(m, s, triggers, tap) {
  remember(s, tap, "plan");
  const r = applyPlan(m, s, triggers, tap);
  if (!r.swaps.length) s.hist.pop();
  return r;
}
export function savePlan(m, s, plan) { s.plan = plan; save(m, s); db.setLocal(teamPlanKey(m), plan); }

// Libero in the front row: Rotate stays off until she's out.
export function liberoFront(m, s) {
  const p = FRONT.find(pos => model.isLibero(m.team_id, s.lineup[pos]));
  return p ? { pos: p, pid: s.lineup[p] } : null;
}

// Put a bench player at a position. Returns { ok } or { error }.
export function place(m, s, pos, pid) {
  const prev = s.lineup[pos];
  if (prev === pid) return { ok: true };
  const counted = !!prev && !model.isLibero(m.team_id, prev) && !model.isLibero(m.team_id, pid);
  if (counted && s.subs >= subLimit(m))
    return { error: `All ${subLimit(m)} substitutions have been used in set ${model.curSet(m)}. No more substitutions are allowed.` };
  remember(s);
  const from = posOf(s, pid); if (from) s.lineup[from] = null;   // moving within the court
  s.lineup[pos] = pid;
  if (counted) s.subs++;
  if (model.isLibero(m.team_id, pid)) s.libFor = prev || null;          // who the libero is covering (for the plan)
  else if (prev && model.isLibero(m.team_id, prev)) s.libFor = null;
  s.prompts = s.prompts.filter(p => p.pos !== pos);
  log(m, s, prev ? (counted ? "sub" : "libero") : "in", pos, pid);
  save(m, s);
  return { ok: true, counted };
}

export function takeOff(m, s, pos) {
  if (!s.lineup[pos]) return;
  remember(s);
  const pid = s.lineup[pos]; s.lineup[pos] = null;
  s.prompts = s.prompts.filter(p => p.pos !== pos);
  log(m, s, "out", pos, pid);
  save(m, s);
}

// Clockwise: 4->3, 3->2, 2->1, 1->6, 6->5, 5->4. Roles move with their slot.
export function rotate(m, s, tap = null) {
  if (liberoFront(m, s)) return { error: "Rotate is off while the libero is in the front row." };
  remember(s, tap, "rotate");
  const L = s.lineup, R = s.roles;
  s.lineup = { 1: L[2], 2: L[3], 3: L[4], 4: L[5], 5: L[6], 6: L[1] };
  s.roles = { 1: R[2], 2: R[3], 3: R[4], 4: R[5], 5: R[6], 6: R[1] };
  s.rot++;
  log(m, s, "rotate", null, null, tap);
  const plan = planStep(m, s, [[4, "toFront"], [1, "toBack"], [6, "after6"]], tap);
  // Prompts for players who just crossed rows: 2 -> 1 (front to back) and 5 -> 4 (back to front).
  const prompts = [];
  if (s.subs < subLimit(m) || benchLibero(m, s)) {
    for (const [pos, dir] of [[1, "from the front row to the back row"], [4, "from the back row to the front row"]]) {
      const pid = s.lineup[pos];
      if (!pid || model.isLibero(m.team_id, pid) || planned(s, pid)) continue;   // the plan takes care of her
      const rr = model.rosterRow(m.team_id, pid);
      if (pos === 1 && model.teamPos(m.team_id, pid) === "Middle" && benchLibero(m, s)) {
        prompts.unshift({ type: "libero", pos, pid, lib: benchLibero(m, s) });
      } else if (String(rr?.rot || "") === "3" && s.subs < subLimit(m)) prompts.push({ type: "rot3", pos, pid, dir });
    }
  }
  s.prompts = prompts;
  save(m, s);
  return { ok: true, swaps: plan.swaps, notes: plan.notes };
}

// Counterclockwise, one spot back: 1->2, 2->3, 3->4, 4->5, 5->6, 6->1. For fixing a lineup that got ahead;
// no prompts, and allowed even with the libero in the front row (it can move her back out).
export function rotateBack(m, s) {
  // Right after a Rotate that made planned subs, Rotate back undoes both: everyone (subs included) is back
  // exactly where they were, and the subs no longer count.
  const n = s.hist.length, top = s.hist[n - 1], prev = s.hist[n - 2];
  if (top?.kind === "plan" && prev?.kind === "rotate") {
    const h = prev;
    s.hist.length = n - 2;
    Object.assign(s, { lineup: h.lineup, roles: h.roles, subs: h.subs, rot: h.rot, libFor: h.libFor ?? null, prompts: [] });
    log(m, s, "rotate_back", null, null);
    save(m, s);
    return { ok: true, undidSubs: true };
  }
  remember(s);
  const L = s.lineup, R = s.roles;
  s.lineup = { 1: L[6], 2: L[1], 3: L[2], 4: L[3], 5: L[4], 6: L[5] };
  s.roles = { 1: R[6], 2: R[1], 3: R[2], 4: R[3], 5: R[4], 6: R[5] };
  s.rot = s.rot - 1;          // may go below 0, so the wheel colours stay with the players
  s.prompts = [];
  log(m, s, "rotate_back", null, null);
  save(m, s);
  return { ok: true };
}

export function undoLineup(m, s) {
  const h = s.hist.pop();
  if (!h) return false;
  Object.assign(s, { lineup: h.lineup, roles: h.roles, subs: h.subs, rot: h.rot, libFor: h.libFor ?? null, prompts: [] });
  log(m, s, "undo", null, null);
  save(m, s);
  return true;
}

export function dismissPrompt(m, s) { s.prompts.shift(); save(m, s); }

// ---------- serving (point-by-point matches) ----------
export function serving(m, s) {
  const pts = model.actionsFor(m.id, a => a.skill === "point" && Number(a.set_no) === model.curSet(m))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return pts.length ? pts[pts.length - 1].result : s.first;
}

// Record a tap with the court attached. In point-by-point matches with a full lineup:
// winning a rally while receiving is a side out, so the court rotates (when "rotate automatically" is on);
// losing one on our serve checks whether the libero should come in for a Middle at position 1.
// `partner`: a second blocker for a shared block (Assist). Both players get the assist (half a block each),
// the rally is scored for us once, and all of it is one tap, so Undo removes it together.
export function record(m, pid, skill, result, partner = null) {
  const s = state(m);
  const before = m.scoring === "points" ? serving(m, s) : null;
  const extra = p => ({ serving: before, lineup: JSON.stringify(snapshot(s)), rot_no: s.rot, court_pos: p ? posOf(s, p) || null : null });
  let r;
  if (partner) {
    const tap = db.uuid();
    const a = model.record(m, pid, skill, result, { ...extra(pid), tap });
    const b = model.record(m, partner, skill, result, { ...extra(partner), tap });
    const c = m.scoring === "points" ? model.record(m, null, "point", "us", { ...extra(null), tap }) : null;
    r = { rows: [...a.rows, ...b.rows, ...(c ? c.rows : [])], point: c ? "us" : null, tap, score: c ? c.score : b.score };
  } else r = model.record(m, pid, skill, result, extra(pid));
  let rotated = false, swaps = [], notes = [];
  if (r.point && m.scoring === "points") {
    const s2 = state(m);
    if (r.point === "us" && before === "them" && s2.auto && full(s2) && !liberoFront(m, s2)) {
      const rr = rotate(m, s2, r.tap); rotated = !rr.error; swaps = rr.swaps || []; notes = rr.notes || [];
    } else if (r.point === "them" && before === "us" && full(s2)) {
      const pp = planStep(m, s2, [[1, "lostServe"]], r.tap);     // e.g. the libero comes in after the Middle serves
      swaps = pp.swaps; notes = pp.notes;
      if (!swaps.length && !planned(s2, s2.lineup[1]) && model.teamPos(m.team_id, s2.lineup[1]) === "Middle" && benchLibero(m, s2))
        s2.prompts = [{ type: "libero", pos: 1, pid: s2.lineup[1], lib: benchLibero(m, s2) }, ...s2.prompts.filter(p => p.type !== "libero")];
      save(m, s2);
    }
  }
  return { ...r, rotated, swaps, notes, sideOut: r.point === "us" && before === "them" };
}

// Undo the last tap; if that tap rotated the court, rotate it back too.
export function undo(m) {
  const rows = model.undoLast(m);
  if (!rows) return null;
  const s = state(m), tap = rows[0].tap;
  while (s.hist.length && s.hist[s.hist.length - 1].tap && s.hist[s.hist.length - 1].tap === tap) undoLineup(m, s);   // planned subs, then the rotation
  return rows;
}

export const setFirstServe = (m, who) => { const s = state(m); s.first = who; save(m, s); };
export const setAuto = (m, on) => { const s = state(m); s.auto = on; save(m, s); };
export { benchLibero };
