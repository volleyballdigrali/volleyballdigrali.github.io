// Locked sync and setup files: the same format as Home Base (home_base.py, "locked files").
// A random 64-byte data key encrypts the content: HMAC-SHA256 in counter mode for the keystream, then an HMAC-SHA256
// tag over nonce + ciphertext. The data key is stored once per password ("slot"), wrapped with a key made from that
// password by PBKDF2-SHA256 (200,000 rounds) with its own random salt. Fresh random keys for every file.
// No password is built in: the club sets its own on Home Base, and this phone can remember it.

import { sheet, esc, $ } from "./ui.js";

export const LOCK_FORMAT = "vbteam-locked";
const ITER = 200000;
const enc = new TextEncoder(), dec = new TextDecoder();
const te = s => enc.encode(s);

// ---------- SHA-256 (for the fast keystream; PBKDF2 and the tags use the phone's built-in Web Crypto) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const IV = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const Wbuf = new Uint32Array(64);
function compress(st, blk) {             // st: Uint32Array(8) (not changed), blk: Uint32Array(16) -> new state
  const w = Wbuf;
  for (let i = 0; i < 16; i++) w[i] = blk[i];
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15], b = w[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  return new Uint32Array([st[0] + a, st[1] + b, st[2] + c, st[3] + d, st[4] + e, st[5] + f, st[6] + g, st[7] + h]);
}
const words = (u8, off = 0, n = 16) => { const w = new Uint32Array(n); for (let i = 0; i < n; i++) { const j = off + 4 * i; w[i] = (u8[j] << 24) | (u8[j + 1] << 16) | (u8[j + 2] << 8) | u8[j + 3]; } return w; };

// HMAC-SHA256(key, nonce || counter) for counter = 0, 1, 2…, cut to n bytes. Key: 32 bytes, nonce: 16 bytes.
function keystream(key, nonce, n) {
  const pad = (x) => { const b = new Uint8Array(64).fill(x); for (let i = 0; i < key.length; i++) b[i] ^= key[i]; return words(b); };
  const ist = compress(IV, pad(0x36)), ost = compress(IV, pad(0x5c));
  const nw = words(nonce, 0, 4), out = new Uint8Array(Math.ceil(n / 32) * 32);
  const inner = new Uint32Array(16), outer = new Uint32Array(16);
  inner.set(nw); inner[5] = 0x80000000; inner[15] = (64 + 20) * 8;
  outer[8] = 0x80000000; outer[15] = (64 + 32) * 8;
  for (let i = 0, o = 0; o < n; i++, o += 32) {
    inner[4] = i;
    outer.set(compress(ist, inner));
    const r = compress(ost, outer);
    for (let k = 0; k < 8; k++) { const v = r[k]; out[o + 4 * k] = v >>> 24; out[o + 4 * k + 1] = (v >>> 16) & 255; out[o + 4 * k + 2] = (v >>> 8) & 255; out[o + 4 * k + 3] = v & 255; }
  }
  return out.subarray(0, n);
}
const xor = (a, b) => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; };
const cat = (...xs) => { const o = new Uint8Array(xs.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const b64e = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => { const b = atob(String(s)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
const pwBytes = pw => te(String(pw || "").trim().normalize("NFC"));
async function kek(pw, salt, iter) {
  const k = await crypto.subtle.importKey("raw", pwBytes(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, k, 512));
}

export class LockError extends Error {}

export async function lockData(obj, passwords, kind) {
  const data = te(JSON.stringify(obj));
  const dk = rand(64), nonce = rand(16);
  const ct = xor(data, keystream(dk.subarray(0, 32), nonce, data.length));
  const mac = await hmac(dk.subarray(32), cat(te("vbteam-locked-v1"), nonce, ct));
  const slots = [];
  for (const pw of passwords) {
    const salt = rand(16), sn = rand(16), k = await kek(pw, salt, ITER);
    const w = xor(dk, keystream(k.subarray(0, 32), sn, 64));
    slots.push({ salt: b64e(salt), nonce: b64e(sn), key: b64e(w), mac: b64e(await hmac(k.subarray(32), cat(te("vbteam-slot-v1"), salt, sn, w))) });
  }
  return { format: LOCK_FORMAT, v: 1, kind, kdf: { alg: "pbkdf2-sha256", iter: ITER }, slots, nonce: b64e(nonce), ct: b64e(ct), mac: b64e(mac) };
}

// Returns { data, index }. Throws LockError("password"), ("damaged") or ("newer").
export async function unlockData(env, passwords) {
  let it, nonce, ct, mac, slots;
  try {
    if ((+env.v || 0) > 1) throw new LockError("newer");
    it = +env.kdf.iter; if (!(it >= 1000 && it <= 10000000)) throw new LockError("damaged");
    nonce = b64d(env.nonce); ct = b64d(env.ct); mac = b64d(env.mac);
    slots = env.slots.map(x => [b64d(x.salt), b64d(x.nonce), b64d(x.key), b64d(x.mac)]);
  } catch (e) { throw e instanceof LockError ? e : new LockError("damaged"); }
  const pws = passwords.filter(Boolean);
  for (let i = 0; i < pws.length; i++) {
    for (const [salt, sn, w, sm] of slots) {
      const k = await kek(pws[i], salt, it);
      if (!same(await hmac(k.subarray(32), cat(te("vbteam-slot-v1"), salt, sn, w)), sm)) continue;
      const dk = xor(w, keystream(k.subarray(0, 32), sn, 64));
      if (!same(await hmac(dk.subarray(32), cat(te("vbteam-locked-v1"), nonce, ct)), mac)) throw new LockError("damaged");
      try { return { data: JSON.parse(dec.decode(xor(ct, keystream(dk.subarray(0, 32), nonce, ct.length)))), index: i }; }
      catch { throw new LockError("damaged"); }
    }
  }
  throw new LockError("password");
}

// ---------- the club password on this phone ----------
const KEY = "vbd-file-pw";
try { const o = localStorage.getItem("vbt-file-pw"); if (o) { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, o); localStorage.removeItem("vbt-file-pw"); } } catch {}   // older name
let memPw = null;
export function savedPassword() { try { return localStorage.getItem(KEY) || memPw; } catch { return memPw; } }
export function isRemembered() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function setPassword(pw, remember) {
  memPw = pw;
  try { if (remember) localStorage.setItem(KEY, pw); else localStorage.removeItem(KEY); } catch {}
}
export function forgetPassword() { memPw = null; try { localStorage.removeItem(KEY); } catch {} }

// Ask for the password. Returns { pw, remember } or null.
async function askPassword(title, why, err) {
  const r = await sheet({ title,
    body: `<p class="small" style="margin:0">${esc(why)}</p>
      ${err ? `<p class="small" style="margin:0;color:var(--red);font-weight:600">${esc(err)}</p>` : ""}
      <label class="field">Club file password<input type="password" id="fpw" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
      <label class="chk"><input type="checkbox" id="fpw-see"> Show password</label>
      <label class="chk"><input type="checkbox" id="fpw-rem" ${isRemembered() || !savedPassword() ? "checked" : ""}> Remember on this phone</label>`,
    buttons: [{ label: "Cancel", value: null }, { label: "OK", value: true, cls: "primary" }],
    onOpen: el => { $("#fpw-see", el).onchange = e => { $("#fpw", el).type = e.target.checked ? "text" : "password"; };
                    $("#fpw", el).addEventListener("keydown", e => { if (e.key === "Enter") $(".btn.primary", el).click(); }); },
    check: el => ($("#fpw", el).value.trim() ? true : "Type the password.") });
  if (!r.value) return null;
  return { pw: $("#fpw", r.el).value.trim(), remember: $("#fpw-rem", r.el).checked };
}

export const MESSAGES = {
  plain: "This file isn't locked, so it was not imported. Every file must come from an up-to-date Team app or Home Base: update the one that made it, then export it again.",
  notours: "That file couldn't be read. Make sure it's a sync or setup file exported from the Team app or Home Base.",
  damaged: "This file is damaged or was changed after it was made, so it can't be trusted. Ask for it to be exported again.",
  newer: "This file came from a newer version. Update the app, then import it again.",
};

// Open a received file: unlock it (asking for the password if needed). Returns the sync data, or throws LockError.
export async function openFile(obj) {
  if (obj && obj.format === "vbteam-sync") throw new LockError("plain");
  if (!obj || obj.format !== LOCK_FORMAT) throw new LockError("notours");
  let pw = savedPassword(), remember = isRemembered(), err = "";
  if (pw) {
    try { const { data } = await unlockData(obj, [pw]); return adopt(data, pw, remember); }
    catch (e) { if (e.message !== "password") throw e; err = "The password saved on this phone didn't open this file. It may have been changed: ask your head coach for the new one."; }
  }
  for (;;) {
    const a = await askPassword("Locked file", "Sync and setup files are locked with the club's file password. Your head coach has it.", err);
    if (!a) throw new LockError("cancel");
    try { const { data } = await unlockData(obj, [a.pw]); return adopt(data, a.pw, a.remember); }
    catch (e) { if (e.message !== "password") throw e; err = "That's not the password for this file. Try again."; }
  }
}
function adopt(data, pw, remember) {
  // A setup file from Home Base carries the current club password (inside the lock), so a change reaches every phone.
  const next = data && typeof data.club_password === "string" && data.club_password ? data.club_password : pw;
  if (data) delete data.club_password;
  setPassword(next, remember || isRemembered());
  return data;
}

// Lock this phone's export with the club password (asking for it the first time).
export async function lockForExport(obj) {
  let pw = savedPassword();
  if (!pw) {
    const a = await askPassword("Club file password", "Sync files are locked with the club's file password, so only your club can open them. Your head coach has it (it's set on Home Base).", "");
    if (!a) return null;
    setPassword(a.pw, a.remember); pw = a.pw;
  }
  return lockData(obj, [pw], "sync");
}
