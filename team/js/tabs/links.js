// Helpful links: add, edit, open. They travel to other phones in the setup file from Home Base.

import * as db from "../db.js";
import { $, $$, esc, sheet, ask, toast, numSort, copyTable } from "../ui.js";

const normalize = u => { u = u.trim(); if (!u) return ""; return /^[a-z]+:\/\//i.test(u) ? u : "https://" + u; };
const validUrl = u => { if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u) || /\s/.test(u)) return false; try { new URL(u); return true; } catch { return false; } };

async function editLink(ctx, l = null) {
  const cats = [...new Set(db.all("links").map(x => x.category).filter(Boolean))].sort();
  const r = await sheet({
    title: l ? "Edit link" : "Add a link",
    body: `<label class="field">Title<input type="text" id="l-title" value="${esc(l?.title || "")}" maxlength="80" placeholder="e.g. Tournament schedule"></label>
      <label class="field">Web address<input type="url" id="l-url" value="${esc(l?.url || "")}" placeholder="e.g. www.example.com" autocapitalize="off" autocorrect="off"></label>
      <label class="field">Group (optional)<input type="text" id="l-cat" value="${esc(l?.category || "")}" maxlength="40" list="cats" placeholder="e.g. Tournaments, Rules, Club">
        <datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>`,
    buttons: [{ label: "Save", value: "save", cls: "primary" }, ...(l ? [{ label: "Delete", value: "delete" }] : []), { label: "Cancel", value: null }],
    check: (el, v) => v === "delete" ? true : !$("#l-title", el).value.trim() ? "Type a title." : validUrl(normalize($("#l-url", el).value)) ? true : "That web address doesn't look right.",
  });
  if (r.value === "delete") { if (await ask(`Delete the link "${l.title}"?`, "Delete", true)) { db.remove("links", l.id); toast("Link deleted."); ctx.refresh(); } return; }
  if (r.value !== "save") return;
  const f = { title: $("#l-title", r.el).value.trim(), url: normalize($("#l-url", r.el).value), category: $("#l-cat", r.el).value.trim() };
  l ? db.update("links", l.id, f) : db.insert("links", { ...f, sort: db.all("links").length + 1 });
  toast("Link saved."); ctx.refresh();
}

export function render(main, ctx) {
  const links = db.all("links").sort((a, b) => numSort(a.category || "~", b.category || "~") || numSort(a.title, b.title));
  const groups = {};
  for (const l of links) (groups[l.category || "Other"] ||= []).push(l);
  main.innerHTML = `<section class="card">
      <div class="card-head"><h2>Links</h2><span class="grow"></span>
        <button class="btn small primary" type="button" id="add">+ Add link</button></div>
      ${links.length ? "" : `<p class="muted">Keep the web pages you use often in one place: tournament sites, rules, the club calendar. Tap <b>+ Add link</b>.</p>`}
    </section>
    ${Object.entries(groups).map(([g, ls]) => `<section class="card"><h3>${esc(g)}</h3><div class="list">${ls.map(l => `
      <div class="item link-row"><a class="main-txt" href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.title)}</b><span class="sub">${esc(l.url.replace(/^https?:\/\//, ""))}</span></a>
        <button type="button" class="btn small" data-c="${esc(l.id)}">Copy</button><button type="button" class="btn small" data-e="${esc(l.id)}">Edit</button></div>`).join("")}</div></section>`).join("")}`;
  $("#add", main).onclick = () => editLink(ctx);
  for (const b of $$("[data-e]", main)) b.onclick = () => editLink(ctx, db.get("links", b.dataset.e));
  for (const b of $$("[data-c]", main)) b.onclick = async () => {
    const url = db.get("links", b.dataset.c).url;
    toast((await copyTable(esc(url), url)) ? "Link copied. Paste it into any browser." : "Couldn't copy. Press and hold the link instead.");
  };
}
