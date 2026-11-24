// Rotation tab: the wheel (who is where, who goes in for who) and the substitution plan that Rotate follows.

import * as model from "../model.js";
import * as court from "../court.js";
import { renderBar } from "../match.js";
import { nameOf, swapText } from "../planui.js";
import { $, $$, esc, sheet, toast, ask } from "../ui.js";

// Fixed court positions around the wheel, clockwise (the way players rotate): front row on top.
const ANGLE = { 4: -150, 3: -90, 2: -30, 1: 30, 6: 90, 5: 150 };
// Tracker-card colours. They belong to the spots and turn with the players: when play starts,
// position 1 (the first server) is red, the front row (4, 3, 2) green, and positions 5 and 6 white.
const START_COLOR = { 1: "red", 2: "green", 3: "green", 4: "green", 5: "white", 6: "white" };
const FILL = { red: "#c3262e", green: "#1d7a3e", white: "#eef1f4" };
export const startPos = (pos, rot) => ((((pos - 1 + rot) % 6) + 6) % 6) + 1;   // where the spot now at `pos` started the set
const roleOf = (m, pid) => (pid ? model.teamPos(m.team_id, pid) || "" : "");
const WHEN = { serve: "to serve", after: "after she serves" };

function wedge(cx, cy, r0, r1, a0, a1) {
  const rad = a => (a * Math.PI) / 180, P = (r, a) => `${(cx + r * Math.cos(rad(a))).toFixed(1)} ${(cy + r * Math.sin(rad(a))).toFixed(1)}`;
  return `M${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} L${P(r0, a1)} A${r0} ${r0} 0 0 0 ${P(r0, a0)} Z`;
}

function wheelSvg(m, s, names, srv) {
  const C = 160, R1 = 150, R0 = 46;
  let out = `<svg viewBox="0 0 320 340" class="wheel" role="img" aria-label="Rotation wheel">`;
  out += `<text x="160" y="12" class="w-net" text-anchor="middle">NET</text><line x1="40" y1="18" x2="280" y2="18" class="w-netline"/>`;
  for (const pos of [4, 3, 2, 1, 6, 5]) {
    const a = ANGLE[pos], pid = s.lineup[pos], role = pid && model.isLibero(m.team_id, pid) ? "Libero" : roleOf(m, pid);
    const pair = pid ? court.pairFor(s, pid) : null;
    const tone = START_COLOR[startPos(pos, s.rot)];
    out += `<g class="w-${tone}"><path d="${wedge(C, C + 20, R0, R1, a - 29, a + 29)}" fill="${FILL[tone]}" class="w-slice" data-pos="${pos}"/>`;
    const t = (r, dy = 0) => { const x = C + r * Math.cos((a * Math.PI) / 180), y = C + 20 + r * Math.sin((a * Math.PI) / 180) + dy; return `x="${x.toFixed(1)}" y="${y.toFixed(1)}"`; };
    out += `<text ${t(134, 4)} class="w-pos" text-anchor="middle">${pos}</text>`;
    if (pid) {
      const isSub = pair && pair.back !== court.LIB && pair.back === pid;
      const mark = role === "Libero" ? "L " : isSub ? "↻ " : "";
      out += `<text ${t(95, -6)} class="w-name" text-anchor="middle">${esc(mark + (names[pid] || "").slice(0, 10))}</text>`;
      let sub = "";
      if (pair) {
        const isFront = pair.front === pid;
        const other = isFront ? (pair.back === court.LIB ? "Libero" : names[pair.back] || "?") : names[pair.front] || "?";
        sub = isFront ? `⇄ ${other}` : `for ${other}`;
      } else if (role === "Libero" && s.libFor) sub = `for ${names[s.libFor] || "?"}`;   // whom the libero is covering
      else sub = role ? role.replace("Right Side", "Opp") : "";
      if (pos === 1 && srv === "us") sub = "● serving";
      out += `<text ${t(95, 10)} class="w-sub" text-anchor="middle">${esc(sub.slice(0, 13))}</text>`;
    } else out += `<text ${t(95, 4)} class="w-sub" text-anchor="middle">empty</text>`;
    out += `</g>`;
  }
  out += `<line x1="${C - R1}" y1="${C + 20}" x2="${C + R1}" y2="${C + 20}" class="w-row"/>`;
  out += `<circle cx="${C}" cy="${C + 20}" r="${R0 - 4}" class="w-hub"/><text x="${C}" y="${C + 16}" class="w-hub-t" text-anchor="middle">Rotation</text>`;
  out += `<text x="${C}" y="${C + 36}" class="w-hub-n" text-anchor="middle">${(((s.rot % 6) + 6) % 6) + 1}</text>`;
  out += `<text x="160" y="338" class="w-lbl" text-anchor="middle">front row on top · back row below</text></svg>`;
  return out;
}

function checks(m, s) {
  const plan = court.planOf(s), warn = [], info = [];
  if (!court.full(s)) warn.push("Place all six starters on the Court tab first.");
  const counts = {};
  for (const p of plan) if (p.back !== court.LIB) counts[p.back] = (counts[p.back] || 0) + 1;
  for (const [pid, n] of Object.entries(counts)) if (n > 1) warn.push(`${nameOf(m, pid)} is planned to replace ${n} players; she can only be on the court once.`);
  for (const p of plan) {
    if (p.back !== court.LIB && plan.some(q => q.front === p.back)) warn.push(`${nameOf(m, p.back)} is both a front-row and a back-row player in the plan.`);
    if (!model.rosterRow(m.team_id, p.front) || (p.back !== court.LIB && !model.rosterRow(m.team_id, p.back))) warn.push("A planned player is no longer on this team's roster; edit or remove that swap.");
  }
  plan.forEach((p, i) => plan.slice(i + 1).forEach(q => {
    if (p.back !== court.LIB && ((p.front === q.front && p.back === q.back) || (p.front === q.back && p.back === q.front)))
      warn.push(`${nameOf(m, p.front)} and ${nameOf(m, p.back)} are in two swaps (${p.front === q.front ? "twice" : "once each way round"}). Remove the one that's wrong.`);
  }));
  const libServes = plan.filter(p => p.back === court.LIB && p.when === "serve").length;
  if (libServes > 1) warn.push("The libero is set to serve for more than one player. She can serve for one at most.");
  if (plan.some(p => p.back === court.LIB) && !model.rosterFor(m.team_id).some(e => model.isLibero(m.team_id, e.p.id)))
    warn.push("The plan uses the libero, but nobody on the roster has the position Libero (More → Team).");
  const perLap = plan.filter(p => p.back !== court.LIB).length * 2;
  if (plan.length) info.push(`Each time around the rotation uses ${perLap} of the ${court.SUB_LIMIT} substitutions (libero swaps don't count).`);
  if (perLap * 2 > court.SUB_LIMIT && perLap <= court.SUB_LIMIT) warn.push("A long set that goes around twice would run out of substitutions; the app skips planned subs once all 15 are used.");
  if (perLap > court.SUB_LIMIT) warn.push(`The plan needs more than ${court.SUB_LIMIT} substitutions to go around once.`);
  return { warn, info };
}

// Court vs. plan: where the players on the court don't match the plan, and the one-tap fix when it's clear.
function mismatches(m, s) {
  const out = [], on = court.onCourt(s), W = pid => court.who(m, pid);
  const isL = pid => model.isLibero(m.team_id, pid);
  const lib = model.rosterFor(m.team_id).map(e => e.p.id).find(isL) || null;
  const pos = pid => court.posOf(s, pid), front = p => court.FRONT.includes(p), back = p => court.BACK.includes(p);
  for (const pr of court.planOf(s)) {
    const F = pr.front, B = pr.back === court.LIB ? lib : pr.back, fp = pos(F), bp = B ? pos(B) : 0;
    const sub = pr.back === court.LIB ? "the libero" + (B ? ` ${W(B)}` : "") : W(B);
    if (!B) continue;
    if (pr.back !== court.LIB && fp && bp) {
      out.push({ text: `${W(F)} (position ${fp}) and ${W(B)} (position ${bp}) are both on the court, but the plan has them sharing one spot. One of them is probably in another player's place: check the Court tab.` });
      continue;
    }
    // front-row player still in where the plan has her sub in the back row
    if (fp && back(fp) && !bp && (pr.when === "serve" || fp !== 1) && !(pr.back === court.LIB && on.has(lib))) {
      out.push({ text: `${W(F)} is in the back row (position ${fp}), but the plan has ${sub} in for her there.`, fix: { pos: fp, pid: B, label: `Put ${pr.back === court.LIB ? "the libero" : "#" + (model.rosterRow(m.team_id, B)?.number ?? "")} in` } });
      continue;
    }
    // sub (or the libero, covering her) in the front row where the plan has the front-row player back in
    const cover = pr.back === court.LIB ? (s.libFor === F ? lib : null) : B;
    const cp = cover ? pos(cover) : 0;
    if (cp && front(cp) && !fp)
      out.push({ text: `${W(cover)} is in the front row (position ${cp}), but the plan has ${W(F)} back in there.`, fix: { pos: cp, pid: F, label: `Put #${model.rosterRow(m.team_id, F)?.number ?? ""} back in` } });
  }
  return out;
}

async function editPair(m, ctx, pair, startPid) {
  const entries = model.rosterFor(m.team_id), names = model.shortNames(entries);
  const s = court.state(m), plan = court.planOf(s);
  const isL = pid => model.isLibero(m.team_id, pid), hasLib = entries.some(e => isL(e.p.id));
  const cur = pair || { front: startPid || "", back: "", when: "serve" };
  // The swap being edited is matched by its players (not by object), so it never counts as "another" swap.
  const same = p => !!pair && p.front === pair.front && p.back === pair.back;
  const opt = (v, l, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`;
  const lab = e => `#${e.r.number ?? ""} ${names[e.p.id]}${model.teamPos(m.team_id, e.p.id) ? " (" + model.teamPos(m.team_id, e.p.id) + ")" : ""}`;
  const r = await sheet({
    title: pair ? "Change this swap" : "Plan a swap",
    body: `<label class="field">Front-row player<select id="pf">${opt("", "Choose…", cur.front)}${entries.filter(e => !isL(e.p.id)).map(e => opt(e.p.id, lab(e), cur.front)).join("")}</select></label>
      <label class="field">Replaced in the back row by<select id="pb">${opt("", "Choose…", cur.back)}${hasLib ? opt(court.LIB, "The libero", cur.back) : ""}${entries.filter(e => !isL(e.p.id)).map(e => opt(e.p.id, lab(e), cur.back)).join("")}</select></label>
      <button type="button" class="btn small" id="pswap">⇅ Switch the two players</button>
      <label class="field">When she comes in<select id="pw">${opt("serve", "To serve: as the spot rotates to position 1", cur.when)}${opt("after", "After she serves: when we lose her serve", cur.when)}</select></label>
      <p class="muted small" style="margin:0">The front-row player comes back automatically when the spot rotates to the front row (position 4). The libero never serves unless you choose "To serve" for her.</p>`,
    onOpen: el => {
      const f = $("#pf", el), b = $("#pb", el), w = $("#pw", el), err = $(".sheet-err", el);
      b.onchange = () => { if (b.value === court.LIB && !pair) w.value = "after"; };
      $("#pswap", el).onclick = () => {
        if (b.value === court.LIB) { err.textContent = "The libero can't be the front-row player, so these two can't be switched."; err.hidden = false; return; }
        const x = f.value; f.value = b.value; b.value = x; err.hidden = true;
      };
    },
    buttons: [{ label: "Save", value: "save", cls: "primary" }, ...(pair ? [{ label: "Remove swap", value: "remove" }] : []), { label: "Cancel", value: null }],
    check: (el, v) => {
      if (v !== "save") return true;
      const f = $("#pf", el).value, b = $("#pb", el).value, w = $("#pw", el).value;
      if (!f || !b) return "Choose both players.";
      if (f === b) return "Choose two different players.";
      const nm = pid => nameOf(m, pid), others = plan.filter(p => !same(p));   // every swap except the one being edited
      const pairName = p => `${nm(p.front)} ⇄ ${p.back === court.LIB ? "the libero" : nm(p.back)}`;
      const dupe = others.find(p => p.front === f && p.back === b), mirror = others.find(p => p.front === b && p.back === f);
      if (dupe) return `${pairName(dupe)} is already planned. ${pair ? "Tap Remove swap to delete this copy." : "There's nothing to add."}`;
      if (mirror) return `${pairName(mirror)} is already planned: the same two players the other way round. Keep the one that's right and tap Remove swap on the other.`;
      const frontIn = others.find(p => p.front === f);
      if (frontIn) return `${nm(f)} is already the front-row player in ${pairName(frontIn)}. Change or remove that swap instead.`;
      if (others.some(p => p.back === f)) return `${nm(f)} already switches in for another player, so she can't also have a sub of her own.`;
      if (b !== court.LIB) {
        const clash = others.find(p => p.back === b || p.front === b);
        if (clash) return clash.back === b
          ? `${nm(b)} already switches in for ${nm(clash.front)}. Only the libero can switch in for more than one player.`
          : `${nm(b)} already has a planned swap of her own, so she can't also switch in for another player.`;
      }
      if (b === court.LIB && w === "serve" && others.some(p => p.back === court.LIB && p.when === "serve")) return "The libero can serve for one player only.";
      return true;
    },
  });
  if (r.value === "remove") { court.savePlan(m, s, plan.filter(p => !(p.front === pair.front && p.back === pair.back))); toast("Swap removed."); ctx.refresh(); }
  if (r.value === "save") {
    const np = { front: $("#pf", r.el).value, back: $("#pb", r.el).value, when: $("#pw", r.el).value };
    court.savePlan(m, s, [...plan.filter(p => !(pair && p.front === pair.front && p.back === pair.back)), np]);
    toast("Swap saved. Rotate will make it for you."); ctx.refresh();
  }
}

export function render(main, ctx) {
  const m = renderBar(main, ctx);
  if (!m) return;
  const s = court.state(m), entries = model.rosterFor(m.team_id), names = model.shortNames(entries);
  const srv = m.scoring === "points" ? court.serving(m, s) : null;
  const plan = court.planOf(s), { warn, info } = checks(m, s), mm = court.full(s) || court.onCourt(s).size ? mismatches(m, s) : [];
  const next = court.full(s) ? court.previewRotate(m, s) : { swaps: [], notes: [] };
  const lab = pid => (pid === court.LIB ? "Libero" : nameOf(m, pid));
  main.insertAdjacentHTML("beforeend", `<section class="card">
      <div class="card-head"><h2>Rotation</h2><span class="muted">Set ${model.curSet(m)}</span><span class="grow"></span>
        <button class="btn small" type="button" id="rot2" ${court.liberoFront(m, s) ? "disabled" : ""}>Rotate ↻</button>
        <span class="subs ${s.subs >= court.SUB_LIMIT ? "maxed" : ""}">Subs ${s.subs} of ${court.SUB_LIMIT}</span></div>
      <div class="wheel-wrap">${wheelSvg(m, s, names, srv)}</div>
      <div class="legend"><span><i style="background:${FILL.red}"></i>Started at 1 (first server)</span><span><i style="background:${FILL.green}"></i>Started front row (4, 3, 2)</span>
        <span><i style="background:${FILL.white}"></i>Started at 5, 6</span><span><b>L</b> libero</span><span><b>↻</b> sub in</span></div>
      <p class="small" style="margin:0"><b>Next Rotate:</b> ${next.swaps.length ? next.swaps.map(w => esc(swapText(m, w))).join("; ") : "no planned subs"}${next.notes.length ? ` <span class="muted">(${esc(next.notes.join(" "))})</span>` : ""}</p>
      <p class="muted small" style="margin:0">Tap a slice to plan who goes in for her. The court is changed on the Court tab or with Rotate.</p>
      <div class="row"><button class="btn" type="button" id="to-court2">Court tab</button></div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Planned swaps</h3><span class="grow"></span>${plan.length ? `<button class="btn small" type="button" id="clear-plan">Clear plan</button>` : ""}<button class="btn small primary" type="button" id="add">+ Plan a swap</button></div>
      ${plan.length ? `<div class="list">${plan.map((p, i) => `<button type="button" class="item" data-i="${i}">
          <span class="main-txt"><b>${esc(lab(p.front))} ⇄ ${esc(lab(p.back))}</b>
          <span class="sub">${esc(lab(p.back))} comes in ${esc(WHEN[p.when])}; ${esc(lab(p.front))} returns for the front row</span></span><span class="chev">›</span></button>`).join("")}</div>`
        : `<p class="muted" style="margin:0">No swaps planned. Rotate just rotates, as before.</p>`}
      <p class="muted small" style="margin:0">Each new set starts with this plan. Subs you make by hand are respected: a planned swap is skipped if the player isn't where the plan expects.</p>
    </section>
    ${mm.length ? `<section class="card" id="cvp"><h3>Court vs. plan</h3>${mm.map((x, i) => `<div class="notice">${esc(x.text)}${x.fix ? `<div class="row" style="margin-top:8px"><button class="btn small primary" type="button" data-fix="${i}">${esc(x.fix.label)}</button></div>` : ""}</div>`).join("")}
      <p class="muted small" style="margin:0">Fixes count as substitutions, except for the libero.</p></section>` : ""}
    ${warn.length || info.length ? `<section class="card">${warn.map(w => `<div class="notice">${esc(w)}</div>`).join("")}${info.map(t => `<p class="small" style="margin:0">${esc(t)}</p>`).join("")}</section>` : ""}`);
  for (const p of $$(".w-slice", main)) p.onclick = () => {
    const pid = s.lineup[+p.dataset.pos];
    if (!pid) { toast("Place a player here on the Court tab first."); return; }
    if (model.isLibero(m.team_id, pid)) { const pr = plan.find(x => x.back === court.LIB && x.front === s.libFor); return pr ? editPair(m, ctx, pr) : toast("The libero's swaps are planned from the players she replaces."); }
    editPair(m, ctx, court.pairFor(s, pid), pid);
  };
  for (const b of $$("[data-i]", main)) b.onclick = () => editPair(m, ctx, plan[+b.dataset.i]);
  for (const b of $$("[data-fix]", main)) b.onclick = () => {
    const f = mm[+b.dataset.fix].fix, cs = court.state(m), r = court.place(m, cs, f.pos, f.pid);
    if (r.error) { toast(r.error); return; }
    toast(r.counted ? `Fixed. Substitution ${cs.subs} of ${court.SUB_LIMIT}.` : "Fixed."); ctx.refresh();
  };
  $("#add", main).onclick = () => editPair(m, ctx, null);
  $("#clear-plan", main) && ($("#clear-plan", main).onclick = async () => {
    if (!(await ask(`Remove all ${plan.length} planned swaps for set ${model.curSet(m)}? The players on the court stay where they are.`, "Clear plan", true))) return;
    court.savePlan(m, court.state(m), []); toast("Plan cleared. Rotate just rotates now."); ctx.refresh();
  });
  $("#to-court2", main).onclick = () => ctx.go("court");
  $("#rot2", main).onclick = async () => {
    const r = court.rotate(m, court.state(m));
    if (r.error) { toast(r.error); return; }
    ctx.refresh();
    const { showSwaps } = await import("../planui.js");
    showSwaps(m, r, ctx);
  };
}
