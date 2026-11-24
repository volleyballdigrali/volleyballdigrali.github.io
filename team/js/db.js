// On-device database: one IndexedDB store per table, plus a "local" store for this device's own
// settings (device name, current team, current match), which are never synced.
// All rows are also kept in memory, so screens read instantly; every change is written through.

import { TABLES, COMMON, SCHEMA_VERSION, DUTIES, DROPPED } from "./schema.js";

const DB_NAME = "vbteam";
const mem = {};            // table -> Map(id -> row)
const local = new Map();   // key -> value
let idb = null;
let onError = () => {};

export const now = () => new Date().toISOString();

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function open(errorHandler) {
  if (errorHandler) onError = errorHandler;
  for (const t of Object.keys(TABLES)) mem[t] = new Map();
  try {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const t of [...Object.keys(TABLES), "local"])
          if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: t === "local" ? "key" : "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("blocked"));
    });
    const tx = idb.transaction([...Object.keys(TABLES), "local"], "readonly");
    for (const t of Object.keys(TABLES)) for (const row of await req(tx.objectStore(t).getAll())) mem[t].set(row.id, row);
    for (const { key, value } of await req(tx.objectStore("local").getAll())) local.set(key, value);
  } catch (e) {
    idb = null;
    onError("This device can't save data right now (private browsing?). Changes will be lost when the app closes.");
  }
  try { navigator.storage?.persist?.(); } catch {}
  // fields no longer kept (players' birth date and age): erase them from this device
  for (const [t, cols] of Object.entries(DROPPED))
    for (const row of mem[t].values())
      if (cols.some(c => c in row)) { for (const c of cols) delete row[c]; await putRaw(t, row); }
  // shared fixed rows
  for (const d of DUTIES) if (!mem.duties.has(d.id)) await putRaw("duties", { ...d });
  if (!getLocal("device_id")) setLocal("device_id", uuid());
  return !!idb;
}

function write(store, value, del) {
  if (!idb) return Promise.resolve();
  return new Promise(res => {
    try {
      const tx = idb.transaction(store, "readwrite");
      del ? tx.objectStore(store).delete(value) : tx.objectStore(store).put(value);
      tx.oncomplete = () => res();
      tx.onerror = tx.onabort = () => { onError("Couldn't save the last change on this device."); res(); };
    } catch { onError("Couldn't save the last change on this device."); res(); }
  });
}

// ---------- this device's own settings (not synced) ----------
export const getLocal = (k, d = null) => (local.has(k) ? local.get(k) : d);
export function setLocal(k, v) { local.set(k, v); return write("local", { key: k, value: v }); }

// ---------- synced tables ----------
export const deviceName = () => getLocal("device_name") || "Phone";
const stamp = () => getLocal("device_name") || getLocal("device_id") || "device";

export function all(table, { withDeleted = false } = {}) {
  const out = [];
  for (const r of mem[table].values()) if (withDeleted || !r.deleted) out.push(r);
  return out;
}
export const get = (table, id) => { const r = mem[table].get(id); return r && !r.deleted ? r : null; };
export const getAny = (table, id) => mem[table].get(id) || null;
export const where = (table, fn) => all(table).filter(fn);

export function insert(table, fields) {
  const t = now();
  const row = { id: uuid(), created_at: t, updated_at: t, device: stamp(), deleted: 0 };
  for (const c of TABLES[table]) row[c] = fields[c] ?? null;
  for (const [k, v] of Object.entries(fields)) if (!(k in row)) row[k] = v;   // keep extra fields
  mem[table].set(row.id, row);
  write(table, row);
  return row;
}

export function update(table, id, patch) {
  const old = mem[table].get(id);
  if (!old) return null;
  const row = { ...old, ...patch, updated_at: now(), device: stamp() };
  mem[table].set(id, row);
  write(table, row);
  return row;
}

// Deleting leaves a marker (deleted = 1) so the deletion reaches every other device.
export const remove = (table, id) => update(table, id, { deleted: 1 });

// Used by sync: store a row exactly as received.
export function putRaw(table, row) { mem[table].set(row.id, row); return write(table, row); }

export const tableNames = () => Object.keys(TABLES);
export const commonCols = COMMON;

export async function eraseAll() {
  for (const t of Object.keys(TABLES)) {
    for (const id of [...mem[t].keys()]) await write(t, id, true);
    mem[t].clear();
  }
  for (const d of DUTIES) await putRaw("duties", { ...d });
  for (const k of [...local.keys()]) if (!["device_id", "device_name"].includes(k)) { local.delete(k); await write("local", k, true); }
}
