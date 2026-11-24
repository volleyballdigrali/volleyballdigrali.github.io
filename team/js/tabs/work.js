// Work rotation: officiating duties for the team, rotated each time the team works a match.
//
// The rotation is a cycle of slots: the 10 duties in order, plus one "Off" slot for each player beyond 10.
// Each time the team works, every player moves one slot along from where she was last time,
// so over a season everyone does every job and everyone sits out equally.

import * as db from "../db.js";
import * as model from "../model.js";
import { DUTY_SHORT } from "../schema.js";
import { $, $$, esc, sheet, ask, toast, fmtDate, today } from "../ui.js";

const duties = () => db.all("duties").sort((a, b) => a.sort - b.sort);
const slotCount = n => Math.max(n, 10);

function sessions(teamId) {
  const by = {};
  for (const w of db.where("work_log", w => w.team_id === teamId && w.session)) (by[w.session] ||= []).push(w);
  return Object.entries(by).map(([id, rows]) => ({ id, rows, date: rows[0].date, label: rows[0].label, created: rows[0].created_at }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created < a.created ? -1 : 1));
}

// Last slot each player held (absent players keep theirs, so they pick up where they left off).
function lastSlots(teamId, skipSession = null) {
  const out = {};
  for (const s of sessions(teamId).reverse().filter(x => x.id !== skipSession)) for (const w of s.rows) if (w.slot !== null && w.slot !== undefined && w.slot !== "") out[w.player_id] = +w.slot;
  return out;
}

// Suggested assignment for the players present: { pid: slot }.
export function suggest(teamId, presentIds, rosterIds) {
  const S = slotCount(rosterIds.length), last = lastSlots(teamId), taken = new Set(), out = {};
  const free = from => { for (let i = 0; i < S; i++) { const s = (from + i) % S; if (!taken.has(s)) return s; } return null; };
  for (const pid of presentIds.filter(p => p in last)) { const s = free((last[pid] + 1) % S); out[pid] = s; taken.add(s); }
  for (const pid of presentIds.filter(p => !(p in last))) { const s = free(0); out[pid] = s; taken.add(s); }
  return out;
}

const slotName = (slot, ds) => (slot < 10 && ds[slot] ? ds[slot].name : "Off");

async function recordWork(team, ctx, existing = null) {
  const entries = model.rosterFor(team.id), ds = duties();
  if (!entries.length) { toast("Add players to the team first."); return; }
  const rosterIds = entries.map(e => e.p.id), S = slotCount(rosterIds.length);
  const names = model.shortNames(entries);
  // starting values: an existing session's saved choices, or a fresh suggestion for everyone
  let pick = {};
  if (existing) for (const w of existing.rows) pick[w.player_id] = w.status === "absent" ? "absent" : String(w.slot ?? "off");
  else { const sug = suggest(team.id, rosterIds, rosterIds); for (const pid of rosterIds) pick[pid] = String(sug[pid]); }
  const options = cur => [...Array(S).keys()].map(s => `<option value="${s}"${String(s) === cur ? " selected" : ""}>${esc(slotName(s, ds))}</option>`).join("") +
    `<option value="absent"${cur === "absent" ? " selected" : ""}>Absent</option>`;

  const r = await sheet({
    title: existing ? "Edit work" : "Record work",
    body: `<div class="grid2">
        <label class="field">Date<input type="date" id="w-date" value="${esc(existing?.date || today())}"></label>
        <label class="field">Match or court (optional)<input type="text" id="w-label" value="${esc(existing?.label || "")}" maxlength="60" placeholder="e.g. Court 3, 2nd match"></label>
      </div>
      ${existing ? "" : `<p class="muted small" style="margin:0">Suggested from last time: everyone moves one job along. Change anyone, or mark her absent; absent players keep their place for next time.</p>`}
      <div class="work-pick">${entries.map(({ r: rr, p }) => `<label class="field wp-row"><span>#${esc(rr.number ?? "")} ${esc(names[p.id])}</span>
        <select data-w="${esc(p.id)}">${options(pick[p.id])}</select></label>`).join("")}</div>
      <p class="sheet-err" id="w-warn" hidden></p>`,
    buttons: [{ label: "Save", value: "save", cls: "primary" }, ...(existing ? [{ label: "Delete", value: "delete" }] : []), { label: "Cancel", value: null }],
    onOpen: el => {
      const warn = () => {
        const seen = {}, dup = [];
        for (const s of $$("[data-w]", el)) { const v = s.value; if (v !== "absent" && +v < 10) { if (seen[v]) dup.push(slotName(+v, ds)); seen[v] = 1; } }
        const missing = ds.filter((d, i) => !seen[String(i)]).map(d => d.name);
        const w = $("#w-warn", el);
        w.textContent = (dup.length ? `Two players on: ${dup.join(", ")}. ` : "") + (missing.length ? `Nobody on: ${missing.join(", ")}.` : "");
        w.hidden = !w.textContent;
      };
      for (const s of $$("[data-w]", el)) s.onchange = warn;
      warn();
    },
  });
  if (r.value === "delete") {
    if (await ask("Delete this work record? The rotation goes back to where it was before it.", "Delete", true)) {
      for (const w of existing.rows) db.remove("work_log", w.id);
      toast("Work record deleted."); ctx.refresh();
    }
    return;
  }
  if (r.value !== "save") return;
  const date = $("#w-date", r.el).value || today(), label = $("#w-label", r.el).value.trim();
  const session = existing?.id || db.uuid(), last = lastSlots(team.id, existing?.id);
  if (existing) for (const w of existing.rows) db.remove("work_log", w.id);
  for (const s of $$("[data-w]", r.el)) {
    const pid = s.dataset.w, v = s.value;
    if (v === "absent") db.insert("work_log", { team_id: team.id, player_id: pid, duty_id: null, status: "absent", session, date, label, slot: last[pid] ?? null });
    else db.insert("work_log", { team_id: team.id, player_id: pid, duty_id: +v < 10 && ds[+v] ? ds[+v].id : null, status: +v < 10 ? "worked" : "off", session, date, label, slot: +v });
  }
  toast("Work saved. Next time everyone moves one job along.");
  ctx.refresh();
}

export function render(main, ctx) {
  const team = model.currentTeam();
  if (!team) { main.innerHTML = `<section class="card"><h2>Work</h2><p>Create a team first.</p></section>`; return; }
  const entries = model.rosterFor(team.id), ds = duties(), list = sessions(team.id);   // newest first
  const code = w => (w.status === "absent" ? ["Abs", "abs"] : w.status === "off" || !w.duty_id ? ["Off", "off"]
    : [DUTY_SHORT[ds.findIndex(d => d.id === w.duty_id)] || "?", ""]);
  const names = model.shortNames(entries);
  const head = s => `${esc(fmtDate(s.date, { month: "short", day: "numeric" }))}${s.label ? `<br><span class="muted">${esc(s.label.slice(0, 12))}</span>` : ""}`;
  main.innerHTML = `<section class="card">
      <div class="card-head"><h2>Work</h2><span class="grow"></span>
        <button class="btn small primary" type="button" id="rec">+ Record work</button></div>
      <p class="small" style="margin:0">When ${esc(team.name)} works as officials, tap <b>Record work</b>. Each player is suggested the next job after her last one, so everyone rotates through all ${ds.length} jobs.</p>
    </section>
    <section class="card">
      <h3>Who did what</h3>
      ${list.length ? `<div class="scroll"><table class="matrix">
        <thead><tr><th>Player</th>${list.map(s => `<th><button type="button" class="linkish" data-s="${esc(s.id)}">${head(s)}</button></th>`).join("")}</tr></thead>
        <tbody>${entries.map(({ r, p }) => `<tr><td>#${esc(r.number ?? "")} ${esc(names[p.id])}</td>${list.map(s => {
          const w = s.rows.find(x => x.player_id === p.id);
          if (!w) return "<td></td>";
          const [c, cls] = code(w);
          return `<td class="${cls}">${esc(c)}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="muted small" style="margin:0"><b>Key:</b> ${ds.map((d, i) => `${DUTY_SHORT[i]} = ${esc(d.name)}`).join(" · ")} · Off = sat out this time · Abs = absent</p>
      <p class="muted small" style="margin:0">Newest first. Tap a date to fix or delete that record.</p>`
      : `<p class="muted">Nothing recorded yet.</p>`}
    </section>
    ${list.length ? `<section class="card">
      <h3>How many times each job</h3>
      <div class="scroll"><table class="matrix counts">
        <thead><tr><th>Player</th>${DUTY_SHORT.slice(0, ds.length).map(c => `<th>${esc(c)}</th>`).join("")}<th>Off</th><th>Abs</th></tr></thead>
        <tbody>${entries.map(({ r, p }) => {
          const mine = list.flatMap(s => s.rows.filter(x => x.player_id === p.id));
          const n = f => { const v = mine.filter(f).length; return `<td class="${v ? "" : "zero"}">${v}</td>`; };
          return `<tr><td>#${esc(r.number ?? "")} ${esc(names[p.id])}</td>${ds.map(d => n(w => w.status === "worked" && w.duty_id === d.id)).join("")}` +
            `${n(w => w.status === "off" || (w.status !== "absent" && !w.duty_id))}${n(w => w.status === "absent")}</tr>`;
        }).join("")}</tbody>
      </table></div>
      <p class="muted small" style="margin:0">Counts every time recorded above. Same codes as the key.</p>
    </section>` : ""}`;
  $("#rec", main).onclick = () => recordWork(team, ctx);
  for (const b of $$("[data-s]", main)) b.onclick = () => recordWork(team, ctx, list.find(s => s.id === b.dataset.s));
}
