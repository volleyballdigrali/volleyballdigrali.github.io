// Small screen helpers. No browser alert/confirm/prompt anywhere: pop-ups are built in the page.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// sheet({title, body, buttons:[{label, value, cls}], onOpen(el), check(el, value) -> true | "message"})
// Resolves to { value, el } (value null when cancelled).
export function sheet({ title = "", body = "", buttons = [{ label: "OK", value: true, cls: "primary" }], onOpen, check }) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "sheet";
    wrap.innerHTML = `<div class="card sheet-card" role="dialog" aria-modal="true">
      ${title ? `<h2>${esc(title)}</h2>` : ""}
      <div class="sheet-body">${body}</div>
      <p class="sheet-err" hidden></p>
      <div class="sheet-btns">${buttons.map((b, i) =>
        `<button type="button" class="btn ${b.cls || ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>
    </div>`;
    document.body.appendChild(wrap);
    const done = value => { wrap.remove(); document.removeEventListener("keydown", key); resolve({ value, el: wrap }); };
    const key = e => { if (e.key === "Escape") done(null); };
    document.addEventListener("keydown", key);
    wrap.addEventListener("click", e => {
      if (e.target === wrap) return done(null);
      const b = e.target.closest("[data-i]"); if (!b) return;
      const v = buttons[+b.dataset.i].value;
      if (v != null && check) {
        const r = check(wrap, v);
        if (r !== true) { const p = $(".sheet-err", wrap); p.textContent = r || "Check the entries above."; p.hidden = false; return; }
      }
      done(v);
    });
    if (onOpen) onOpen(wrap);
    const first = $("input:not([type=checkbox]), select, textarea", wrap);
    setTimeout(() => (first || $(".btn.primary", wrap) || $(".btn", wrap))?.focus(), 30);
  });
}

export async function ask(message, yes = "Yes", danger = false) {
  const r = await sheet({ body: `<p class="sheet-msg">${esc(message)}</p>`,
    buttons: [{ label: yes, value: true, cls: danger ? "danger" : "primary" }, { label: "Cancel", value: null }] });
  return r.value === true;
}
export const say = message => sheet({ body: `<p class="sheet-msg">${esc(message)}</p>` });

// Give the viewer a file: the Share sheet on phones and tablets, the Downloads folder on computers.
// Returns false if the viewer cancelled.
export async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  try {
    const file = new File([blob], name, { type });
    if (mobile && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e?.name === "AbortError") return false; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

// Copy a table to the clipboard as HTML (pastes into email as a table) with a plain-text fallback.
export async function copyTable(html, text) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return true;
    }
  } catch {}
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const box = document.createElement("div"); box.contentEditable = "true"; box.innerHTML = html;
    box.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(box);
    const r = document.createRange(); r.selectNodeContents(box);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const ok = document.execCommand("copy"); sel.removeAllRanges(); box.remove();
    return ok;
  } catch { return false; }
}

// ---------- formatting ----------
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const parseDate = s => (s ? new Date(s + "T12:00:00") : null);
export const dayName = (s, short = false) => { const d = parseDate(s); if (!d || isNaN(d)) return ""; const n = DAYS[d.getDay()]; return short ? n.slice(0, 3) : n; };
export const fmtDate = (s, opts = { month: "short", day: "numeric", year: "numeric" }) => {
  const d = parseDate(s); return d && !isNaN(d) ? d.toLocaleDateString(undefined, opts) : "";
};
export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export const today = () => new Date().toLocaleDateString("en-CA");
export const numSort = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
