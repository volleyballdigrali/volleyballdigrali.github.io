// Colour levels per team: where red turns yellow and yellow turns green, for passing, serve % and hitting %.
// Chosen in team setup (a preset or custom) and used by the gauges, the Board and scouting. Stored on the team row,
// so it travels in setup and sync files to the other phones and Home Base.

import { esc } from "./ui.js";

export const PRESETS = {
  young:        { label: "Young / developing", pass: [1.0, 1.75], serve: [60, 80], hit: [-0.05, 0.10] },
  intermediate: { label: "Intermediate",       pass: [1.5, 2.0],  serve: [70, 85], hit: [0, 0.15] },
  advanced:     { label: "Advanced",           pass: [1.8, 2.2],  serve: [80, 90], hit: [0.10, 0.25] },
};
export const DEFAULT_PRESET = "young";

export function levelsOf(team) {
  let v = null;
  try { v = team?.levels ? JSON.parse(team.levels) : null; } catch { v = null; }
  const preset = v?.preset && (PRESETS[v.preset] || v.preset === "custom") ? v.preset : DEFAULT_PRESET;
  if (preset !== "custom") return { preset, ...PRESETS[preset] };
  const base = PRESETS.intermediate, ok = (x, d) => (Array.isArray(x) && x.length === 2 && x.every(n => Number.isFinite(+n)) && +x[0] <= +x[1] ? x.map(Number) : d);
  return { preset, label: "Custom", pass: ok(v.pass, base.pass), serve: ok(v.serve, base.serve), hit: ok(v.hit, base.hit) };
}
export const cutsOf = team => { const l = levelsOf(team); return { pass: l.pass, serve: l.serve, hit: l.hit }; };
export const band = (cuts, kind, v) => { const [r, a] = cuts[kind]; return v < r ? "red" : v < a ? "amber" : "green"; };

const hitF = v => (v < 0 ? "-" : "") + Math.abs(v).toFixed(3).replace(/^0/, "");
export const fmt = { pass: v => (+v).toFixed(2).replace(/0$/, ""), serve: v => `${+v}%`, hit: hitF };

// The form used in New team and on the Team page. Returns HTML; read it back with readLevels(el).
export function levelsField(team) {
  const l = levelsOf(team);
  const num = (id, v, step) => `<input type="number" id="${id}" value="${esc(v)}" step="${step}" inputmode="decimal">`;
  const row = (k, label, step) => `<div class="lv-row"><span>${label}</span>${num(`lv-${k}0`, l[k][0], step)}<span class="muted">to</span>${num(`lv-${k}1`, l[k][1], step)}</div>`;
  return `<label class="field">Colour levels (red / yellow / green)<select id="lv-preset">
      ${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}"${k === l.preset ? " selected" : ""}>${esc(p.label)}</option>`).join("")}
      <option value="custom"${l.preset === "custom" ? " selected" : ""}>Custom</option></select></label>
    <div class="lv-custom" id="lv-custom"${l.preset === "custom" ? "" : " hidden"}>
      <p class="muted small" style="margin:0">Below the first number is red, between them yellow, from the second number up green.</p>
      ${row("pass", "Passing (0–3)", "0.05")}${row("serve", "Serve %", "1")}${row("hit", "Hitting %", "0.01")}
    </div>
    <p class="muted small" id="lv-sum" style="margin:0">${esc(summary(l))}</p>`;
}
export function summary(l) {
  return `Passing: red below ${fmt.pass(l.pass[0])}, green from ${fmt.pass(l.pass[1])} · Serve: red below ${fmt.serve(l.serve[0])}, green from ${fmt.serve(l.serve[1])} · Hitting: red below ${hitF(l.hit[0])}, green from ${hitF(l.hit[1])}`;
}
export function wireLevels(el, onChange) {
  const sel = el.querySelector("#lv-preset"), box = el.querySelector("#lv-custom"), sum = el.querySelector("#lv-sum");
  const upd = () => {
    if (sel.value !== "custom") {   // show the preset's numbers in the boxes, ready to adjust
      const p = PRESETS[sel.value];
      for (const k of ["pass", "serve", "hit"]) { el.querySelector(`#lv-${k}0`).value = p[k][0]; el.querySelector(`#lv-${k}1`).value = p[k][1]; }
    }
    box.hidden = sel.value !== "custom";
    const v = readLevels(el); sum.textContent = v.error || summary(levelsOf({ levels: JSON.stringify(v) }));
    onChange && !v.error && onChange(v);
  };
  sel.onchange = upd;
  for (const i of el.querySelectorAll(".lv-custom input")) i.onchange = upd;
}
export function readLevels(el) {
  const preset = el.querySelector("#lv-preset").value;
  if (preset !== "custom") return { preset };
  const out = { preset };
  for (const k of ["pass", "serve", "hit"]) {
    const a = +el.querySelector(`#lv-${k}0`).value, b = +el.querySelector(`#lv-${k}1`).value;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return { preset, error: "Each pair of numbers needs the smaller one first." };
    out[k] = [a, b];
  }
  return out;
}
