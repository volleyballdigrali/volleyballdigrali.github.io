// Team password: a simple slow-down, asked every time the app is opened (and again after 5 minutes away).
// Only a fingerprint (SHA-256 hash) of the password is stored here, never the password itself.
// Capital letters and spaces at the ends don't matter.
// To change the password: put a new SALT and HASH here (hash of SALT + ":" + the password in lower case).
// To turn the password off: set ON to false. Nothing else changes.

const ON = true;
const SALT = "d80ed657174b736f";
const HASH = "62a59459a4d84e2cbf603670f797aef20d5a5aba368b97daa4dfd5d503f5a13b";
const GRACE = 5 * 60 * 1000;          // back within 5 minutes = no need to type it again
const KEY = "vbd-unlock";             // when the app was last open and unlocked (this launch only)
try { const o = sessionStorage.getItem("vbt-unlock"); if (o) { if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, o); sessionStorage.removeItem("vbt-unlock"); } } catch {}   // older name

const now = () => Date.now();
const stamp = () => { try { sessionStorage.setItem(KEY, String(now())); } catch {} };
const lastSeen = () => { try { return +sessionStorage.getItem(KEY) || 0; } catch { return 0; } };
const fresh = () => now() - lastSeen() < GRACE;

async function matches(pw) {
  if (!(crypto && crypto.subtle)) return true;   // very old browsers: let them in (it's only a slow-down)
  const bytes = new TextEncoder().encode(`${SALT}:${pw.trim().toLowerCase()}`);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("") === HASH;
}

let showing = null;
function show() {
  if (showing) return showing;
  showing = new Promise(resolve => {
    const el = document.createElement("div");
    el.className = "lock"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "lock-h");
    el.innerHTML = `<form class="lock-card" autocomplete="off">
        <img class="ob-icon" src="icon.png" alt="">
        <h2 id="lock-h">Team</h2>
        <p class="muted" style="margin:0">Enter the team password to open the app.</p>
        <input id="lock-pw" class="lock-pw" type="password" aria-label="Team password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">
        <label class="lock-show"><input type="checkbox" id="lock-see"> Show password</label>
        <button class="btn primary lock-go" type="submit">Open</button>
        <p class="lock-err" id="lock-err" role="alert"></p>
        <p class="muted small" style="margin:0">Ask your head coach for the password.</p>
      </form>`;
    document.documentElement.appendChild(el);
    document.body.inert = true;
    const pw = el.querySelector("#lock-pw"), err = el.querySelector("#lock-err");
    el.querySelector("#lock-see").onchange = e => { pw.type = e.target.checked ? "text" : "password"; };
    el.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      if (await matches(pw.value)) {
        stamp(); document.body.inert = false; el.remove(); showing = null; resolve();
      } else {
        err.textContent = "That's not it. Try again."; pw.select();
        el.querySelector(".lock-card").classList.remove("shake"); void el.offsetWidth; el.querySelector(".lock-card").classList.add("shake");
      }
    };
    setTimeout(() => pw.focus(), 50);
  });
  return showing;
}

// Resolves once the app may be used. Call before anything else is shown.
export function unlock() {
  if (!ON) return Promise.resolve();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { if (!showing) stamp(); }
    else if (!showing && !fresh()) show();
  });
  setInterval(() => { if (!showing && document.visibilityState === "visible") stamp(); }, 30000);
  if (fresh()) { stamp(); return Promise.resolve(); }
  return show();
}
