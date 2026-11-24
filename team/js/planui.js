// The popup after Rotate (or a side out, or losing the serve) made planned substitutions: OK, or Undo just those subs.

import * as court from "./court.js";
import * as model from "./model.js";
import { esc, sheet, toast } from "./ui.js";

export function nameOf(m, pid) {
  const entries = model.rosterFor(m.team_id), e = entries.find(x => x.p.id === pid);
  return e ? `#${e.r.number ?? ""} ${model.shortNames(entries)[pid]}` : "a player no longer on the roster";
}
export function swapText(m, w) {
  if (w.move) return `Libero ${nameOf(m, w.inPid)} moves from position ${w.from} to position ${w.pos} for ${nameOf(m, w.outPid)}${w.pos === 1 ? " (to serve)" : ""}`;
  if (w.ret) return `${nameOf(m, w.inPid)} back in at position ${w.pos} (for the libero)`;
  const lib = model.isLibero(m.team_id, w.inPid) ? "Libero " : "";
  return `${lib}${nameOf(m, w.inPid)} in for ${nameOf(m, w.outPid)} (position ${w.pos})`;
}

export async function showSwaps(m, r, ctx, head = "Rotated") {
  const swaps = r?.swaps || [], notes = r?.notes || [];
  if (!swaps.length && !notes.length) return;
  const s = court.state(m);
  const res = await sheet({
    title: swaps.length ? `${head}: planned subs` : head,
    body: `${swaps.length ? `<ul class="swap-list">${swaps.map(w => `<li><b>${esc(swapText(m, w))}</b>${w.counted ? "" : ' <span class="muted small">(libero, not counted)</span>'}</li>`).join("")}</ul>` : ""}
      ${notes.map(n => `<p class="notice" style="margin:6px 0">${esc(n)}</p>`).join("")}
      <p class="muted small" style="margin:0">Subs used: ${s.subs} of ${court.SUB_LIMIT}.</p>`,
    buttons: swaps.length ? [{ label: "OK", value: "ok", cls: "primary" }, { label: "Undo these subs", value: "undo" }] : [{ label: "OK", value: "ok", cls: "primary" }],
  });
  if (res.value === "undo") {
    court.undoLineup(m, court.state(m));
    toast("Subs undone. The rotation stays.");
    ctx.refresh();
  }
}
