// Teams, coaches, the club's player list, each team's roster, and CSV import.

import * as db from "../db.js";
import * as model from "../model.js";
import { POSITIONS, STAFF_ROLES, ROT_COUNTS, AGE_GROUPS } from "../schema.js";
import { $, $$, esc, sheet, ask, say, toast } from "../ui.js";
import { levelsField, wireLevels, readLevels } from "../levels.js";
import * as court from "../court.js";

// The team's age group (13s, 17s and so on). Players play in the age group of the team they're on.
const ageField = v => `<label class="field">Age group<select id="t-age"><option value="">Not set</option>${AGE_GROUPS.map(a => `<option${a === v ? " selected" : ""}>${a}</option>`).join("")}</select></label>`;

const posOptions = cur => `<option value="">—</option>` +
  POSITIONS.map(p => `<option${p === cur ? " selected" : ""}>${esc(p)}</option>`).join("");

// ---------- teams ----------
async function newTeam(ctx) {
  const r = await sheet({ title: "New team",
    body: `<label class="field">Team name<input type="text" id="t-name" maxlength="60" placeholder="e.g. 13U Gold"></label>
           <label class="field">Season (optional)<input type="text" id="t-season" maxlength="30" placeholder="e.g. 2026–27"></label>
           ${ageField("")}
           ${levelsField(null)}
           <p class="muted small" style="margin:0">Colour levels set how strict the red, yellow and green are on the gauges and the Board. Pick what suits the team's skill level; you can change it later on More → Team.</p>`,
    onOpen: el => wireLevels(el),
    buttons: [{ label: "Create team", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => (!$("#t-name", el).value.trim() ? "Type the team name." : readLevels(el).error || true) });
  if (!r.value) return;
  const lv = readLevels(r.el);
  const t = db.insert("teams", { name: $("#t-name", r.el).value.trim(), season: $("#t-season", r.el).value.trim(), age_group: $("#t-age", r.el).value, levels: JSON.stringify(lv) });
  model.setCurrentTeam(t.id);
  toast(`Created ${t.name}.`);
  ctx.refresh();
}

function staffRow(teamId, role) { return db.where("staff", s => s.team_id === teamId && s.role === role)[0] || null; }
function saveStaff(teamId, role, first, last) {
  const s = staffRow(teamId, role);
  if (!first && !last) { if (s) db.remove("staff", s.id); return; }
  s ? db.update("staff", s.id, { first, last }) : db.insert("staff", { team_id: teamId, role, first, last });
}

// ---------- players ----------
function playerForm(p = {}, team = null) {
  return `<div class="grid2">
      <label class="field">First name<input type="text" id="p-first" value="${esc(p.first || "")}" maxlength="40" autocomplete="off"></label>
      <label class="field">Last name<input type="text" id="p-last" value="${esc(p.last || "")}" maxlength="40" autocomplete="off"></label>
    </div>
    <div class="grid2">
      <label class="field">Number<input type="text" inputmode="numeric" id="p-num" value="${esc(p.number ?? "")}" maxlength="4"></label>
      <label class="field">Position<select id="p-pos">${posOptions(p.position)}</select></label>
    </div>
    ${team ? `<label class="chk"><input type="checkbox" id="p-add" checked> Add to ${esc(team.name)}</label>` : ""}`;
}
const readPlayer = el => ({
  first: $("#p-first", el).value.trim(), last: $("#p-last", el).value.trim(), number: $("#p-num", el).value.trim(),
  position: $("#p-pos", el).value,
});

async function newPlayer(team, ctx) {
  const r = await sheet({ title: "New player", body: playerForm({}, team),
    buttons: [{ label: "Add player", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => ($("#p-first", el).value.trim() ? true : "Type the player's first name.") });
  if (!r.value) return;
  const p = db.insert("players", readPlayer(r.el));
  if (team && $("#p-add", r.el)?.checked) model.addToRoster(team.id, p);
  toast(`Added ${model.fullName(p)}.`);
  ctx.refresh();
}

async function editPlayer(p, ctx) {
  const teams = model.teamsOfPlayer(p.id).map(t => t.name).join(", ");
  const r = await sheet({ title: model.fullName(p),
    body: playerForm(p) + `<p class="muted small" style="margin:0">Teams: ${esc(teams || "none")}</p>`,
    buttons: [{ label: "Save", value: "save", cls: "primary" }, { label: "Delete player", value: "delete" }, { label: "Cancel", value: null }],
    check: (el, v) => (v === "delete" || $("#p-first", el).value.trim() ? true : "First name can't be blank.") });
  if (r.value === "save") { db.update("players", p.id, readPlayer(r.el)); toast("Player saved."); ctx.refresh(); }
  if (r.value === "delete") {
    if (!(await ask(`Delete ${model.fullName(p)} from the club list and every team? Her recorded stats stay in the database.`, "Delete", true))) return;
    for (const x of db.where("roster", x => x.player_id === p.id)) db.remove("roster", x.id);
    db.remove("players", p.id);
    toast("Player deleted."); ctx.refresh();
  }
}

// ---------- roster ----------
async function editRosterEntry(team, { r, p }, ctx) {
  const res = await sheet({ title: `${model.fullName(p)} on ${team.name}`,
    body: `<div class="grid2">
        <label class="field">Number on this team<input type="text" inputmode="numeric" id="r-num" value="${esc(r.number ?? "")}" maxlength="4"></label>
        <label class="field">Position on this team<select id="r-pos">${posOptions(r.position)}</select></label></div>
      <label class="field">Rotation count<select id="r-rot">${ROT_COUNTS.map(v => `<option value="${v}"${String(r.rot ?? "") === v ? " selected" : ""}>${v ? v + " rotations" : "—"}</option>`).join("")}</select></label>
      <p class="muted small" style="margin:0">With 3, the Court tab asks whether to substitute when she rotates between the front and back rows.</p>`,
    buttons: [{ label: "Save", value: "save", cls: "primary" }, { label: "Remove from team", value: "remove" },
      { label: "Edit player", value: "player" }, { label: "Cancel", value: null }] });
  if (res.value === "save") { db.update("roster", r.id, { number: $("#r-num", res.el).value.trim(), position: $("#r-pos", res.el).value, rot: $("#r-rot", res.el).value }); ctx.refresh(); }
  if (res.value === "remove" && await ask(`Take ${model.fullName(p)} off ${team.name}? She stays in the club list, and her stats are kept.`, "Remove")) {
    db.remove("roster", r.id); toast("Removed from team."); ctx.refresh();
  }
  if (res.value === "player") editPlayer(p, ctx);
}

async function pickPlayers(team, ctx) {
  const on = new Set(model.rosterFor(team.id).map(x => x.p.id));
  const avail = model.clubPlayers().filter(p => !on.has(p.id));
  if (!avail.length) { say("Everyone in the club list is already on this team. Add new players with + New player or Import CSV."); return; }
  const r = await sheet({ title: `Add players to ${team.name}`,
    body: `<div class="pick-list">${avail.map(p => `<label class="chk"><input type="checkbox" value="${esc(p.id)}">
        <span>${esc(model.fullName(p))}${p.number ? ` · #${esc(p.number)}` : ""}${p.position ? ` · ${esc(p.position)}` : ""}</span></label>`).join("")}</div>`,
    buttons: [{ label: "Add selected", value: true, cls: "primary" }, { label: "Cancel", value: null }] });
  if (!r.value) return;
  let n = 0;
  for (const c of $$("input:checked", r.el)) { if (model.addToRoster(team.id, db.get("players", c.value))) n++; }
  toast(`Added ${n} player${n === 1 ? "" : "s"} to ${team.name}.`);
  ctx.refresh();
}

// ---------- CSV import ----------
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const sep = (text.split(/\r?\n/)[0].match(/\t/) ? "\t" : text.split(/\r?\n/)[0].match(/;/) && !text.split(/\r?\n/)[0].match(/,/) ? ";" : ",");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(s => s.trim())).filter(r => r.some(Boolean));
}

const COLS = { first: /first/i, last: /last|surname/i, number: /^(#|no\.?|num|number|jersey)/i, position: /^pos/i,
               team: /team/i };   // any other columns (such as age or birth date) are ignored

export function importPlayers(text, defaultTeam) {
  const rows = parseCSV(text);
  // No header row: first, last, number, position, team. Older files had an age column before team: skip it.
  const oldOrder = rows.some(r => r.length > 5) && rows.every(r => !r[4] || /^\d{1,2}$/.test(r[4]));
  let map = { first: 0, last: 1, number: 2, position: 3, team: oldOrder ? 5 : 4 };
  if (rows.length && rows[0].some(c => /first|last|name|number|jersey|position|team|age/i.test(c))) {
    const h = rows.shift(); map = {};
    for (const [k, re] of Object.entries(COLS)) map[k] = h.findIndex(c => re.test(c));
    if (map.first < 0) map.first = h.findIndex(c => /name/i.test(c));
  }
  const key = (a, b) => `${a}|${b}`.toLowerCase();
  const existing = new Map(model.clubPlayers().map(p => [key(p.first, p.last || ""), p]));
  const teamByName = new Map(model.teams().map(t => [t.name.toLowerCase(), t]));
  const out = { added: 0, already: 0, rostered: 0, newTeams: [], skipped: 0 };
  for (const r of rows) {
    const g = k => (map[k] >= 0 ? (r[map[k]] || "").trim() : "");
    let first = g("first"), last = g("last");
    if (first && !last && map.last < 0 && first.includes(" ")) { const i = first.indexOf(" "); last = first.slice(i + 1).trim(); first = first.slice(0, i); }
    if (!first) { out.skipped++; continue; }
    const pos = POSITIONS.find(p => p.toLowerCase() === g("position").toLowerCase()) || "";
    let p = existing.get(key(first, last));
    if (p) out.already++;
    else {
      p = db.insert("players", { first, last, number: g("number").replace(/^#/, ""), position: pos });
      existing.set(key(first, last), p); out.added++;
    }
    let team = defaultTeam;
    const tn = g("team");
    if (tn) {
      team = teamByName.get(tn.toLowerCase());
      if (!team) { team = db.insert("teams", { name: tn, season: "" }); teamByName.set(tn.toLowerCase(), team); out.newTeams.push(tn); }
    }
    if (team && model.addToRoster(team.id, p)) out.rostered++;
  }
  return out;
}

async function importCSV(file, team, ctx) {
  const res = importPlayers(await file.text(), team);
  say(`Added ${res.added} new player${res.added === 1 ? "" : "s"} to the club list` +
      (res.already ? `; ${res.already} were already there` : "") + `. ` +
      `${res.rostered} added to a team roster.` +
      (res.newTeams.length ? ` New team${res.newTeams.length > 1 ? "s" : ""} created: ${res.newTeams.join(", ")}.` : "") +
      (res.skipped ? ` Skipped ${res.skipped} line${res.skipped > 1 ? "s" : ""} with no name.` : ""));
  ctx.refresh();
}

// ---------- page ----------
export function render(main, ctx) {
  const team = model.currentTeam();
  if (!team) {
    main.innerHTML = `<section class="card"><h2>Welcome</h2>
      <p>Start by creating your team. You can add more teams for the club later.</p>
      <button class="btn primary" type="button" id="new-team">Create a team</button>
      <p class="muted small">Have a roster file already? Create the team, then use <b>Import CSV</b>. A Team column in the file can even create the teams for you.</p>
      <button class="btn" type="button" id="guide">Read the guide</button></section>`;
    $("#new-team", main).onclick = () => newTeam(ctx);
    $("#guide", main).onclick = () => ctx.go("guide");
    return;
  }
  const roster = model.rosterFor(team.id), club = model.clubPlayers(), teams = model.teams();
  main.innerHTML = `
    <section class="card">
      <div class="card-head"><h2>Team</h2><span class="grow"></span><button class="btn small" type="button" id="new-team">+ New team</button></div>
      ${teams.length > 1 ? `<label class="field">Working with<select id="team-pick">${teams.map(t => `<option value="${esc(t.id)}"${t.id === team.id ? " selected" : ""}>${esc(model.teamLabel(t))}</option>`).join("")}</select></label>` : ""}
      <div class="grid2">
        <label class="field">Team name<input type="text" id="t-name" value="${esc(team.name)}" maxlength="60"></label>
        <label class="field">Season<input type="text" id="t-season" value="${esc(team.season || "")}" maxlength="30"></label>
      </div>
      <div class="grid2">${ageField(team.age_group)}
        <label class="field">Substitutions per set<select id="t-subs">${court.SUB_CHOICES.map(n => `<option value="${n}"${n === court.subLimit({ team_id: team.id }) ? " selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <p class="muted small" style="margin:0">Use your league's rule (USA Volleyball: 15). The libero's replacements don't count.</p>
    </section>

    <section class="card" id="levels-card">
      <h2>Colour levels</h2>
      <p class="muted small" style="margin:0">How strict red, yellow and green are for this team on the gauges, the Board and scouting. Pick a level for the team's age and skill, or Custom.</p>
      ${levelsField(team)}
    </section>

    <section class="card">
      <h2>Coaches</h2>
      ${STAFF_ROLES.map((role, i) => { const s = staffRow(team.id, role) || {}; return `
        <div data-role="${esc(role)}" style="display:grid;gap:4px">
          <b class="small muted">${esc(role)}</b>
          <div class="grid2"><input type="text" class="s-first" value="${esc(s.first || "")}" maxlength="40" placeholder="First name" aria-label="${esc(role)} first name">
          <input type="text" class="s-last" value="${esc(s.last || "")}" maxlength="40" placeholder="Last name" aria-label="${esc(role)} last name"></div>
        </div>`; }).join("")}
    </section>

    <section class="card">
      <div class="card-head"><h2>Roster</h2><span class="muted">${roster.length} player${roster.length === 1 ? "" : "s"}</span><span class="grow"></span>
        <button class="btn small primary" type="button" id="pick">+ Add from club list</button></div>
      <div class="list">${roster.length ? roster.map(({ r, p }) => `<button type="button" class="item" data-r="${esc(r.id)}">
          <span class="num">${esc(r.number ?? "")}</span>
          <span class="main-txt"><b>${esc(model.fullName(p))}</b><span class="sub">${esc(r.position || "No position")}${r.rot ? " · rotation count " + esc(r.rot) : ""}</span></span>
          <span class="chev">›</span></button>`).join("")
        : `<p class="muted">No players on ${esc(team.name)} yet. Add them from the club list below, or import a CSV file.</p>`}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Club players</h2><span class="muted">${club.length}</span><span class="grow"></span>
        <button class="btn small" type="button" id="new-player">+ New player</button>
        <label class="btn small" for="csv">Import CSV…</label>
        <input type="file" id="csv" class="sr" accept=".csv,.txt,.tsv,text/csv,text/plain"></div>
      <p class="muted small" style="margin:0">Every player in the club, on any team. CSV columns: First Name, Last Name, Number, Position, Age, Team.</p>
      <div class="list">${club.map(p => { const ts = model.teamsOfPlayer(p.id).map(t => t.name).join(", "); return `
        <button type="button" class="item" data-p="${esc(p.id)}">
          <span class="main-txt"><b>${esc(model.fullName(p))}</b>
          <span class="sub">${[p.number ? "#" + p.number : "", p.position, ts || "no team"].filter(Boolean).map(esc).join(" · ")}</span></span>
          <span class="chev">›</span></button>`; }).join("") || `<p class="muted">No players yet.</p>`}</div>
    </section>`;

  $("#new-team", main).onclick = () => newTeam(ctx);
  const pick = $("#team-pick", main);
  if (pick) pick.onchange = () => { model.setCurrentTeam(pick.value); ctx.refresh(); };
  $("#t-name", main).onchange = e => { const v = e.target.value.trim(); if (v) { db.update("teams", team.id, { name: v }); ctx.refresh(); } else e.target.value = team.name; };
  $("#t-season", main).onchange = e => db.update("teams", team.id, { season: e.target.value.trim() });
  $("#t-age", main).onchange = e => { db.update("teams", team.id, { age_group: e.target.value }); ctx.refresh(); };
  $("#t-subs", main).onchange = e => { db.update("teams", team.id, { sub_limit: +e.target.value }); toast(`Substitutions per set: ${e.target.value}`); };
  wireLevels($("#levels-card", main), v => { db.update("teams", team.id, { levels: JSON.stringify(v) }); toast("Colour levels saved."); });
  for (const row of $$("[data-role]", main)) {
    const save = () => saveStaff(team.id, row.dataset.role, $(".s-first", row).value.trim(), $(".s-last", row).value.trim());
    $(".s-first", row).onchange = save; $(".s-last", row).onchange = save;
  }
  $("#pick", main).onclick = () => pickPlayers(team, ctx);
  for (const b of $$("[data-r]", main)) b.onclick = () => editRosterEntry(team, roster.find(x => x.r.id === b.dataset.r), ctx);
  $("#new-player", main).onclick = () => newPlayer(team, ctx);
  for (const b of $$("[data-p]", main)) b.onclick = () => editPlayer(db.get("players", b.dataset.p), ctx);
  $("#csv", main).onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importCSV(f, team, ctx); };
}
