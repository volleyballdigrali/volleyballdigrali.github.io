// Serve, Receive and Attack / Block / Set tracking tabs.

import * as db from "../db.js";
import * as model from "../model.js";
import * as court from "../court.js";
import { renderBar, chooseScoring } from "../match.js";
import { showSwaps } from "../planui.js";
import { $, $$, esc, toast, ask } from "../ui.js";

const BUTTONS = {
  serve:   [["ace", "Ace", "g"], ["in", "In", "b"], ["out", "Out", "o"]],
  receive: [["0", "0", "r"], ["1", "1", "o"], ["2", "2", "b"], ["3", "3", "g"]],
  attack:  [["kill", "Kill", "g"], ["in play", "In play", "b"], ["error", "Error", "r"]],
  block:   [["solo", "Solo", "g"], ["assist", "Assist", "b"], ["error", "Error", "r"]],
  set:     [["assist", "Assist", "g"], ["error", "Error", "r"]],
};
const TITLE = { serve: "Serve", receive: "Serve receive", attack: "Attack", block: "Block", set: "Set" };
function words(skill, r) {
  r = String(r).toLowerCase();
  if (skill === "receive") return `Pass ${r}`;
  if (skill === "serve") return r === "ace" ? "Ace" : r === "in" ? "Serve in" : "Serve out";
  return `${TITLE[skill]} ${r}`;
}
let lastMsg = "", lastCls = "";   // the confirmation bar (stays until the next tap)
let flash = null;                  // what to light up right after a tap: { skill, r, pids, badge }
let atkSkill = "attack";
const SHORT = { ace: "Ace", in: "In", out: "Out", kill: "Kill", "in play": "In play", error: "Err", solo: "Solo", assist: "Ast" };

function summary(skill, m, pid, pid2, names) {
  if (!pid) return skill === "block" ? "Tap the blocker, or two players for a shared block, then the result." : "Tap a player, then a result.";
  if (pid2) return `Shared block: ${names[pid]} + ${names[pid2]}. Tap Assist (half a block each). Tap a player again to unselect her.`;
  const s = model.tally(model.actionsFor(m.id, a => a.player_id === pid));
  switch (skill) {
    case "serve": return s.serves ? `This match: ${s.serves} serve${s.serves > 1 ? "s" : ""} · ${s.ace} ace${s.ace === 1 ? "" : "s"} · ${s.out} out · ${s.srvPct}% in` : "No serves yet this match.";
    case "receive": return s.passes ? `This match: ${s.passes} pass${s.passes > 1 ? "es" : ""} · avg ${s.avg}` : "No passes yet this match.";
    case "attack": return s.ta ? `This match: ${s.kill} kill${s.kill === 1 ? "" : "s"} · ${s.atkErr} error${s.atkErr === 1 ? "" : "s"} · ${s.ta} attempts · hitting ${s.hitPct}` : "No attacks yet this match.";
    case "block": return s.solo + s.blkAst + s.blkErr ? `This match: ${s.solo} solo · ${s.blkAst} assist · ${s.blkErr} error` : "No blocks yet this match.";
    default: return s.setAst + s.setErr ? `This match: ${s.setAst} assist${s.setAst === 1 ? "" : "s"} · ${s.setErr} error${s.setErr === 1 ? "" : "s"}` : "No sets recorded yet this match.";
  }
}

// Who is on the court (player id -> position); the bench in jersey order.
function ordered(m, entries) {
  const s = court.state(m), pos = Object.fromEntries(Object.entries(s.lineup).filter(([, v]) => v).map(([k, v]) => [v, +k]));
  return { s, list: [...entries].sort((a, b) => (pos[a.p.id] || 99) - (pos[b.p.id] || 99)), pos };
}

function trackCard(main, ctx, m, skill, heading) {
  const entries = model.rosterFor(m.team_id);
  if (!entries.length) {
    main.insertAdjacentHTML("beforeend", `<section class="card"><h2>No players on this team</h2>
      <p class="muted">Add players to the team on More → Team.</p>
      <button class="btn primary" type="button" id="to-team">Open Team</button></section>`);
    $("#to-team", main).onclick = () => ctx.go("team");
    return;
  }
  const { s, list, pos } = ordered(m, entries);
  const names = model.shortNames(entries);
  const key = `sel_${skill}`;
  let sel = db.getLocal(key);
  let note = "";
  if (skill === "serve" && s.lineup[1]) {
    const srv = m.scoring === "points" ? court.serving(m, s) : null;
    if (srv === "them") note = "They're serving. Track the pass on Receive.";
    else { sel = s.lineup[1]; note = "Server at position 1 is picked for you."; }
  }
  if (!entries.some(e => e.p.id === sel)) sel = null;
  // Block allows a second player for a shared block.
  let sel2 = skill === "block" ? db.getLocal("sel_block2") : null;
  if (!sel || sel2 === sel || !entries.some(e => e.p.id === sel2)) sel2 = null;
  const hasCourt = Object.keys(pos).length > 0;
  const chip = ({ r, p }, extra = "") => `<button type="button" class="pchip${p.id === sel || p.id === sel2 ? " sel" : ""}${extra}" data-p="${esc(p.id)}">
      <span class="n">${esc(r.number ?? "")}</span><span class="nm">${esc(names[p.id])}</span></button>`;
  const byId = Object.fromEntries(entries.map(e => [e.p.id, e]));
  // Players on the court are laid out exactly like the Court tab: 4 3 2 across the front, 5 6 1 across the back.
  const courtHtml = hasCourt ? `<div class="courtchips" aria-label="On the court">${[4, 3, 2, 5, 6, 1].map(n => {
      const e = byId[s.lineup[n]];
      return e ? chip(e, " oncourt").replace('<span class="n">', `<span class="pos">${n}</span><span class="n">`)
               : `<div class="pchip empty"><span class="pos">${n}</span>—</div>`;
    }).join("")}</div>` : "";
  const bench = list.filter(e => !pos[e.p.id]);

  main.insertAdjacentHTML("beforeend", `<section class="card">
      <div class="card-head">${heading}<span class="grow"></span>${hasCourt && (skill === "serve" || skill === "receive") ? `<button class="btn small" type="button" id="trk-rot" ${court.liberoFront(m, s) ? "disabled" : ""}>Rotate ↻</button>` : ""}
        <span class="muted small">${note || (skill === "serve" ? "Pick the server" : "Pick the player")}</span></div>
      ${courtHtml}
      <div class="chips">${hasCourt && bench.length ? `<div class="chip-sep">Bench</div>` : ""}${bench.map(e => chip(e)).join("")}</div>
    </section>
    <section class="card">
      <div class="results">${BUTTONS[skill].map(([v, l, c]) => `<button type="button" class="res ${c}" data-r="${esc(v)}">${esc(l)}</button>`).join("")}</div>
      <div class="feedback"><div class="confirm${lastCls ? " c-" + lastCls : ""}" id="fb" role="status">${esc(lastMsg)}</div>
        <button type="button" class="btn small" id="undo">↶ Undo last</button></div>
      <p class="muted small" id="sum">${esc(summary(skill, m, sel, sel2, names))}</p>
    </section>`);

  $("#trk-rot", main) && ($("#trk-rot", main).onclick = async () => {
    const mm = db.get("matches", m.id), cs = court.state(mm);
    if (mm.scoring === "points" && cs.auto && !(await ask("The app already rotates by itself when you win a rally on their serve (a side out). Rotate anyway?", "Rotate")))
      return;
    const r = court.rotate(mm, court.state(mm));
    if (r.error) { toast(r.error); return; }
    lastMsg = "↻ Rotated"; lastCls = "u"; ctx.refresh();
    showSwaps(mm, r, ctx);
  });
  const setSel = () => {
    db.setLocal(key, sel); if (skill === "block") db.setLocal("sel_block2", sel2);
    for (const x of $$("[data-p]", main)) x.classList.toggle("sel", x.dataset.p === sel || x.dataset.p === sel2);
    $("#sum", main).textContent = summary(skill, m, sel, sel2, names);
  };
  for (const b of $$("[data-p]", main)) b.onclick = () => {
    const id = b.dataset.p;
    if (skill !== "block") sel = id;
    else if (id === sel) { sel = sel2; sel2 = null; }        // tap a selected blocker again to unselect her
    else if (id === sel2) sel2 = null;
    else if (!sel) sel = id;
    else sel2 = id;                                            // second blocker (a third tap replaces the second)
    setSel();
  };
  for (const b of $$("[data-r]", main)) b.onclick = () => {
    if (!sel) { toast("Tap a player first."); return; }
    const res = b.dataset.r;
    if (sel2 && res !== "assist") { toast("Solo and Error are for one blocker. Tap a player again to unselect her."); return; }
    const e = entries.find(x => x.p.id === sel), e2 = sel2 ? entries.find(x => x.p.id === sel2) : null;
    const r = court.record(db.get("matches", m.id), sel, skill, res, sel2);
    const who = `#${e.r.number ?? ""} ${names[sel]}` + (e2 ? ` + #${e2.r.number ?? ""} ${names[sel2]}` : "");
    lastMsg = `✓ ${e2 ? "Shared block" : words(skill, res)} · ${who}` +
      (r.point ? ` · Point ${r.point} ${r.score.us}–${r.score.them}` : "") + (r.rotated ? " · Side out, rotated" : "");
    lastCls = b.className.match(/\b([gbor])\b/)?.[1] || "b";
    flash = { skill, r: res, pids: e2 ? [sel, sel2] : [sel], badge: "✓ " + (SHORT[res] || res) };
    if (skill === "block") { db.setLocal(key, null); db.setLocal("sel_block2", null); }   // pick the blockers fresh each time
    ctx.refresh();
    showSwaps(db.get("matches", m.id), r, ctx, r.rotated ? "Side out" : "Lost the serve");
  };
  $("#undo", main).onclick = () => {
    const rows = court.undo(db.get("matches", m.id));
    if (!rows) { toast("Nothing to undo in this match."); return; }
    const acts = rows.filter(x => x.skill !== "point"), a = acts[0] || rows[0];
    const who = acts.map(x => names[x.player_id]).filter(Boolean).join(" + ");
    lastMsg = `↶ Undid ${a.skill === "point" ? `point ${a.result}` : acts.length > 1 ? "shared block" : words(a.skill, a.result)}${who ? " · " + who : ""}`;
    lastCls = "u"; flash = { skill, undo: true };
    ctx.refresh();
  };
  // Light up what was just recorded: the result button, the player's chip and the confirmation bar.
  if (flash && flash.skill === skill) {
    if (flash.r) $(`[data-r="${CSS.escape(flash.r)}"]`, main)?.classList.add("flash");
    for (const pid of flash.pids || []) {
      const c = $(`.pchip[data-p="${CSS.escape(pid)}"]`, main);
      if (c) { c.classList.add("got"); c.insertAdjacentHTML("beforeend", `<span class="got-badge">${esc(flash.badge)}</span>`); }
    }
    $("#fb", main)?.classList.add("pop");
  }
  flash = null;
}

function ready(main, ctx) {
  const m = renderBar(main, ctx);
  if (!m) return null;
  if (!m.scoring) {
    main.insertAdjacentHTML("beforeend", `<section class="card"><p>Choose how to score this match before you start.</p>
      <button class="btn primary" type="button" id="choose">Choose scoring</button></section>`);
    $("#choose", main).onclick = async () => { if (await chooseScoring(m)) ctx.refresh(); };
    return null;
  }
  return m;
}

export function render(main, ctx, mode) {
  const m = ready(main, ctx);
  if (m) trackCard(main, ctx, m, mode, `<h2>${TITLE[mode]}</h2>`);
}

export function renderAttack(main, ctx) {
  const m = ready(main, ctx);
  if (!m) return;
  const seg = `<div class="seg" role="tablist">${["attack", "block", "set"].map(k =>
    `<button type="button" role="tab" data-seg="${k}" aria-selected="${k === atkSkill}">${TITLE[k]}</button>`).join("")}</div>`;
  trackCard(main, ctx, m, atkSkill, seg);
  for (const b of $$("[data-seg]", main)) b.onclick = () => { atkSkill = b.dataset.seg; lastMsg = ""; lastCls = ""; ctx.refresh(); };
}
