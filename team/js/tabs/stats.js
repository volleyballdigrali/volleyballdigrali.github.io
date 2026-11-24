// Stats: serve & pass, attack, block & set, playing time; by match, set or season. Copy for email and Excel export.

import * as db from "../db.js";
import * as model from "../model.js";
import { $, $$, esc, fmtDate, toast, saveFile, copyTable, today } from "../ui.js";
import { gauge } from "../gauge.js";
import { cutsOf, fmt as lvFmt } from "../levels.js";

let pickMatch = "season", pickSet = "all", view = "serve";
const VIEWS = [["serve", "Serve & pass"], ["attack", "Attack"], ["blockset", "Block & set"], ["time", "Playing time"]];

const parseLineup = a => { try { return a.lineup ? JSON.parse(a.lineup) : null; } catch { return null; } };

// Playing time from rally lineups and court snapshots.
export function playingTime(matchIds, setFilter, roster) {
  const inSet = x => setFilter === "all" || String(x.set_no) === setFilter;
  const pts = db.where("actions", a => matchIds.has(a.match_id) && a.skill === "point" && inSet(a));
  const logs = db.where("court_log", c => matchIds.has(c.match_id) && inSet(c));
  const sets = new Set(), out = {};
  for (const { p } of roster) out[p.id] = { sets: new Set(), rots: new Set(), rallies: 0 };
  let rallies = 0;
  const seen = (pid, a) => { const o = out[pid]; if (!o) return; o.sets.add(`${a.match_id}:${a.set_no}`); o.rots.add(`${a.match_id}:${a.set_no}:${a.rot_no ?? 0}`); };
  for (const a of pts) {
    const L = parseLineup(a); if (!L) continue;
    rallies++; sets.add(`${a.match_id}:${a.set_no}`);
    for (const pid of L) if (pid && out[pid]) { out[pid].rallies++; seen(pid, a); }
  }
  for (const c of logs) { const L = parseLineup(c); if (!L) continue; sets.add(`${c.match_id}:${c.set_no}`); for (const pid of L) if (pid) seen(pid, c); }
  return { rallies, sets: sets.size, per: out };
}

function tables(team, matches) {
  const ids = new Set(pickMatch === "season" ? matches.map(m => m.id) : [pickMatch]);
  const acts = db.where("actions", a => ids.has(a.match_id) && (pickSet === "all" || String(a.set_no) === pickSet));
  const roster = model.rosterFor(team.id);
  const rows = roster.map(({ r, p }) => ({ label: `#${r.number ?? ""} ${model.fullName(p)}`, s: model.tally(acts.filter(a => a.player_id === p.id)), p }));
  const teamS = model.tally(acts.filter(a => roster.some(x => x.p.id === a.player_id)));
  const d = v => (v === null || v === undefined || v === 0 ? "-" : v);
  let head, body, note = "";
  if (view === "serve") {
    head = ["Player", "Serves", "Aces", "In", "Out", "Serve %", "Passes", "Avg pass"];
    const f1 = s => s.serves > 3 && s.out / s.serves > 0.5, f2 = s => s.passes > 3 && s.passPts / s.passes < 1;
    body = [...rows.map(x => [x.label, d(x.s.serves), x.s.serves ? x.s.ace : "-", x.s.serves ? x.s.in : "-", x.s.serves ? x.s.out : "-",
              { v: x.s.srvPct != null ? x.s.srvPct + "%" : "-", flag: f1(x.s) }, d(x.s.passes), { v: x.s.avg ?? "-", flag: f2(x.s) }]),
            ["Team", d(teamS.serves), d(teamS.ace), d(teamS.in), d(teamS.out), teamS.srvPct != null ? teamS.srvPct + "%" : "-", d(teamS.passes), teamS.avg ?? "-"]];
    const r = model.rallies(acts);
    note = (r.rec || r.srv ? `Side outs: ${r.so} of ${r.rec} rallies on their serve (${r.soPct ?? "-"}%). Points on our serve: ${r.srvWon} of ${r.srv} (${r.srvPct ?? "-"}%). ` : "") +
      "Serve % = aces + in out of all serves. Shaded: more than 3 serves and over half out, or more than 3 passes averaging under 1.";
  } else if (view === "attack") {
    head = ["Player", "Kills", "Errors", "Attempts", "Hitting %"];
    body = [...rows.map(x => [x.label, d(x.s.kill), d(x.s.atkErr), d(x.s.ta), x.s.hitPct ?? "-"]),
            ["Team", d(teamS.kill), d(teamS.atkErr), d(teamS.ta), teamS.hitPct ?? "-"]];
    note = "Attempts = kills + in play + errors. Hitting % = (kills − errors) ÷ attempts.";
  } else if (view === "blockset") {
    head = ["Player", "Solo", "Block assist", "Total blocks", "Block errors", "Set assists", "Set errors"];
    body = [...rows.map(x => [x.label, d(x.s.solo), d(x.s.blkAst), d(x.s.blocks), d(x.s.blkErr), d(x.s.setAst), d(x.s.setErr)]),
            ["Team", d(teamS.solo), d(teamS.blkAst), d(teamS.blocks), d(teamS.blkErr), d(teamS.setAst), d(teamS.setErr)]];
    note = "Total blocks = solo + half of each block assist.";
  } else {
    const pt = playingTime(ids, pickSet, roster);
    const vals = rows.map(x => (pt.rallies ? pt.per[x.p.id].rallies : pt.per[x.p.id].rots.size)).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    head = ["Player", "Sets", "Rot.", "Rallies", "% rallies", "Serves"];
    body = rows.map(x => {
      const o = pt.per[x.p.id], v = pt.rallies ? o.rallies : o.rots.size;
      return [x.label, d(o.sets.size), d(o.rots.size), pt.rallies ? d(o.rallies) : "-",
        { v: pt.rallies ? Math.round((o.rallies / pt.rallies) * 100) + "%" : "-", flag: median > 0 && v < median * 0.75 },
        d(x.s.serves)];
    });
    note = pt.sets ? `${pt.sets} set${pt.sets === 1 ? "" : "s"}${pt.rallies ? ` and ${pt.rallies} rallies` : ""} with a lineup on the Court tab. ` +
      "Shaded: well below the team's middle player (under 75%). Rallies are counted in point-by-point matches; rotations in every match."
      : "Playing time is counted from the Court tab. Set the lineup there during matches.";
  }
  return { head, body, note, pids: rows.map(x => x.p.id) };
}

function filterControls(matches) {
  return `<div class="grid2">
        <label class="field">Match<select id="pm"><option value="season">Season (all matches)</option>
          ${matches.map(m => `<option value="${esc(m.id)}"${m.id === pickMatch ? " selected" : ""}>${esc(fmtDate(m.date, { month: "short", day: "numeric" }))} vs ${esc(m.opponent)}</option>`).join("")}</select></label>
        <label class="field">Set<select id="ps"><option value="all">All sets</option>
          ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${String(n) === pickSet ? " selected" : ""}>Set ${n}</option>`).join("")}</select></label>
      </div>`;
}
const statMatches = team => model.matchesFor(team.id).filter(m => model.actionsFor(m.id).length || db.where("court_log", c => c.match_id === m.id).length);

// Player card: her serve % and serve receive on gauges (the team's colour levels), plus her other numbers,
// for the season, one match or one set (the same choice as on Stats).
export function renderCard(main, ctx) {
  const team = model.currentTeam(), pid = db.getLocal("card_player");
  const e = team && model.rosterFor(team.id).find(x => x.p.id === pid);
  if (!e) { ctx.go("stats"); return; }
  const matches = statMatches(team);
  if (pickMatch !== "season" && !matches.some(m => m.id === pickMatch)) pickMatch = "season";
  const ids = new Set(pickMatch === "season" ? matches.map(m => m.id) : [pickMatch]);
  const t = model.tally(db.where("actions", a => ids.has(a.match_id) && a.player_id === pid && (pickSet === "all" || String(a.set_no) === pickSet)));
  const cuts = cutsOf(team), pos = model.isLibero(team.id, pid) ? "Libero" : model.teamPos(team.id, pid);
  const scope = pickMatch === "season" ? "Season" : (() => { const m = db.get("matches", pickMatch); return `${fmtDate(m.date)} vs ${m.opponent}`; })();
  const avg = t.passes ? t.passPts / t.passes : null;
  const box = (k, v) => `<div class="kpi"><b>${esc(v ?? "–")}</b><span>${esc(k)}</span></div>`;
  main.innerHTML = `<section class="card">
      <div class="card-head"><button class="btn small" type="button" id="back">‹ Stats</button><span class="grow"></span><span class="muted small">${esc(scope)}${pickSet === "all" ? "" : " · Set " + esc(pickSet)}</span></div>
      <div class="pc-head"><span class="pc-num">${esc(e.r.number ?? "")}</span><div><h2>${esc(model.fullName(e.p))}</h2><p class="muted" style="margin:0">${esc([team.name, pos].filter(Boolean).join(" · "))}</p></div></div>
      ${filterControls(matches)}
    </section>
    <section class="card">
      <div class="gauges">
        ${gauge({ title: "Serve %", value: t.serves ? t.srvPct : null, min: 0, max: 100, cuts: cuts.serve, fmt: lvFmt.serve,
                  sub: t.serves ? `${t.serves} serve${t.serves === 1 ? "" : "s"} · ${t.ace} ace${t.ace === 1 ? "" : "s"} · ${t.out} out` : "No serves yet" })}
        ${gauge({ title: "Serve receive", value: avg, min: 0, max: 3, cuts: cuts.pass, fmt: v => (+v).toFixed(2).replace(/\.?0+$/, "") || "0",
                  sub: t.passes ? `average of ${t.passes} pass${t.passes === 1 ? "" : "es"} (0–3)` : "No passes yet" })}
      </div>
      <p class="muted small" style="margin:0">The needle points to the exact value. Colours follow ${esc(team.name)}'s colour levels (More → Team).</p>
    </section>
    <section class="card"><h3>Everything else</h3>
      <div class="kpis">${box("Aces", t.ace)}${box("Serves out", t.out)}${box("Kills", t.kill)}${box("Attack errors", t.atkErr)}${box("Hitting %", t.ta ? t.hitPct : "–")}
        ${box("Blocks", t.blocks)}${box("Set assists", t.setAst)}</div>
    </section>`;
  $("#back", main).onclick = () => ctx.go("stats");
  $("#pm", main).onchange = ev => { pickMatch = ev.target.value; ctx.refresh(); };
  $("#ps", main).onchange = ev => { pickSet = ev.target.value; ctx.refresh(); };
}

export function render(main, ctx) {
  const team = model.currentTeam();
  if (!team) { main.innerHTML = `<section class="card"><h2>Stats</h2><p>Create a team first.</p></section>`; return; }
  const matches = statMatches(team);
  if (pickMatch !== "season" && !matches.some(m => m.id === pickMatch)) pickMatch = "season";
  const t = tables(team, matches);
  const cell = c => (c && typeof c === "object" ? c : { v: c, flag: false });
  const matchName = pickMatch === "season" ? "Season" : (() => { const m = db.get("matches", pickMatch); return `${fmtDate(m.date)} vs ${m.opponent}`; })();
  const title = `${team.name} · ${matchName}${pickSet === "all" ? "" : " · Set " + pickSet} · ${VIEWS.find(v => v[0] === view)[1]}`;

  main.innerHTML = `<section class="card">
      <h2>Stats</h2>
      ${filterControls(matches)}
      <div class="seg wrap">${VIEWS.map(([k, l]) => `<button type="button" data-v="${k}" aria-selected="${k === view}">${l}</button>`).join("")}</div>
      <div class="scroll"><table>
        <thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${t.body.map((r, i) => `<tr class="${i === t.body.length - 1 && r[0] === "Team" ? "team" : "tap"}"${t.pids[i] ? ` data-pid="${esc(t.pids[i])}"` : ""}>${r.map(c => { const x = cell(c); return `<td class="${x.flag ? "flag" : ""}">${esc(x.v)}</td>`; }).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="muted small" style="margin:0">Tap a player for her card with serve and serve-receive gauges. ${esc(t.note)}</p>
      <div class="row"><button class="btn" type="button" id="copy">Copy for email</button>
        <button class="btn" type="button" id="csv">Export to Excel</button></div>
    </section>`;

  $("#pm", main).onchange = e => { pickMatch = e.target.value; ctx.refresh(); };
  $("#ps", main).onchange = e => { pickSet = e.target.value; ctx.refresh(); };
  for (const b of $$("[data-v]", main)) b.onclick = () => { view = b.dataset.v; ctx.refresh(); };
  for (const tr of $$("tr[data-pid]", main)) tr.onclick = () => { db.setLocal("card_player", tr.dataset.pid); ctx.go("player"); };

  $("#copy", main).onclick = async () => {
    const td = (v, i, th) => `<${th ? "th" : "td"} style="border:1px solid #c9d1da;padding:4px 10px;text-align:${i ? "center" : "left"}${th ? ";background:#eef2f6" : ""}">${esc(v)}</${th ? "th" : "td"}>`;
    const logo = model.clubLogo();
    const html = `${logo ? `<p><img src="${logo}" alt="" height="48"></p>` : ""}<p><b>${esc(title)}</b></p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><tr>${t.head.map((h, i) => td(h, i, true)).join("")}</tr>` +
      t.body.map(r => `<tr>${r.map((c, i) => td(cell(c).v, i)).join("")}</tr>`).join("") + `</table><p style="font-size:12px;color:#5d6877">${esc(t.note)}</p>`;
    const text = [title, t.head.join("\t"), ...t.body.map(r => r.map(c => cell(c).v).join("\t")), "", t.note].join("\n");
    toast((await copyTable(html, text)) ? "Copied. Paste it into your email." : "Couldn't copy here. Use Export to Excel.");
  };

  $("#csv", main).onclick = () => {
    // Every recorded tap for the chosen match(es) and set, one row each.
    const ids = new Set(pickMatch === "season" ? matches.map(m => m.id) : [pickMatch]);
    const q = v => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const NAMES = { serve: "Serve", receive: "Serve receive", attack: "Attack", block: "Block", set: "Set", point: "Point" };
    const lines = [["Date", "Opponent", "Set", "Number", "First name", "Last name", "Skill", "Result", "Serving", "Score before"].join(",")];
    const acts = db.where("actions", a => ids.has(a.match_id) && (pickSet === "all" || String(a.set_no) === pickSet))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    for (const a of acts) {
      const m = db.get("matches", a.match_id), p = a.player_id ? db.get("players", a.player_id) : null, r = p ? model.rosterRow(team.id, p.id) : null;
      lines.push([m?.date, m?.opponent, a.set_no, r?.number, p?.first, p?.last, NAMES[a.skill] || a.skill, a.result, a.serving || "",
        a.us != null ? `${a.us}-${a.them}` : ""].map(q).join(","));
    }
    const name = `${team.name} stats ${pickMatch === "season" ? "season" : db.get("matches", pickMatch)?.date} ${today()}.csv`.replace(/[\\/:*?"<>|]/g, "-");
    saveFile(name, "﻿" + lines.join("\r\n") + "\r\n", "text/csv");
  };
}
