// The match bar shown above Serve, Receive and Attack: current match, set, score, and set controls.

import { showSwaps } from "./planui.js";
import * as db from "./db.js";
import * as model from "./model.js";
import * as court from "./court.js";
import { $, esc, sheet, toast, fmtDate, dayName } from "./ui.js";

// Ask how to score a match. Saved on the match so every device uses the same choice.
export async function chooseScoring(m) {
  const r = await sheet({
    title: `Scoring for ${m.opponent ? "vs " + m.opponent : "this match"}`,
    body: `<p class="sheet-msg">How do you want to keep score?</p>
      <p class="muted small"><b>Every point:</b> tap Point us or Point them after each rally. An Ace or an Out scores the point for you. Gives a running score, side outs and exact playing time.</p>
      <p class="muted small"><b>Final set scores only:</b> type each set's score when the set ends.</p>`,
    buttons: [{ label: "Every point", value: "points", cls: "primary" }, { label: "Final set scores only", value: "final" }, { label: "Cancel", value: null }],
  });
  if (!r.value) return null;
  return db.update("matches", m.id, { scoring: r.value, cur_set: m.cur_set || 1 });
}

export const label = m => `vs ${m.opponent || "Opponent"}`;
export const when = m => [dayName(m.date, true), fmtDate(m.date, { month: "short", day: "numeric" })].filter(Boolean).join(" ");

// Two boxes for a set's score.
export async function scoreSheet(m, setNo, title, okLabel) {
  const live = m.scoring === "points" ? model.liveScore(m.id, setNo) : null;
  const saved = model.setRow(m.id, setNo);
  const us = saved?.us ?? live?.us ?? "", them = saved?.them ?? live?.them ?? "";
  const r = await sheet({
    title,
    body: `<div class="grid2">
        <label class="field">Us<input type="number" inputmode="numeric" min="0" max="99" id="sc-us" value="${esc(us)}"></label>
        <label class="field">${esc(m.opponent || "Them")}<input type="number" inputmode="numeric" min="0" max="99" id="sc-them" value="${esc(them)}"></label>
      </div>`,
    buttons: [{ label: okLabel, value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => {
      const ok = v => /^\d{1,2}$/.test(v.trim());
      return ok($("#sc-us", el).value) && ok($("#sc-them", el).value) ? true : "Enter both scores as whole numbers.";
    },
  });
  if (!r.value) return null;
  return { us: +$("#sc-us", r.el).value, them: +$("#sc-them", r.el).value };
}

export async function setMenu(m, ctx) {
  const n = model.curSet(m);
  const buttons = [];
  if (n < 5) buttons.push({ label: `Finish set ${n}, start set ${n + 1}`, value: "next", cls: "primary" });
  buttons.push({ label: `Finish set ${n} and end match`, value: "end" });
  if (n > 1) buttons.push({ label: `Go back to set ${n - 1}`, value: "back" });
  buttons.push({ label: "Cancel", value: null });
  const r = await sheet({ title: `Set ${n}`, body: `<p class="muted small">Finishing a set saves its score.</p>`, buttons });
  if (!r.value) return;
  if (r.value === "back") { db.update("matches", m.id, { cur_set: n - 1 }); ctx.refresh(); return; }
  const sc = await scoreSheet(m, n, `Set ${n} final score`, r.value === "next" ? `Save, start set ${n + 1}` : "Save and end match");
  if (!sc) return;
  model.saveSetScore(m.id, n, sc.us, sc.them);
  if (r.value === "next") { db.update("matches", m.id, { cur_set: n + 1 }); toast(`Set ${n} saved ${sc.us}–${sc.them}. Now set ${n + 1}.`); }
  else { db.update("matches", m.id, { status: "played" }); toast(`Match ended. ${model.matchResult(m.id).text}`); }
  ctx.refresh();
}

// Returns the current match ready for tracking, or renders a message and returns null.
let ptFlash = null;   // light up the Point button that was just tapped

export function renderBar(main, ctx) {
  const m = model.currentMatch();
  if (!m) {
    main.insertAdjacentHTML("beforeend", `<section class="card"><h2>No match selected</h2>
      <p class="muted">Pick the match you're tracking from the Schedule.</p>
      <button class="btn primary" type="button" data-go="schedule">Open Schedule</button></section>`);
    main.querySelector("[data-go]").onclick = () => ctx.go("schedule");
    return null;
  }
  if (m.status === "played") {
    main.insertAdjacentHTML("beforeend", `<section class="card"><h2>${esc(label(m))}</h2>
      <p>This match has ended. <b>${esc(model.matchResult(m.id).text)}</b></p>
      <p class="muted small">${model.setsFor(m.id).map(s => `Set ${s.set_no}: ${s.us}–${s.them}`).join(" · ")}</p>
      <div class="row"><button class="btn" type="button" id="reopen">Reopen match</button>
      <button class="btn primary" type="button" id="pick">Pick another match</button></div></section>`);
    $("#reopen", main).onclick = () => { db.update("matches", m.id, { status: "in progress" }); ctx.refresh(); };
    $("#pick", main).onclick = () => ctx.go("schedule");
    return null;
  }
  const n = model.curSet(m), res = model.matchResult(m.id), pts = m.scoring === "points";
  const sc = pts ? model.liveScore(m.id, n) : null;
  const cs = court.state(m), srv = pts ? court.serving(m, cs) : null;
  const askFirst = pts && !srv;
  main.insertAdjacentHTML("beforeend", `<section class="matchbar" aria-label="Current match">
    <div class="mb-top">
      <div class="mb-name">${esc(label(m))}<div class="mb-sub">${esc(when(m))} · Set ${n}${res.w || res.l ? ` · Sets ${res.w}–${res.l}` : ""}${srv ? ` · ${srv === "us" ? "We serve" : "They serve"}` : ""}</div>
        <div class="mb-sub mb-subs${cs.subs >= court.subLimit(m) ? " maxed" : cs.subs >= court.subLimit(m) - 2 ? " near" : ""}">${cs.subs} of ${court.subLimit(m)} subs used</div></div>
      ${pts ? `<div class="mb-score" aria-label="Score">${sc.us}–${sc.them}</div>` : ""}
      <button class="btn small mb-board" type="button" id="to-wheel"${ctx.view === "rotation" ? " aria-current=\"true\"" : ""}>Wheel</button>
      <button class="btn small mb-board" type="button" id="to-board"${ctx.view === "board" ? " aria-current=\"true\"" : ""}>Board</button>
    </div>
    ${askFirst ? `<div class="mb-first"><span>Who serves first in set ${n}?</span>
        <button class="btn small" type="button" data-first="us">We do</button><button class="btn small" type="button" data-first="them">They do</button></div>` : ""}
    <div class="mb-btns">
      ${pts ? `<button class="btn us" type="button" id="pt-us">Point us</button><button class="btn them" type="button" id="pt-them">Point them</button>`
            : `<span class="mb-sub" style="grid-column: span 2; align-self:center">Final set scores only</span>`}
      <button class="btn" type="button" id="to-court">Court</button>
      <button class="btn" type="button" id="set-menu">Set ${n} ▾</button>
    </div></section>`);
  if (pts) {
    const pt = who => {
      const r = court.record(m, null, "point", who);
      toast(`Point ${who} · ${r.score.us}–${r.score.them}${r.rotated ? " · Side out, rotated" : ""}`);
      ptFlash = who; ctx.refresh();
      showSwaps(m, r, ctx, r.rotated ? "Side out" : "Lost the serve");
    };
    if (ptFlash) { $(`#pt-${ptFlash}`, main)?.classList.add("flash"); ptFlash = null; }
    $("#pt-us", main).onclick = () => pt("us");
    $("#pt-them", main).onclick = () => pt("them");
  }
  for (const b of main.querySelectorAll("[data-first]")) b.onclick = () => { court.setFirstServe(m, b.dataset.first); ctx.refresh(); };
  $("#to-court", main).onclick = () => ctx.go("court");
  $("#to-board", main).onclick = () => ctx.go(ctx.view === "board" ? "serve" : "board");
  $("#to-wheel", main).onclick = () => ctx.go(ctx.view === "rotation" ? "court" : "rotation");
  $("#set-menu", main).onclick = () => setMenu(m, ctx);
  return m;
}
