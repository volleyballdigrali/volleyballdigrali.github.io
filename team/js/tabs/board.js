// Match-day board: one skill at a time, one row per player, weakest at the top, coloured by the team's colour levels.

import * as db from "../db.js";
import * as model from "../model.js";
import * as court from "../court.js";
import { renderBar } from "../match.js";
import { cutsOf, fmt } from "../levels.js";
const current = () => cutsOf(model.currentTeam());
import { $, $$, esc } from "../ui.js";

let skill = "pass", scope = "set";
const SKILLS = [["serve", "Serve"], ["pass", "Pass"], ["attack", "Attack"]];

export function band(kind, v, cuts = current()) {
  const [r, a] = cuts[kind];
  return v < r ? "red" : v < a ? "amber" : "green";
}

// rows: [{ label, sub, value, shown, fill (0-1), count, kind, mark }] -> HTML list, weakest first
export function bars(rows, kind, unit, cuts = current()) {
  if (!rows.length) return `<p class="muted">Nothing recorded yet${unit ? " for " + unit : ""}.</p>`;
  return `<div class="bars">${rows.sort((a, b) => a.value - b.value || b.count - a.count).map(r => `
    <div class="bar-row">
      <div class="bar-name"><b>${esc(r.label)}</b>${r.mark ? `<span class="oncourt-dot" title="On the court">●</span>` : ""}${r.sub ? `<span class="bar-sub">${esc(r.sub)}</span>` : ""}</div>
      <div class="bar-track"><div class="bar-fill ${band(kind, r.value, cuts)}" style="width:${Math.max(4, Math.min(100, r.fill * 100)).toFixed(0)}%"></div></div>
      <div class="bar-num ${band(kind, r.value, cuts)}">${esc(r.shown)}<span class="bar-count">${r.count}</span></div>
    </div>`).join("")}</div>`;
}

export const legend = (kind, cuts = current()) => {
  const [r, a] = cuts[kind], f = fmt[kind === "hit" ? "hit" : kind];
  return `<p class="muted small" style="margin:0"><span class="key red"></span>under ${f(r)} · <span class="key amber"></span>${f(r)} to ${f(a)} · <span class="key green"></span>${f(a)} and up (your team's colour levels, More → Team). Small number = attempts. Weakest at the top.</p>`;
};

export function render(main, ctx) {
  const m = renderBar(main, ctx);
  if (!m) return;
  const entries = model.rosterFor(m.team_id), names = model.shortNames(entries), cuts = cutsOf(db.get("teams", m.team_id));
  const s = court.state(m), on = court.onCourt(s), set = model.curSet(m);
  const acts = model.actionsFor(m.id, a => scope === "match" || Number(a.set_no) === set);
  const rows = [];
  for (const { r, p } of entries) {
    const t = model.tally(acts.filter(a => a.player_id === p.id));
    const base = { label: `#${r.number ?? ""} ${names[p.id]}`, mark: on.has(p.id) };
    if (skill === "pass" && t.passes) rows.push({ ...base, value: t.passPts / t.passes, shown: t.avg, fill: t.passPts / t.passes / 3, count: t.passes });
    if (skill === "serve" && t.serves) rows.push({ ...base, value: t.srvPct, shown: t.srvPct + "%", fill: t.srvPct / 100, count: t.serves });
    if (skill === "attack" && t.ta) { const h = (t.kill - t.atkErr) / t.ta; rows.push({ ...base, value: h, shown: t.hitPct, fill: (h + 0.5) / 1.0, count: t.ta }); }
  }
  const kind = skill === "attack" ? "hit" : skill;
  main.insertAdjacentHTML("beforeend", `<section class="card">
      <div class="card-head"><h2>Board</h2><span class="grow"></span>
        <div class="seg seg-sm">${[["set", `Set ${set}`], ["match", "Match"]].map(([k, l]) => `<button type="button" data-scope="${k}" aria-selected="${k === scope}">${l}</button>`).join("")}</div></div>
      <div class="seg">${SKILLS.map(([k, l]) => `<button type="button" data-skill="${k}" aria-selected="${k === skill}">${l}</button>`).join("")}</div>
      ${bars(rows, kind, scope === "set" ? `set ${set}` : "this match", cuts)}
      ${legend(kind, cuts)}
    </section>`);
  for (const b of $$("[data-skill]", main)) b.onclick = () => { skill = b.dataset.skill; ctx.refresh(); };
  for (const b of $$("[data-scope]", main)) b.onclick = () => { scope = b.dataset.scope; ctx.refresh(); };
}
