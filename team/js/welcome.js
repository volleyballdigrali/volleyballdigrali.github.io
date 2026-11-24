// The welcome a new coach sees: what the app is, installing it (and why), the terms, then getting started.
// Also used on its own when the terms change ("terms"), and replayed from More -> About & terms ("replay").

import * as db from "./db.js";
import { TERMS_VERSION, TERMS_SUMMARY, TERMS_HTML } from "./terms.js";
import { $, esc, sheet } from "./ui.js";

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

export const termsAccepted = () => {
  const a = db.getLocal("terms_accepted");
  return !!a && a.version === TERMS_VERSION;
};
export const showFullTerms = () => sheet({ title: "Terms of use", body: `<div class="terms-full">${TERMS_HTML}</div>`, buttons: [{ label: "Close", value: true, cls: "primary" }] });

function installStep() {
  const what = `<ul class="ob-list">
      <li><b>It goes on your Home Screen</b> like any other app and opens full screen.</li>
      <li><b>It works at the gym with no internet</b> once you've opened it.</li>
      <li><b>Your team's data lives in the installed app on this phone.</b> Using it in Safari or Chrome instead keeps a <i>separate</i> copy, which is the most common way coaches "lose" their data.</li>
      <li><b>Updates are one tap:</b> when a new version comes out, a bar says <b>Update</b>. Your data stays.</li>
      <li>No account, no sign-in, nothing to pay.</li>
    </ul>`;
  if (installed()) return { title: "Installed", html: `<p class="ob-ok">✓ You opened Team from your Home Screen. That's exactly right.</p>${what}`, next: "Next" };
  if (isIOS) return {
    title: "Install it first", next: "Continue in the browser anyway", alt: true,
    html: `<p>Before you set anything up, put Team on your Home Screen. Here's why it matters:</p>${what}
      <ol class="ob-steps">
        ${isSafari ? "" : `<li><b>Open this page in Safari.</b> Installing only works from Safari on an iPhone or iPad.</li>`}
        <li>Tap <b>Share</b> (the square with an arrow, at the bottom of Safari).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Close Safari and open <b>Team</b> from your Home Screen. This welcome starts again there; set up there.</li>
      </ol>` };
  if (isAndroid) return {
    title: "Install it first", next: "Continue in the browser anyway", alt: true,
    html: `<p>Before you set anything up, install Team on your phone. Here's why it matters:</p>${what}
      <ol class="ob-steps">
        <li>In <b>Chrome</b>, tap the <b>⋮</b> menu (top right).</li>
        <li>Tap <b>Install app</b> (or <b>Add to Home screen</b> → <b>Install</b>).</li>
        <li>Open <b>Team</b> from your Home screen. This welcome starts again there; set up there.</li>
      </ol>` };
  return { title: "On a computer", next: "Next",
    html: `<p>On a computer you can use Team right here in your browser. Your data stays in this browser on this computer.</p>
      <p>For match days, put it on your phone too: open <code>${esc(new URL("./", location.href).href)}</code> on the phone (or scan the QR code from <b>More → Share the app</b>) and follow the steps there.</p>` };
}

// mode: "new" | "terms" | "replay". Resolves with "setup" | "new" | "look" | "done".
export function runWelcome(main, mode = "new") {
  return new Promise(resolve => {
    document.body.classList.add("onboarding");
    const prev = db.getLocal("terms_accepted");
    const steps = mode === "terms" ? ["terms"] : mode === "replay" ? ["about", "install", "terms"] : ["about", "install", "terms", "start"];
    let i = 0, agreed = mode === "replay" && termsAccepted();
    const finish = v => { document.body.classList.remove("onboarding"); resolve(v); };

    const draw = () => {
      const k = steps[i];
      let title, html, next = "Next", alt = false;
      if (k === "about") {
        title = "Welcome to Team";
        html = `<img src="icon.png" alt="" class="ob-icon">
          <p class="ob-lead">A free app for volleyball coaches.</p>
          <ul class="ob-list">
            <li><b>Track matches</b> from the bench: serves, passes (0–3), hitting, blocks and sets, tap by tap.</li>
            <li><b>Run the court:</b> lineups, rotations, substitutions and the libero, with playing time counted for you.</li>
            <li><b>See it live:</b> the match-day Board shows who's serving, passing and hitting well right now.</li>
            <li><b>Plan the season:</b> schedule, officiating jobs, scouting other teams' passers, and helpful links.</li>
            <li><b>Your data stays with you,</b> on this phone. Coaches share by sending a file, and an optional program for the PC (Home Base) keeps a master copy and prints reports.</li>
          </ul>`;
      } else if (k === "install") {
        ({ title, html, next = "Next", alt = false } = installStep());
      } else if (k === "terms") {
        title = mode === "terms" && prev ? "Updated terms: please review" : mode === "terms" ? "Terms of use" : "Before you start";
        html = `<p>Team is free and open source. Please read these points; tap below for the full terms.</p>
          <ul class="ob-list">${TERMS_SUMMARY.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
          <button type="button" class="btn small" id="ob-read">Read the full terms</button>
          <label class="ob-agree"><input type="checkbox" id="ob-agree"${agreed ? " checked" : ""}> I have read and agree to the terms of use.</label>`;
        next = mode === "replay" ? "Next" : "I agree";
      } else {
        title = "Get started";
        html = `<label class="field">Name this phone<input type="text" id="dev-name" maxlength="40" placeholder="e.g. Head coach phone" autocomplete="off"></label>
          <p class="muted small" style="margin:0">It appears on files you send, so everyone can tell whose data is whose.</p>
          <div class="ob-choices">
            <button type="button" class="btn primary" data-go="setup"><b>I have a setup file</b><span>from my head coach or club: load the team, players and schedule</span></button>
            <button type="button" class="btn" data-go="new"><b>Start a new team</b><span>set up your own team and roster</span></button>
            <button type="button" class="btn" data-go="look"><b>Just look around</b><span>you can set things up later</span></button>
          </div>
          <p class="ob-err" id="ob-err"></p>`;
      }
      const dots = steps.length > 1 ? `<div class="ob-dots">${steps.map((_, j) => `<span${j === i ? ' class="on"' : ""}></span>`).join("")}</div>` : "";
      const last = k === "start";
      main.innerHTML = `<section class="card ob">${dots}<h2>${esc(title)}</h2>${html}
        <div class="ob-nav">${i > 0 ? `<button type="button" class="btn" id="ob-back">Back</button>` : "<span></span>"}
          ${last ? "" : `<button type="button" class="btn ${alt ? "" : "primary"}" id="ob-next">${esc(next)}</button>`}</div>
        ${mode === "replay" ? `<p class="muted small" style="margin:0;text-align:center"><button type="button" class="linkish" id="ob-close">Close</button></p>` : ""}</section>`;
      window.scrollTo(0, 0);
      $("#ob-back", main) && ($("#ob-back", main).onclick = () => { i--; draw(); });
      $("#ob-close", main) && ($("#ob-close", main).onclick = () => finish("done"));
      $("#ob-read", main) && ($("#ob-read", main).onclick = showFullTerms);
      const box = $("#ob-agree", main), nx = $("#ob-next", main);
      if (box) { const sync = () => { agreed = box.checked; nx.disabled = !box.checked; }; box.onchange = sync; sync(); }
      if (nx) nx.onclick = async () => {
        if (k === "terms" && agreed && !(mode === "replay" && termsAccepted())) await db.setLocal("terms_accepted", { version: TERMS_VERSION, at: new Date().toISOString() });
        if (i < steps.length - 1) { i++; draw(); } else finish("done");
      };
      if (last) for (const b of main.querySelectorAll("[data-go]")) b.onclick = async () => {
        const name = $("#dev-name", main).value.trim();
        if (!name) { $("#ob-err", main).textContent = "Type a name for this phone first."; $("#dev-name", main).focus(); return; }
        await db.setLocal("device_name", name);
        finish(b.dataset.go);
      };
    };
    draw();
  });
}
