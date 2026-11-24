// Scouting other teams: two teams by name, players by number only (0-99), optional position and comment,
// serve receive rated 0-3, and a report of each team's passers, weakest first.
// Kept apart from your own teams and stats; it syncs like everything else and stays for the season.

import * as db from "../db.js";
import { POSITIONS } from "../schema.js";
import { bars, legend } from "./board.js";
import { $, $$, esc, sheet, ask, say, toast, fmtDate, today, numSort, copyTable } from "../ui.js";

let view = "track";            // "track" | "report" (for the current scouting match) | "list"
let reportTeam = null;          // a scouted team's season report, from the list
let lastMsg = "", lastCls = "", flash = null;   // confirmation bar and what to light up after a tap

const teams = () => db.all("scout_teams").sort((a, b) => numSort(a.name, b.name));
const playersOf = tid => db.where("scout_players", p => p.scout_team_id === tid).sort((a, b) => numSort(a.number, b.number));
const current = () => db.get("scout_matches", db.getLocal("scout_match"));
const teamName = id => db.get("scout_teams", id)?.name || "Team";

function findOrMakeTeam(name) {
  const t = teams().find(x => x.name.toLowerCase() === name.toLowerCase());
  return t || db.insert("scout_teams", { name, notes: "" });
}

// 0-99 grid of numbers for one team.
async function pickNumbers(team, step) {
  const have = new Map(playersOf(team.id).map(p => [String(p.number), p]));
  const r = await sheet({
    title: `${team.name}: numbers`,
    body: `<p class="muted small" style="margin:0">${step} Tap each number you see on the court or bench. You can add more later.</p>
      <div class="numgrid">${[...Array(100).keys()].map(n => `<button type="button" class="ng${have.has(String(n)) ? " on" : ""}" data-n="${n}">${n}</button>`).join("")}</div>`,
    buttons: [{ label: "Next", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    onOpen: el => { for (const b of $$("[data-n]", el)) b.onclick = () => b.classList.toggle("on"); },
  });
  if (!r.value) return false;
  const want = new Set($$(".ng.on", r.el).map(b => b.dataset.n));
  for (const n of want) if (!have.has(n)) db.insert("scout_players", { scout_team_id: team.id, number: n, position: "", comment: "" });
  let kept = 0;
  for (const [n, p] of have) if (!want.has(n)) {
    if (db.where("scout_passes", x => x.scout_player_id === p.id).length) kept++;
    else db.remove("scout_players", p.id);
  }
  if (kept) toast(`${kept} number${kept > 1 ? "s" : ""} with recorded passes kept.`);
  return true;
}

async function newMatch(ctx) {
  const names = teams().map(t => `<option value="${esc(t.name)}">`).join("");
  const r = await sheet({
    title: "New scouting match",
    body: `<datalist id="st-names">${names}</datalist>
      <label class="field">Team 1<input type="text" id="s1" list="st-names" maxlength="50" autocomplete="off" placeholder="Team name"></label>
      <label class="field">Team 2<input type="text" id="s2" list="st-names" maxlength="50" autocomplete="off" placeholder="Team name"></label>
      <div class="grid2"><label class="field">Date<input type="date" id="sd" value="${today()}"></label>
      <label class="field">Location (optional)<input type="text" id="sl" maxlength="60"></label></div>
      <p class="muted small" style="margin:0">Teams you've scouted before come back with their numbers and notes.</p>`,
    buttons: [{ label: "Next: numbers", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => {
      const a = $("#s1", el).value.trim(), b = $("#s2", el).value.trim();
      return !a || !b ? "Type both team names." : a.toLowerCase() === b.toLowerCase() ? "The two teams need different names." : true;
    },
  });
  if (!r.value) return;
  const t1 = findOrMakeTeam($("#s1", r.el).value.trim()), t2 = findOrMakeTeam($("#s2", r.el).value.trim());
  const m = db.insert("scout_matches", { date: $("#sd", r.el).value || today(), team1_id: t1.id, team2_id: t2.id, location: $("#sl", r.el).value.trim() });
  db.setLocal("scout_match", m.id); db.setLocal("scout_side", 1); db.setLocal("scout_sel", null); lastMsg = ""; lastCls = "";
  if (await pickNumbers(t1, "Step 1 of 2.")) await pickNumbers(t2, "Step 2 of 2.");
  view = "track"; ctx.refresh();
}

async function editPlayer(p, ctx) {
  const n = db.where("scout_passes", x => x.scout_player_id === p.id).length;
  const r = await sheet({
    title: `#${p.number} · ${teamName(p.scout_team_id)}`,
    body: `<label class="field">Position<select id="sp"><option value="">—</option>${POSITIONS.map(x => `<option${x === p.position ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="field">Comment<input type="text" id="sc" value="${esc(p.comment || "")}" maxlength="120" placeholder="e.g. likes to hit line, tips a lot"></label>`,
    buttons: [{ label: "Save", value: "save", cls: "primary" }, ...(n ? [] : [{ label: "Remove number", value: "remove" }]), { label: "Cancel", value: null }],
  });
  if (r.value === "save") { db.update("scout_players", p.id, { position: $("#sp", r.el).value, comment: $("#sc", r.el).value.trim() }); ctx.refresh(); }
  if (r.value === "remove") { db.remove("scout_players", p.id); db.setLocal("scout_sel", null); ctx.refresh(); }
}

async function addNumber(team, ctx) {
  const r = await sheet({ title: `Add a number to ${team.name}`,
    body: `<label class="field">Number<input type="number" id="an" inputmode="numeric" min="0" max="99"></label>`,
    buttons: [{ label: "Add", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => { const v = $("#an", el).value.trim(); return /^\d{1,2}$/.test(v) ? (playersOf(team.id).some(p => String(p.number) === String(+v)) ? "That number is already on the team." : true) : "Use a number from 0 to 99."; } });
  if (!r.value) return;
  const p = db.insert("scout_players", { scout_team_id: team.id, number: String(+$("#an", r.el).value), position: "", comment: "" });
  db.setLocal("scout_sel", p.id); ctx.refresh();
}

// Report rows for a team, from passes in the given matches (or all matches).
function reportRows(team, matchIds = null) {
  return playersOf(team.id).map(p => {
    const ps = db.where("scout_passes", x => x.scout_player_id === p.id && (!matchIds || matchIds.has(x.match_id)));
    if (!ps.length) return null;
    const avg = ps.reduce((s, x) => s + Number(x.rating), 0) / ps.length;
    return { label: `#${p.number}`, sub: [p.position, p.comment].filter(Boolean).join(" · "), value: avg, shown: avg.toFixed(2), fill: avg / 3, count: ps.length, p };
  }).filter(Boolean);
}

function reportHtml(team, matchIds) {
  return `<section class="card"><h3>${esc(team.name)}</h3>${bars(reportRows(team, matchIds), "pass", team.name)}</section>`;
}

async function copyReport(title, teamsList, matchIds) {
  let html = `<p><b>${esc(title)}</b></p>`, text = title + "\n";
  for (const t of teamsList) {
    const rows = reportRows(t, matchIds).sort((a, b) => a.value - b.value);
    html += `<p><b>${esc(t.name)}</b> (weakest passers first)</p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">` +
      `<tr>${["#", "Avg", "Passes", "Position", "Comment"].map(h => `<th style="border:1px solid #c9d1da;padding:4px 10px;background:#eef2f6">${h}</th>`).join("")}</tr>` +
      rows.map(r => `<tr>${[r.p.number, r.shown, r.count, r.p.position || "", r.p.comment || ""].map(v => `<td style="border:1px solid #c9d1da;padding:4px 10px">${esc(v)}</td>`).join("")}</tr>`).join("") + `</table>`;
    text += `\n${t.name} (weakest first)\n#\tAvg\tPasses\tPosition\tComment\n` + rows.map(r => [r.p.number, r.shown, r.count, r.p.position || "", r.p.comment || ""].join("\t")).join("\n") + "\n";
  }
  toast((await copyTable(html, text)) ? "Copied. Paste it into your email." : "Couldn't copy here.");
}

function renderList(main, ctx) {
  const ms = db.all("scout_matches").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const ts = teams();
  main.innerHTML = `<section class="card">
      <div class="card-head"><h2>Scout</h2><span class="grow"></span><button class="btn small primary" type="button" id="new">+ New scouting match</button></div>
      <p class="small" style="margin:0">Watch other teams and rate their passers 0–3 to find who to serve at. Scouting is kept apart from your own team's stats.</p>
    </section>
    <section class="card"><h3>Scouting matches</h3><div class="list">${ms.length ? ms.map(m => `<button type="button" class="item" data-m="${esc(m.id)}">
        <span class="main-txt"><b>${esc(teamName(m.team1_id))} vs ${esc(teamName(m.team2_id))}</b><span class="sub">${esc(fmtDate(m.date))}${m.location ? " · " + esc(m.location) : ""} · ${db.where("scout_passes", x => x.match_id === m.id).length} passes</span></span>
        <span class="chev">›</span></button>`).join("") : `<p class="muted">None yet.</p>`}</div></section>
    <section class="card"><h3>Scouted teams</h3><p class="muted small" style="margin:0">Every pass you've rated for a team this season.</p><div class="list">${ts.length ? ts.map(t => `<button type="button" class="item" data-t="${esc(t.id)}">
        <span class="main-txt"><b>${esc(t.name)}</b><span class="sub">${playersOf(t.id).length} numbers · ${db.where("scout_passes", x => x.scout_team_id === t.id).length} passes</span></span>
        <span class="chev">›</span></button>`).join("") : `<p class="muted">None yet.</p>`}</div></section>
    ${ts.length ? `<section class="card"><button class="btn danger" type="button" id="clear">Clear old scouting</button>
      <p class="muted small" style="margin:0">Removes every scouted team, number, note and pass, on this device and (after the next sync) in Home Base. For the end of the season.</p></section>` : ""}`;
  $("#new", main).onclick = () => newMatch(ctx);
  for (const b of $$("[data-m]", main)) b.onclick = () => { db.setLocal("scout_match", b.dataset.m); view = "track"; lastMsg = ""; lastCls = ""; ctx.refresh(); };
  for (const b of $$("[data-t]", main)) b.onclick = () => { reportTeam = b.dataset.t; view = "team"; ctx.refresh(); };
  $("#clear", main) && ($("#clear", main).onclick = async () => {
    if (!(await ask("Clear all scouting for the season? Every scouted team, number, note and pass is removed. Export a sync file first if Home Base doesn't have it.", "Clear", true))) return;
    for (const t of ["scout_passes", "scout_players", "scout_matches", "scout_teams"]) for (const r of db.all(t)) db.remove(t, r.id);
    db.setLocal("scout_match", null); toast("Scouting cleared."); ctx.refresh();
  });
}

export function render(main, ctx) {
  const m = current();
  if (view === "team") {
    const t = db.get("scout_teams", reportTeam);
    if (!t) { view = "list"; return render(main, ctx); }
    main.innerHTML = `<section class="card"><div class="card-head"><h2>${esc(t.name)}</h2><span class="grow"></span>
        <button class="btn small" type="button" id="back">‹ Scout</button></div>
        <p class="small" style="margin:0">All passes this season, weakest first.</p>
        <div class="row"><button class="btn" type="button" id="copy">Copy for email</button></div></section>
      ${reportHtml(t, null)}<section class="card">${legend("pass")}</section>`;
    $("#back", main).onclick = () => { view = "list"; ctx.refresh(); };
    $("#copy", main).onclick = () => copyReport(`Scouting report: ${t.name}`, [t], null);
    return;
  }
  if (!m || view === "list") { view = "list"; return renderList(main, ctx); }

  const t1 = db.get("scout_teams", m.team1_id), t2 = db.get("scout_teams", m.team2_id);
  const title = `${t1?.name || "Team 1"} vs ${t2?.name || "Team 2"}`;
  const head = `<section class="card">
      <div class="card-head"><h2>Scout</h2><span class="muted small">${esc(fmtDate(m.date))}</span><span class="grow"></span>
        <button class="btn small primary" type="button" id="done">Done</button></div>
      <b>${esc(title)}</b>
      <div class="seg">${[["track", "Track"], ["report", "Report"]].map(([k, l]) => `<button type="button" data-view="${k}" aria-selected="${k === view}">${l}</button>`).join("")}</div>
    </section>`;

  if (view === "report") {
    const ids = new Set([m.id]);
    main.innerHTML = head + reportHtml(t1, ids) + reportHtml(t2, ids) +
      `<section class="card">${legend("pass")}<div class="row"><button class="btn" type="button" id="copy">Copy for email</button></div></section>`;
    $("#copy", main).onclick = () => copyReport(`Scouting report: ${title}, ${fmtDate(m.date)}`, [t1, t2], ids);
  } else {
    const side = db.getLocal("scout_side") === 2 ? 2 : 1, team = side === 1 ? t1 : t2;
    const ps = playersOf(team.id);
    let sel = db.getLocal("scout_sel");
    if (!ps.some(p => p.id === sel)) sel = null;
    const mine = db.where("scout_passes", x => x.match_id === m.id);
    const stat = pid => { const r = mine.filter(x => x.scout_player_id === pid); return r.length ? (r.reduce((s, x) => s + Number(x.rating), 0) / r.length).toFixed(1) : ""; };
    const sp = ps.find(p => p.id === sel);
    const selRows = sp ? mine.filter(x => x.scout_player_id === sp.id) : [];
    main.innerHTML = head + `<section class="card">
        <div class="seg">${[[1, t1], [2, t2]].map(([k, t]) => `<button type="button" data-side="${k}" aria-selected="${k === side}">${esc(t?.name || "Team " + k)}</button>`).join("")}</div>
        <div class="chips scout-chips">${ps.map(p => `<button type="button" class="pchip${p.id === sel ? " sel" : ""}" data-p="${esc(p.id)}">
            <span class="n">${esc(p.number)}</span><span class="nm">${esc(p.position ? p.position.slice(0, 3) : "")}${stat(p.id) ? ` <span class="muted">${stat(p.id)}</span>` : ""}</span></button>`).join("")}
          <button type="button" class="pchip addnum" id="addnum">+ #</button></div>
      </section>
      <section class="card">
        <div class="results">${[["0", "r"], ["1", "o"], ["2", "b"], ["3", "g"]].map(([v, c]) => `<button type="button" class="res ${c}" data-r="${v}">${v}</button>`).join("")}</div>
        <div class="feedback"><div class="confirm${lastCls ? " c-" + lastCls : ""}" id="fb" role="status">${esc(lastMsg)}</div><button type="button" class="btn small" id="undo">↶ Undo last</button></div>
        <div class="row" style="justify-content:space-between">
          <p class="muted small" style="margin:0">${sp ? `#${esc(sp.number)}: ${selRows.length} pass${selRows.length === 1 ? "" : "es"}${selRows.length ? " · avg " + stat(sp.id) : ""}${sp.comment ? " · " + esc(sp.comment) : ""}` : "Tap a number, then the pass rating."}</p>
          ${sp ? `<button type="button" class="btn small" id="notes">✎ Position &amp; notes</button>` : ""}
        </div>
      </section>`;
    for (const b of $$("[data-side]", main)) b.onclick = () => { db.setLocal("scout_side", +b.dataset.side); db.setLocal("scout_sel", null); lastMsg = ""; lastCls = ""; ctx.refresh(); };
    for (const b of $$("[data-p]", main)) b.onclick = () => { db.setLocal("scout_sel", b.dataset.p); ctx.refresh(); };
    $("#addnum", main).onclick = () => addNumber(team, ctx);
    $("#notes", main) && ($("#notes", main).onclick = () => editPlayer(sp, ctx));
    for (const b of $$("[data-r]", main)) b.onclick = () => {
      if (!sp) { toast("Tap a number first."); return; }
      db.insert("scout_passes", { match_id: m.id, scout_team_id: team.id, scout_player_id: sp.id, rating: +b.dataset.r, tap: db.uuid() });
      lastMsg = `✓ #${sp.number} (${team.name}): pass ${b.dataset.r}`; lastCls = b.className.match(/\b([gbor])\b/)?.[1] || "b";
      flash = { r: b.dataset.r, pid: sp.id };
      ctx.refresh();
    };
    $("#undo", main).onclick = () => {
      const me = db.getLocal("device_name") || db.getLocal("device_id");
      const last = mine.filter(x => x.device === me).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).pop();
      if (!last) { toast("Nothing to undo."); return; }
      db.remove("scout_passes", last.id);
      const p = db.get("scout_players", last.scout_player_id);
      lastMsg = `↶ Undid #${p?.number ?? "?"}: ${last.rating}`; lastCls = "u"; flash = { undo: true };
      ctx.refresh();
    };
    if (flash) {
      if (flash.r) $(`[data-r="${flash.r}"]`, main)?.classList.add("flash");
      const c = flash.pid && $(`.pchip[data-p="${CSS.escape(flash.pid)}"]`, main);
      if (c) { c.classList.add("got"); c.insertAdjacentHTML("beforeend", `<span class="got-badge">✓ ${esc(flash.r)}</span>`); }
      $("#fb", main)?.classList.add("pop");
    }
    flash = null;
  }
  for (const b of $$("[data-view]", main)) b.onclick = () => { view = b.dataset.view; ctx.refresh(); };
  $("#done", main).onclick = () => {
    db.setLocal("scout_match", null); db.setLocal("scout_sel", null); lastMsg = ""; lastCls = "";
    view = "list"; toast(`✓ Scouting saved: ${title}`); ctx.refresh();
  };
}
