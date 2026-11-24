// Start-up, navigation, update check and offline support.

import * as db from "./db.js";
import { $, $$, esc, toast, sheet } from "./ui.js";
import { APP_VERSION, RELEASE_NOTES } from "./schema.js";
import * as model from "./model.js";
import * as track from "./tabs/track.js";
import * as schedule from "./tabs/schedule.js";
import * as team from "./tabs/team.js";
import * as stats from "./tabs/stats.js";
import * as syncTab from "./tabs/sync.js";
import * as guide from "./tabs/guide.js";
import * as more from "./tabs/more.js";
import * as courtTab from "./tabs/court.js";
import * as work from "./tabs/work.js";
import * as links from "./tabs/links.js";
import * as board from "./tabs/board.js";
import * as scout from "./tabs/scout.js";
import * as share from "./tabs/share.js";
import * as about from "./tabs/about.js";
import * as rotation from "./tabs/rotation.js";
import { runWelcome, termsAccepted } from "./welcome.js";
import { unlock } from "./lock.js";

// view name -> [render function, bottom tab it belongs to]
const VIEWS = {
  serve:    [m => track.render(m, ctx, "serve"), "serve"],
  receive:  [m => track.render(m, ctx, "receive"), "receive"],
  attack:   [m => track.renderAttack(m, ctx), "attack"],
  schedule: [m => schedule.render(m, ctx), "schedule"],
  more:     [m => more.render(m, ctx), "more"],
  court:    [m => courtTab.render(m, ctx), "more"],
  rotation: [m => rotation.render(m, ctx), "more"],
  team:     [m => team.render(m, ctx), "more"],
  stats:    [m => stats.render(m, ctx), "more"],
  player:   [m => stats.renderCard(m, ctx), "more"],
  work:     [m => work.render(m, ctx), "more"],
  links:    [m => links.render(m, ctx), "more"],
  sync:     [m => syncTab.render(m, ctx), "more"],
  guide:    [m => guide.render(m, ctx), "more"],
  board:    [m => board.render(m, ctx), "more"],
  scout:    [m => scout.render(m, ctx), "more"],
  share:    [m => share.render(m, ctx), "more"],
  about:    [m => about.render(m, ctx), "more"],
  welcome:  [m => runWelcome(m, "replay").then(() => ctx.go("about")), "more"],
};

let view = "serve";
const ctx = {
  go(v) { if (location.hash !== "#" + v) location.hash = v; else show(v); },
  refresh() { show(view); },
  get view() { return view; },
  checkNow: () => checkNow(), updateMessage: r => updateMessage(r),
};

function show(v) {
  if (!VIEWS[v]) v = "serve";
  view = v;
  const main = $("#main");
  main.innerHTML = "";
  VIEWS[v][0](main);
  for (const b of $$(".tabbar button")) b.toggleAttribute("aria-current", b.dataset.tab === VIEWS[v][1]);
  const t = model.currentTeam();
  $("#team-name").textContent = t ? t.name : "";
  const logo = model.clubLogo(), img = $("#club-logo");
  if (logo) { if (img.src !== logo) img.src = logo; img.hidden = false; } else img.hidden = true;
}

function route() {
  const v = (location.hash || "").slice(1);
  show(VIEWS[v] ? v : (model.currentTeam() ? "serve" : "team"));
  window.scrollTo(0, 0);
}

for (const b of $$(".tabbar button")) b.addEventListener("click", () => ctx.go(b.dataset.tab));

// ---------- update check (when served from a web address) ----------
// The bar appears only when the new version is fully published (page and code agree).
// Update fetches a fresh copy of every file before reloading, so nothing old is left behind.
export const FILES = ["./", "./index.html", "./styles.css", "./icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest", "./sw.js",
  "./js/app.js", "./js/db.js", "./js/schema.js", "./js/sync.js", "./js/ui.js", "./js/model.js", "./js/match.js", "./js/court.js",
  "./js/tabs/track.js", "./js/tabs/schedule.js", "./js/tabs/team.js", "./js/tabs/stats.js", "./js/tabs/sync.js",
  "./js/tabs/more.js", "./js/tabs/guide.js", "./js/tabs/court.js", "./js/tabs/work.js", "./js/tabs/links.js",
  "./js/tabs/board.js", "./js/tabs/scout.js", "./js/tabs/share.js", "./js/qr.js", "./js/tabs/about.js", "./js/welcome.js", "./js/terms.js", "./js/tabs/rotation.js", "./js/planui.js", "./js/levels.js", "./js/gauge.js", "./js/lock.js", "./js/filelock.js", "../intro.js"];
const hosted = /^https?:$/.test(location.protocol);
async function siteVersions() {
  const [a, b] = await Promise.all([
    fetch("./index.html", { cache: "reload" }).then(r => (r.ok ? r.text() : "")),
    fetch("./js/schema.js", { cache: "reload" }).then(r => (r.ok ? r.text() : "")),
  ]);
  return { page: a.match(/id="ver">(v[\w.]+)</)?.[1] || null, code: b.match(/APP_VERSION = "(v[\w.]+)"/)?.[1] || null };
}
const showBar = v => { $("#update-text").textContent = `New version available (${v})`; $("#update").hidden = false; };
async function checkForUpdate() {
  if (!hosted || document.visibilityState !== "visible") return;
  try {
    const { page, code } = await siteVersions();
    if (page && page === code && page !== APP_VERSION) showBar(page);
  } catch {}
}
// "Check for updates" (More, and More -> About & terms): says what it found instead of staying quiet.
// -> { state: "current" | "new" | "publishing" | "offline" | "local", version }
export async function checkNow() {
  if (!hosted) return { state: "local" };
  let r;
  try { r = await siteVersions(); } catch { return { state: "offline" }; }
  if (!r.page && !r.code) return { state: "offline" };
  if (r.page !== r.code) return { state: "publishing", version: [r.page, r.code].find(v => v && v !== APP_VERSION) || r.code };
  if (r.page === APP_VERSION) return { state: "current", version: APP_VERSION };
  showBar(r.page);
  return { state: "new", version: r.page };
}
export const updateMessage = r => ({
  current: `You're up to date (${APP_VERSION}).`,
  new: `${r.version} is available. Tap Update at the bottom of the screen.`,
  publishing: `A new version${r.version ? " (" + r.version + ")" : ""} is still being published. Try again in a minute or two.`,
  offline: "Couldn't reach the web site. Check the internet connection and try again.",
  local: "This copy isn't running from the web site, so there's nothing to check.",
}[r.state]);
$("#update-btn").addEventListener("click", async () => {
  const btn = $("#update-btn"); btn.disabled = true; btn.textContent = "Updating…";
  try {
    await Promise.all(FILES.map(f => fetch(f, { cache: "reload" }).catch(() => {})));
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith("vbteam-")) await caches.delete(k);
    const reg = await navigator.serviceWorker?.getRegistration?.(); await reg?.update?.();
  } catch {}
  location.reload();
});

// ---------- what's new ----------
const vparts = v => String(v || "").replace(/^v/, "").split(".").map(n => +n || 0);
const newer = (a, b) => { const x = vparts(a), y = vparts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
function showNotes(since) {
  const list = RELEASE_NOTES.filter(([v]) => (since ? newer(v, since) : true) && !newer(v, APP_VERSION)).slice(0, since ? 99 : 4);
  if (!list.length) return;
  return sheet({ title: since ? `What's new in ${APP_VERSION}` : "What's new",
    body: list.map(([v, notes]) => `<h3 class="wn-v">${esc(v)}</h3><ul class="wn">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`).join(""),
    buttons: [{ label: "OK", value: true, cls: "primary" }] });
}

// ---------- the app moved (v1.13): shown on the old address only ----------
const NEW_HOME = "https://volleyballdigrali.github.io/team/";
const onOldSite = location.hostname === "pbbergs.github.io";
async function movedNotice(ctx) {
  const r = await sheet({ title: "The Team app has moved",
    body: `<p class="small" style="margin:0">Its new address is <b>volleyballdigrali.github.io/team</b>. This old one will stop getting updates.
      Your data stays on this phone, but the new address starts empty, so bring it along:</p>
      <ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
        <li><b>Export sync file</b> here (Sync), and send it to yourself or to Home Base.</li>
        <li>Open the new address in ${/Android/i.test(navigator.userAgent) ? "Chrome" : "Safari"} and add it to the Home Screen.</li>
        <li>In the new app, More → Sync → <b>Import file</b> and choose that file (or the setup file from Home Base).</li>
        <li>Only once the new app shows your team, remove this old icon.</li>
      </ol>
      <p class="small" style="margin:0"><a href="${NEW_HOME}" target="_blank" rel="noopener">Open the new address</a></p>`,
    buttons: [{ label: "Later", value: null }, { label: "Export now", value: "export", cls: "primary" }] });
  if (r.value === "export") location.hash = "sync";
}

// ---------- export reminder: 30 days without sending data to Home Base ----------
const DAY = 864e5;
function exportReminder() {
  if (!db.getLocal("first_seen")) db.setLocal("first_seen", db.now());
  if (!db.all("actions").length) return;                                     // nothing recorded yet
  const m = model.currentMatch(); if (m && m.status === "in progress") return; // never during a match
  const since = Date.parse(db.getLocal("last_export") || db.getLocal("first_seen")) || Date.now();
  const days = Math.floor((Date.now() - since) / DAY);
  const today = new Date().toDateString();
  if (days < 30 || db.getLocal("export_nag") === today) return;
  db.setLocal("export_nag", today);                                          // at most once a day
  return sheet({ title: "Time to send your data",
    body: `<p class="small" style="margin:0">${db.getLocal("last_export") ? `It's been ${days} days since this phone's data was exported.` : "This phone's data hasn't been exported yet."}
      Export a sync file and send it to Home Base, so nothing is lost if the phone is lost or replaced.</p>`,
    buttons: [{ label: "Later", value: null }, { label: "Export now", value: "export", cls: "primary" }] })
    .then(r => { if (r.value === "export") location.hash = "sync"; });
}

// ---------- start ----------
async function boot() {
  $("#ver").textContent = APP_VERSION;
  await unlock();                                   // the team password, before anything else
  if (hosted) $("#home-link").hidden = false;
  await db.open(msg => toast(msg));
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"))
    navigator.serviceWorker.register("sw.js").catch(() => {});
  document.addEventListener("visibilitychange", checkForUpdate);
  setTimeout(checkForUpdate, 2000);
  // A new phone gets the full welcome; an existing one only sees the terms when they are new or have changed.
  const brandNew = !db.getLocal("device_name");
  let start = null;
  if (brandNew) start = await runWelcome($("#main"), "new");
  else if (!termsAccepted()) await runWelcome($("#main"), "terms");
  if (start === "setup") location.hash = "sync";
  else if (start === "new") location.hash = "team";
  window.addEventListener("hashchange", route);
  route();
  if (start === "setup") toast("Tap Import file and choose the setup file you were sent.");
  if (start === "new") toast("Tap Create a team to get started.");
  // Once per update: show what changed since the version this device last saw (not on a brand-new device).
  const seen = db.getLocal("seen_version");
  const notes = !brandNew && seen !== APP_VERSION ? showNotes(seen || RELEASE_NOTES.find(([v]) => newer(APP_VERSION, v))?.[0] || "v0") : null;
  if (seen !== APP_VERSION) db.setLocal("seen_version", APP_VERSION);
  $("#ver").setAttribute("role", "button"); $("#ver").title = "What's new";
  $("#ver").addEventListener("click", () => showNotes(null));
  await notes;                                      // one message at a time
  if (onOldSite) await movedNotice();
  else if (!brandNew && !start) await exportReminder();
}
boot();

export { ctx, esc };
