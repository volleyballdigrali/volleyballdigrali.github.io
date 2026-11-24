// Court tab: our half of the court, bench, Rotate / Take off court / Undo lineup change, substitutions and notices.

import * as db from "../db.js";
import * as model from "../model.js";
import * as court from "../court.js";
import { renderBar } from "../match.js";
import { showSwaps } from "../planui.js";
import { $, $$, esc, say, toast } from "../ui.js";

let armed = null;     // bench player waiting to be placed
let selPos = null;    // court position selected (for Take off court)
let where = "";       // match and set the selections belong to

export function render(main, ctx) {
  const m = renderBar(main, ctx);
  if (!m) return;
  const s = court.state(m);
  const here = `${m.id}:${model.curSet(m)}`;
  if (here !== where) { armed = null; selPos = null; where = here; }
  const entries = model.rosterFor(m.team_id);
  const byId = Object.fromEntries(entries.map(e => [e.p.id, e]));
  const names = model.shortNames(entries);
  const on = court.onCourt(s);
  const bench = entries.filter(e => !on.has(e.p.id))
    .sort((a, b) => (model.isLibero(m.team_id, b.p.id) - model.isLibero(m.team_id, a.p.id)));
  if (armed && on.has(armed)) armed = null;
  if (selPos && !s.lineup[selPos]) selPos = null;
  const lf = court.liberoFront(m, s);
  const prompt = !lf && s.prompts[0];
  const notice = lf ? { pos: lf.pos } : prompt ? { pos: prompt.pos } : null;
  const label = pid => (pid && byId[pid] ? `#${byId[pid].r.number ?? ""} ${names[pid]}` : "");
  const pts = m.scoring === "points";
  const srv = pts ? court.serving(m, s) : null;

  let noticeHtml = "";
  if (lf) noticeHtml = `<div class="notice"><b>Libero in the front row.</b> ${esc(label(lf.pid))} is at position ${lf.pos}. The libero can't play the front row.
      ${bench.length ? `Tap a bench player to bring in at position ${lf.pos}.` : "Add another player on More → Team."} Rotate is off until the libero is out of the front row.</div>`;
  else if (prompt?.type === "libero") noticeHtml = `<div class="notice"><b>Bring in the libero?</b> ${esc(label(prompt.pid))} (Middle) is at position 1.
      <div class="row" style="margin-top:8px"><button class="btn small primary" type="button" id="p-lib">Bring in ${esc(label(prompt.lib))}</button>
      <button class="btn small" type="button" id="p-keep">Keep anyway</button></div></div>`;
  else if (prompt?.type === "rot3") noticeHtml = `<div class="notice"><b>Rotation count 3: substitute?</b> ${esc(label(prompt.pid))} just moved ${esc(prompt.dir)} (position ${prompt.pos}).
      Tap a bench player to bring in at position ${prompt.pos}.
      <div class="row" style="margin-top:8px"><button class="btn small" type="button" id="p-keep">Keep anyway</button></div></div>`;

  const box = pos => {
    const pid = s.lineup[pos], e = pid && byId[pid];
    const cls = ["cbox", pos === selPos ? "sel" : "", notice?.pos === pos ? "warn" : "", pts && pos === 1 && srv === "us" && pid ? "serving" : ""].join(" ");
    return `<button type="button" class="${cls}" data-pos="${pos}">
      <span class="cpos">${pos}</span>
      ${e ? `<span class="cnum">${esc(e.r.number ?? "")}</span><span class="cname">${esc(names[pid])}</span>`
          : `<span class="cempty">${armed ? "Tap to place" : "Empty"}</span>`}
      <span class="crole">${esc(court.dispRole(m, s, pos))}</span></button>`;
  };

  main.insertAdjacentHTML("beforeend", `<section class="card">
      <div class="card-head"><h2>Court</h2><span class="muted">Set ${model.curSet(m)}</span><span class="grow"></span>
        <span class="subs ${s.subs >= court.subLimit(m) ? "maxed" : ""}">${s.subs} of ${court.subLimit(m)} subs used</span></div>
      ${pts ? `<div class="row small">${srv ? `<span class="pill ${srv === "us" ? "done" : "live"}">${srv === "us" ? "We serve" : "They serve"}</span>` : ""}
        <label class="chk small" style="margin-left:auto"><input type="checkbox" id="auto" ${s.auto ? "checked" : ""}> Rotate on side outs</label></div>` : ""}
      ${noticeHtml}
      <div class="net" aria-hidden="true">NET</div>
      <div class="court">${[4, 3, 2].map(box).join("")}${[5, 6, 1].map(box).join("")}</div>
      <div class="cbtns">
        <button class="btn o1" type="button" id="rot" ${lf ? "disabled" : ""}>Rotate ↻</button>
        <button class="btn o1b" type="button" id="rotb">↺ Rotate back</button>
        <button class="btn o2" type="button" id="off" ${selPos ? "" : "disabled"}>Take off court</button>
        <button class="btn o3" type="button" id="und" ${s.hist.length ? "" : "disabled"}>Undo lineup change</button>
      </div>
      <button class="btn plan-link" type="button" id="to-plan">${court.planOf(s).length ? `Rotation plan: ${court.planOf(s).length} swap${court.planOf(s).length > 1 ? "s" : ""} ›` : "Plan who goes in for who ›"}</button>
    </section>
    <section class="card">
      <div class="card-head"><h3>Bench</h3><span class="muted small">${armed ? "Now tap a court position" : "Tap a player, then a position"}</span></div>
      <div class="chips">${bench.map(({ r, p }) => `<button type="button" class="pchip${armed === p.id ? " sel" : ""}" data-b="${esc(p.id)}">
          <span class="n">${esc(r.number ?? "")}</span><span class="nm">${esc(names[p.id])}${model.isLibero(m.team_id, p.id) ? " (L)" : ""}</span></button>`).join("")
        || `<p class="muted">Everyone is on the court.</p>`}</div>
      <p class="muted small" style="margin:0">Tap a bench player, then a court position to put her there. Whoever was there goes to the bench
        (a substitution, unless it involves the libero). Tap a player on the court to select her, then Take off court.
        Rotate moves everyone clockwise; Rotate back moves everyone one spot the other way. In point-by-point matches the court rotates by itself on a side out, and the server at position 1 is picked on the Serve tab.</p>
    </section>`);

  const go = () => ctx.refresh();
  for (const b of $$("[data-pos]", main)) b.onclick = () => {
    const pos = +b.dataset.pos;
    if (armed) {
      const r = court.place(m, s, pos, armed);
      if (r.error) { armed = null; say(r.error); return go(); }
      if (r.counted) toast(`Substitution: ${s.subs} of ${court.subLimit(m)} subs used`);
      armed = null; selPos = pos; return go();
    }
    selPos = selPos === pos || !s.lineup[pos] ? null : pos;
    go();
  };
  for (const b of $$("[data-b]", main)) b.onclick = () => {
    const pid = b.dataset.b;
    if (notice) {
      const r = court.place(m, s, notice.pos, pid);
      if (r.error) { armed = null; say(r.error); return go(); }
      armed = null; selPos = notice.pos; return go();
    }
    armed = armed === pid ? null : pid; go();
  };
  $("#rot", main).onclick = () => { const r = court.rotate(m, s); if (r.error) say(r.error); selPos = null; go(); if (!r.error) showSwaps(m, r, ctx); };
  $("#to-plan", main).onclick = () => ctx.go("rotation");
  $("#rotb", main).onclick = () => { const r = court.rotateBack(m, s); selPos = null; go(); if (r.undidSubs) toast("Rotated back. The planned subs from that rotate were undone too."); };
  $("#off", main).onclick = () => { if (selPos) court.takeOff(m, s, selPos); selPos = null; go(); };
  $("#und", main).onclick = () => { court.undoLineup(m, s); armed = null; selPos = null; go(); };
  $("#p-keep", main) && ($("#p-keep", main).onclick = () => { court.dismissPrompt(m, s); go(); });
  $("#p-lib", main) && ($("#p-lib", main).onclick = () => { court.place(m, s, prompt.pos, prompt.lib); selPos = prompt.pos; go(); });
  $("#auto", main) && ($("#auto", main).onchange = e => { court.setAuto(m, e.target.checked); toast(e.target.checked ? "Rotates on side outs" : "Rotate by hand"); });
}
