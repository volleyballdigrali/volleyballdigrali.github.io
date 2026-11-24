// Season schedule: day, date, opponent, location, optional time. Tap a match to track it or edit it.

import * as db from "../db.js";
import * as model from "../model.js";
import { chooseScoring } from "../match.js";
import { $, $$, esc, sheet, ask, toast, fmtDate, fmtTime, dayName, today, saveFile } from "../ui.js";

// ---------- calendar file (.ics): the schedule for the phone's or computer's calendar ----------
// Only the schedule goes in it (date, time, opponent, location, event), never players or stats.
const icsText = v => String(v || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {                                  // lines longer than 75 bytes continue on the next line
  const out = []; let cur = "", n = 0;
  for (const ch of line) { const b = new TextEncoder().encode(ch).length; if (n + b > 74) { out.push(cur); cur = " "; n = 1; } cur += ch; n += b; }
  return [...out, cur].join("\r\n");
}
const ymd = d => d.replace(/-/g, "");
const addDay = d => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };
export function calendarFile(team, matches, stamp = new Date()) {
  const dt = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Volleyball Digrali//Team app//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(model.teamLabel(team))}`];
  for (const m of matches) {
    L.push("BEGIN:VEVENT", `UID:${m.id}@volleyballdigrali`, `DTSTAMP:${dt}`);
    if (m.time) {
      const [h, mi] = m.time.split(":").map(Number), end = h * 60 + mi + 60;
      L.push(`DTSTART:${ymd(m.date)}T${String(h).padStart(2, "0")}${String(mi).padStart(2, "0")}00`);
      L.push(end < 1440 ? `DTEND:${ymd(m.date)}T${String(Math.floor(end / 60)).padStart(2, "0")}${String(end % 60).padStart(2, "0")}00` : "DURATION:PT1H");
    } else L.push(`DTSTART;VALUE=DATE:${ymd(m.date)}`, `DTEND;VALUE=DATE:${ymd(addDay(m.date))}`);
    L.push(`SUMMARY:${icsText(`${team.name} vs ${m.opponent}`)}`);
    if (m.location) L.push(`LOCATION:${icsText(m.location)}`);
    if (m.event) L.push(`DESCRIPTION:${icsText(m.event)}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
async function exportCalendar(team, list) {
  const t = today(), upcoming = list.filter(m => m.date >= t && m.status !== "played");
  if (!list.length) { toast("Add matches first."); return; }
  const r = await sheet({ title: "Add to calendar",
    body: `<p class="small" style="margin:0">Makes a calendar file with the schedule (dates, times, opponents, locations). No player information goes in it.</p>
      <label class="chk"><input type="radio" name="calw" value="up" ${upcoming.length ? "checked" : "disabled"}> Upcoming matches (${upcoming.length})</label>
      <label class="chk"><input type="radio" name="calw" value="all" ${upcoming.length ? "" : "checked"}> The whole season (${list.length})</label>
      <p class="muted small" style="margin:0">On an iPhone, choose <b>Save to Files</b> (or Mail it to yourself), then tap the file and choose <b>Add All</b>. Matches without a time become all-day events. If the schedule changes, delete the old events before adding the new file, or you may see them twice.</p>`,
    buttons: [{ label: "Cancel", value: null }, { label: "Make the file", value: true, cls: "primary" }] });
  if (!r.value) return;
  const pick = r.el.querySelector("input[name=calw]:checked")?.value === "all" ? list : upcoming;
  const name = `${(team.name || "team").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "team"}-schedule.ics`;
  if (await saveFile(name, calendarFile(team, pick), "text/calendar")) toast("Calendar file ready.");
}


function matchForm(m = {}) {
  return `<div class="grid2">
      <label class="field">Date<input type="date" id="f-date" value="${esc(m.date || today())}"></label>
      <label class="field">Time (optional)<input type="time" id="f-time" value="${esc(m.time || "")}"></label>
    </div>
    <label class="field">Opponent<input type="text" id="f-opp" value="${esc(m.opponent || "")}" maxlength="60" autocomplete="off"></label>
    <label class="field">Location<input type="text" id="f-loc" value="${esc(m.location || "")}" maxlength="80"></label>
    <label class="field">Event or tournament (optional)<input type="text" id="f-evt" value="${esc(m.event || "")}" maxlength="80"></label>`;
}
const readForm = el => ({
  date: $("#f-date", el).value, time: $("#f-time", el).value || "",
  opponent: $("#f-opp", el).value.trim(), location: $("#f-loc", el).value.trim(), event: $("#f-evt", el).value.trim(),
});
const checkForm = el => (!$("#f-date", el).value ? "Pick a date." : !$("#f-opp", el).value.trim() ? "Type the opponent's name." : true);

async function addMatch(team, ctx) {
  const r = await sheet({ title: "Add a match", body: matchForm(),
    buttons: [{ label: "Add match", value: true, cls: "primary" }, { label: "Cancel", value: null }], check: checkForm });
  if (!r.value) return;
  db.insert("matches", { team_id: team.id, status: "scheduled", ...readForm(r.el) });
  toast("Match added.");
  ctx.refresh();
}

async function editScores(m, ctx) {
  const rows = [1, 2, 3, 4, 5].map(n => { const s = model.setRow(m.id, n); return { n, us: s?.us ?? "", them: s?.them ?? "" }; });
  const r = await sheet({
    title: `Set scores vs ${m.opponent}`,
    body: `<div class="grid3" style="grid-template-columns:auto 1fr 1fr;align-items:center">
        <span></span><b class="small">Us</b><b class="small">${esc(m.opponent)}</b>
        ${rows.map(x => `<b>Set ${x.n}</b>
          <input type="number" inputmode="numeric" min="0" max="99" id="u${x.n}" value="${esc(x.us)}" aria-label="Set ${x.n} us">
          <input type="number" inputmode="numeric" min="0" max="99" id="t${x.n}" value="${esc(x.them)}" aria-label="Set ${x.n} them">`).join("")}
      </div>
      <label class="chk"><input type="checkbox" id="done" ${m.status === "played" ? "checked" : ""}> This match is finished</label>
      <p class="muted small">Leave a set blank if it wasn't played.</p>`,
    buttons: [{ label: "Save", value: true, cls: "primary" }, { label: "Cancel", value: null }],
    check: el => {
      for (const n of [1, 2, 3, 4, 5]) {
        const u = $("#u" + n, el).value.trim(), t = $("#t" + n, el).value.trim();
        if ((u === "") !== (t === "")) return `Set ${n} needs both scores, or neither.`;
        if (u !== "" && !(/^\d{1,2}$/.test(u) && /^\d{1,2}$/.test(t))) return `Set ${n}: use whole numbers.`;
      }
      return true;
    },
  });
  if (!r.value) return;
  for (const n of [1, 2, 3, 4, 5]) {
    const u = $("#u" + n, r.el).value.trim(), t = $("#t" + n, r.el).value.trim(), old = model.setRow(m.id, n);
    if (u === "") { if (old) db.remove("sets", old.id); }
    else model.saveSetScore(m.id, n, +u, +t);
  }
  const done = $("#done", r.el).checked;
  db.update("matches", m.id, { status: done ? "played" : (m.status === "played" ? "in progress" : m.status) });
  toast("Scores saved.");
  ctx.refresh();
}

async function openMatch(m, ctx) {
  const sets = model.setsFor(m.id), res = model.matchResult(m.id);
  const r = await sheet({
    title: `vs ${m.opponent}`,
    body: `<p class="sheet-msg">${esc(dayName(m.date))}, ${esc(fmtDate(m.date))}${m.time ? " · " + esc(fmtTime(m.time)) : ""}</p>
      ${m.location ? `<p class="muted" style="margin:0">${esc(m.location)}</p>` : ""}
      ${m.event ? `<p class="muted" style="margin:0">${esc(m.event)}</p>` : ""}
      ${sets.length ? `<p style="margin:0"><b>${esc(res.text)}</b> · ${sets.map(s => `${s.us}–${s.them}`).join(", ")}</p>` : ""}
      ${m.scoring ? `<p class="muted small" style="margin:0">Scoring: ${m.scoring === "points" ? "every point" : "final set scores only"}</p>` : ""}`,
    buttons: [{ label: "Track this match", value: "track", cls: "primary" }, { label: "Edit", value: "edit" },
      { label: "Set scores", value: "scores" }, { label: "Delete", value: "delete" }, { label: "Close", value: null }],
  });
  if (r.value === "track") {
    model.setCurrentMatch(m.id);
    let cur = db.get("matches", m.id);
    if (!cur.scoring) { cur = await chooseScoring(cur); if (!cur) { ctx.refresh(); return; } }
    if (cur.status === "played") db.update("matches", m.id, { status: "in progress" });
    ctx.go("serve");
  } else if (r.value === "edit") {
    const e = await sheet({ title: "Edit match", body: matchForm(m),
      buttons: [{ label: "Save", value: true, cls: "primary" }, { label: "Cancel", value: null }], check: checkForm });
    if (e.value) { db.update("matches", m.id, readForm(e.el)); toast("Match saved."); ctx.refresh(); }
  } else if (r.value === "scores") editScores(m, ctx);
  else if (r.value === "delete") {
    const n = model.actionsFor(m.id).length;
    if (await ask(`Delete the match vs ${m.opponent}${n ? ` and its ${n} recorded stats` : ""}? This can't be undone.`, "Delete", true)) {
      for (const s of model.setsFor(m.id)) db.remove("sets", s.id);
      for (const a of model.actionsFor(m.id)) db.remove("actions", a.id);
      db.remove("matches", m.id);
      if (db.getLocal("current_match") === m.id) model.setCurrentMatch(null);
      toast("Match deleted."); ctx.refresh();
    }
  }
}

export function render(main, ctx) {
  const team = model.currentTeam();
  if (!team) {
    main.innerHTML = `<section class="card"><h2>Schedule</h2><p>Create a team first, then add its matches here.</p>
      <button class="btn primary" type="button" id="to-team">Create a team</button></section>`;
    $("#to-team", main).onclick = () => ctx.go("team");
    return;
  }
  const list = model.matchesFor(team.id), cur = db.getLocal("current_match"), t = today();
  const next = list.find(m => m.date >= t && m.status !== "played");
  main.innerHTML = `<section class="card">
      <div class="card-head"><h2>Schedule</h2><span class="grow"></span>
        <button class="btn small" type="button" id="cal"${list.length ? "" : " hidden"}>Add to calendar</button>
        <button class="btn small primary" type="button" id="add">+ Add match</button></div>
      <p class="muted small" style="margin:0">${esc(model.teamLabel(team))}${team.season ? " · " + esc(team.season) : ""} · ${list.length} match${list.length === 1 ? "" : "es"}</p>
      <div class="list">${list.length ? list.map(m => {
        const res = model.matchResult(m.id);
        const pill = m.id === cur && m.status !== "played" ? `<span class="pill live">Tracking</span>`
          : m.status === "played" ? `<span class="pill done">${esc(res.text || "Played")}</span>`
          : m === next ? `<span class="pill">Next</span>` : "";
        return `<button type="button" class="item" data-m="${esc(m.id)}">
          <div class="main-txt"><b>vs ${esc(m.opponent)}</b>
            <div class="sub">${esc(dayName(m.date, true))} ${esc(fmtDate(m.date))}${m.time ? " · " + esc(fmtTime(m.time)) : ""}${m.location ? " · " + esc(m.location) : ""}</div>
            ${m.event ? `<div class="sub">${esc(m.event)}</div>` : ""}</div>
          ${pill}<span class="chev">›</span></button>`;
      }).join("") : `<p class="muted">No matches yet. Tap <b>+ Add match</b> to start the season schedule.</p>`}</div>
    </section>`;
  $("#add", main).onclick = () => addMatch(team, ctx);
  $("#cal", main).onclick = () => exportCalendar(team, list);
  for (const b of $$("[data-m]", main)) b.onclick = () => openMatch(db.get("matches", b.dataset.m), ctx);
}
