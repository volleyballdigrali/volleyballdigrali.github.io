// Sync: export this device's data for Home Base, and import files from Home Base or other coaches.

import * as db from "../db.js";
import * as sync from "../sync.js";
import { $, esc, sheet, ask, say, toast, saveFile } from "../ui.js";
import { openFile, lockForExport, MESSAGES, savedPassword, isRemembered, forgetPassword } from "../filelock.js";

const when = iso => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");
const LABELS = { teams: "Teams", staff: "Coaches", players: "Players", roster: "Roster entries", matches: "Matches", sets: "Set scores",
  actions: "Recorded stats", court_log: "Court changes", duties: "Work duties", work_log: "Work records", links: "Links", settings: "Settings" };
let lastSummary = null;

async function doExport(ctx) {
  const locked = await lockForExport(sync.buildExport());   // always locked with the club's file password
  if (!locked) return;
  const name = sync.exportFileName();
  if (!(await saveFile(name, JSON.stringify(locked), "application/json"))) return;
  await db.setLocal("last_export", db.now());
  toast("Sync file ready.");
  ctx.refresh();
}

async function doImport(file, ctx) {
  const raw = await sync.readFile(file);
  if (!raw) { say(MESSAGES.notours); return; }
  let data;
  try { data = await openFile(raw); }                       // unlock it; files that aren't locked are refused
  catch (e) { if (e.message !== "cancel") say(MESSAGES[e.message] || MESSAGES.notours); return; }
  const res = await sync.importData(data);
  if (!res.ok) { say(res.error); return; }
  lastSummary = res;
  toast("Import finished.");
  ctx.refresh();
}

export function render(main, ctx) {
  const counts = db.tableNames().map(t => [t, db.all(t).length]);
  const li = db.getLocal("last_import");
  main.innerHTML = `
    <section class="card">
      <h2>Sync</h2>
      <label class="field">This device's name<input type="text" id="dev" value="${esc(db.deviceName())}" maxlength="40"></label>
      <p class="muted small" style="margin:0">Shown on sync files and in Home Base, so you can tell whose data is whose.</p>
    </section>

    <section class="card">
      <h3>Send data to Home Base</h3>
      <p class="small" style="margin:0">Creates one file with everything on this phone, locked with the club's file password. Send it to yourself (AirDrop, Mail or Outlook), then import it in Home Base. Once Home Base has it, delete it from the phone and your mail.</p>
      <button class="btn primary" type="button" id="export">Export sync file</button>
      <p class="muted small" style="margin:0">Last export: ${esc(when(db.getLocal("last_export")))}</p>
    </section>

    <section class="card">
      <h3>Bring in data</h3>
      <p class="small" style="margin:0">Import a setup file from Home Base, or a sync file from another coach. Nothing on this phone is lost: newer changes win, and importing the same file twice changes nothing.</p>
      <label class="btn" for="imp">Import file…</label><input type="file" id="imp" class="sr" accept=".json,application/json">
      <p class="muted small" style="margin:0">Last import: ${li ? `${esc(when(li.at))} from ${esc(li.from)}` : "never"}</p>
      ${lastSummary ? `<div class="scroll"><table><thead><tr><th>From ${esc(lastSummary.from)}</th><th>Added</th><th>Updated</th><th>Already up to date</th></tr></thead>
        <tbody>${Object.entries(lastSummary.tables).filter(([, s]) => s.added + s.updated + s.skipped + s.invalid)
          .map(([t, s]) => `<tr><td>${esc(LABELS[t] || t)}</td><td>${s.added}</td><td>${s.updated}</td><td>${s.skipped}</td></tr>`).join("")}</tbody></table></div>
        ${lastSummary.unknown.length ? `<p class="small" style="margin:0">Skipped data this version doesn't know yet: ${esc(lastSummary.unknown.join(", "))}. Update the app and import again.</p>` : ""}` : ""}
    </section>

    <section class="card">
      <h3>File password</h3>
      <p class="small" style="margin:0">Every sync and setup file is locked with the club's file password, set on Home Base. Files that aren't locked are refused.</p>
      <p class="small" style="margin:0" id="fpw-state">${savedPassword() ? (isRemembered() ? "The password is remembered on this phone." : "The password is known until the app closes (not remembered).") : "Not entered on this phone yet: you'll be asked the first time you export or import."}</p>
      ${savedPassword() ? `<button class="btn" type="button" id="fpw-forget">Forget the password on this phone</button>` : ""}
    </section>

    <section class="card">
      <h3>On this device</h3>
      <div class="scroll"><table><tbody>${counts.map(([t, n]) => `<tr><td>${esc(LABELS[t] || t)}</td><td>${n}</td></tr>`).join("")}</tbody></table></div>
      <button class="btn danger" type="button" id="erase">Erase all data on this device</button>
    </section>`;

  $("#dev", main).onchange = e => { const v = e.target.value.trim(); if (v) { db.setLocal("device_name", v); toast("Device name saved."); } else e.target.value = db.deviceName(); };
  $("#export", main).onclick = () => doExport(ctx);
  const fg = $("#fpw-forget", main);
  if (fg) fg.onclick = () => { forgetPassword(); toast("Password forgotten on this phone."); ctx.refresh(); };
  $("#imp", main).onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) doImport(f, ctx); };
  $("#erase", main).onclick = async () => {
    if (!(await ask("Erase every team, player, match and stat on this device? Export a sync file first if Home Base doesn't have it yet.", "Erase", true))) return;
    await db.eraseAll(); lastSummary = null; toast("This device is empty."); ctx.go("team");
  };
}
