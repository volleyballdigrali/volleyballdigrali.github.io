// Sync file: one JSON file with every row of every table, including deleted-row markers.
// Merge rules (same as Home Base on the PC):
//   new id -> add;  same id and newer updated_at -> replace;  otherwise -> skip.
// Nothing is removed because a file doesn't mention it, and importing the same file twice changes nothing.

import * as db from "./db.js";
import { APP_VERSION, SCHEMA_VERSION, SYNC_FORMAT, SYNC_FORMAT_VERSION, DROPPED } from "./schema.js";

export function buildExport() {
  const tables = {};
  for (const t of db.tableNames()) tables[t] = db.all(t, { withDeleted: true });
  return {
    format: SYNC_FORMAT,
    format_version: SYNC_FORMAT_VERSION,
    schema_version: SCHEMA_VERSION,
    app_version: APP_VERSION,
    device_id: db.getLocal("device_id"),
    device_name: db.deviceName(),
    exported_at: db.now(),
    tables,
  };
}

export function exportFileName() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const who = db.deviceName().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "device";
  return `vb-sync-${who}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

const validRow = r => r && typeof r === "object" && typeof r.id === "string" && r.id &&
  typeof r.updated_at === "string" && r.updated_at;

// Returns { ok, error?, from, tables: {name: {added, updated, skipped, invalid}}, unknown: [...] }
export async function importData(data) {
  if (!data || data.format !== SYNC_FORMAT || typeof data.tables !== "object")
    return { ok: false, error: "This isn't a Team app sync file." };
  if ((data.format_version || 0) > SYNC_FORMAT_VERSION)
    return { ok: false, error: "This file came from a newer version of the app. Update the app, then import it again." };
  const summary = { ok: true, from: data.device_name || "another device", exported_at: data.exported_at, tables: {}, unknown: [] };
  const known = new Set(db.tableNames());
  for (const [t, rows] of Object.entries(data.tables)) {
    if (!known.has(t)) { summary.unknown.push(t); continue; }
    const s = { added: 0, updated: 0, skipped: 0, invalid: 0 };
    for (const r0 of Array.isArray(rows) ? rows : []) {
      if (!validRow(r0)) { s.invalid++; continue; }
      const r = { ...r0 }; for (const c of DROPPED[t] || []) delete r[c];   // e.g. birth date and age from older versions
      const mine = db.getAny(t, r.id);
      if (!mine) { await db.putRaw(t, { ...r }); s.added++; }
      else if (r.updated_at > (mine.updated_at || "")) { await db.putRaw(t, { ...r }); s.updated++; }
      else s.skipped++;
    }
    summary.tables[t] = s;
  }
  await db.setLocal("last_import", { at: db.now(), from: summary.from });
  return summary;
}

export async function readFile(file) {
  const text = await file.text();
  try { return JSON.parse(text.replace(/^﻿/, "")); } catch { return null; }
}
