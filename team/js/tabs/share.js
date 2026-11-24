// Share the app: a QR code another coach scans from this screen, a Share link button, and the install steps.
// Only the app's web address is shared here, never team data.

import { qrSvg } from "../qr.js";
import { $, esc, toast } from "../ui.js";

const PUBLIC_URL = "https://volleyballdigrali.github.io/team/";
const HB_URL = "https://volleyballdigrali.github.io/home-base/";
const appUrl = () => (/^https:$/.test(location.protocol) ? new URL("./", location.href).href : PUBLIC_URL);

export function render(main) {
  const url = appUrl();
  main.innerHTML = `<section class="card share">
      <h2>Share the app</h2>
      <p class="small" style="margin:0">Have the other coach point their phone's <b>camera</b> at this code and tap the link.</p>
      <div class="share-qr">${qrSvg(url)}</div>
      <p class="muted small share-url">${esc(url)}</p>
      <button class="btn primary" type="button" id="share-link">Share link…</button>
    </section>
    <section class="card">
      <h3>Then, on their phone</h3>
      <ol class="share-steps">
        <li><b>iPhone:</b> it opens in Safari. Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.</li>
        <li><b>Android:</b> it opens in Chrome. Tap <b>⋮</b> → <b>Install app</b>.</li>
        <li>Open <b>Team</b> from the Home Screen, enter the <b>team password</b> (tell them yourself, not in the same message as the link), and give the phone a name.</li>
        <li>To load your team: send them the setup file from Home Base (Dashboard → <b>Download setup file</b>), or your phone's data from <b>More → Sync → Export</b>. They import it on <b>More → Sync → Import file</b>.</li>
      </ol>
      <p class="small" style="margin:0">Running Home Base for the club? Setup steps and downloads: <a href="${esc(HB_URL)}" target="_blank" rel="noopener">${esc(HB_URL.replace(/^https:\/\//, ""))}</a></p>
      <p class="muted small" style="margin:0">The code only carries the app's address. Team data goes only to the people you send it to.</p>
    </section>`;
  $("#share-link", main).onclick = async () => {
    const text = "The Team volleyball app. Open this link on your phone, then add it to your Home Screen (iPhone: Safari → Share → Add to Home Screen; Android: Chrome → ⋮ → Install app).";
    try {
      if (navigator.share) { await navigator.share({ title: "Team app", text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Link copied. Paste it into a text or email."); }
    catch { toast(url); }
  };
}
