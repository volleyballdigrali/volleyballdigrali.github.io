// Tachometer-style gauge: a half-circle dial in red / yellow / green (the team's colour levels)
// with a needle pointing at the exact value.

import { esc } from "./ui.js";

const C = { red: "#c3262e", amber: "#e0a800", green: "#1d7a3e" };

// opts: { title, value (number or null), min, max, cuts: [r, a], fmt, sub, ticks }
export function gauge({ title, value, min, max, cuts, fmt, sub = "", ticks = [] }) {
  const W = 220, cx = 110, cy = 112, R = 92, T = 22;
  const ang = v => Math.PI * (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min));   // min = left, max = right
  const P = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
  const arc = (v0, v1, col) => {
    const a0 = ang(v0), a1 = ang(v1);
    return `<path d="M${P(R, a0)} A${R} ${R} 0 0 1 ${P(R, a1)} L${P(R - T, a1)} A${R - T} ${R - T} 0 0 0 ${P(R - T, a0)} Z" fill="${col}"/>`;
  };
  let s = `<svg viewBox="-22 0 ${W + 44} 150" class="gauge" role="img" aria-label="${esc(title)}: ${value == null ? "no data" : esc(fmt(value))}">`;
  s += arc(min, cuts[0], C.red) + arc(cuts[0], cuts[1], C.amber) + arc(cuts[1], max, C.green);
  for (const t of [min, ...cuts, max, ...ticks]) {
    const a = ang(t);
    s += `<line x1="${(cx + (R + 2) * Math.cos(a)).toFixed(1)}" y1="${(cy - (R + 2) * Math.sin(a)).toFixed(1)}" x2="${(cx + (R + 7) * Math.cos(a)).toFixed(1)}" y2="${(cy - (R + 7) * Math.sin(a)).toFixed(1)}" class="g-tick"/>`;
    s += `<text x="${(cx + (R + 16) * Math.cos(a)).toFixed(1)}" y="${(cy - (R + 16) * Math.sin(a) + 4).toFixed(1)}" class="g-lbl" text-anchor="middle">${esc(fmt(t))}</text>`;
  }
  if (value != null) {
    const a = ang(value);
    s += `<line x1="${cx}" y1="${cy}" x2="${(cx + (R - 6) * Math.cos(a)).toFixed(1)}" y2="${(cy - (R - 6) * Math.sin(a)).toFixed(1)}" class="g-needle"/>`;
    s += `<polygon points="${P(R - 2, a)} ${P(R - 18, a + 0.07)} ${P(R - 18, a - 0.07)}" class="g-tip"/>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="7" class="g-hub"/>`;
  s += `<text x="${cx}" y="${cy + 26}" class="g-val" text-anchor="middle">${value == null ? "–" : esc(fmt(value))}</text></svg>`;
  return `<figure class="gauge-box"><figcaption>${esc(title)}</figcaption>${s}<div class="g-sub">${esc(sub)}</div></figure>`;
}
