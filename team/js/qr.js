// QR code drawn by the app itself (no internet, no libraries).
// Byte mode, error correction level M, versions 1-6 (up to 106 characters): plenty for a web address.

const M_TABLE = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]] };
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
const EXP = new Array(512), LOG = new Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rs(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const a = [...gen, 0], b = [0, ...gen.map(g => gmul(g, EXP[i]))];
    gen = a.map((v, j) => v ^ b[j]);
  }
  const rem = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = rem[i];
    if (c) for (let j = 1; j < gen.length; j++) rem[i + j] ^= gmul(gen[j], c);
  }
  return rem.slice(data.length);
}

export function qrMatrix(text) {
  const data = [...new TextEncoder().encode(text)];
  const capOf = v => M_TABLE[v][1].reduce((s, [c, d]) => s + c * d, 0);
  let ver = 0;
  for (let v = 1; v <= 6; v++) if (data.length <= capOf(v) - 2) { ver = v; break; }
  if (!ver) throw new Error("Address too long for the QR code.");
  const [ecn, groups] = M_TABLE[ver], cap = capOf(ver);
  const bits = [0, 1, 0, 0];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(data.length, 8); data.forEach(b => push(b, 8));
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  const dataWords = words.length;
  while (words.length < cap) words.push((words.length - dataWords) % 2 ? 0x11 : 0xec);
  const blocks = []; let k = 0;
  for (const [cnt, dlen] of groups) for (let i = 0; i < cnt; i++) { blocks.push(words.slice(k, k + dlen)); k += dlen; }
  const ecs = blocks.map(b => rs(b, ecn));
  const final = [];
  const maxLen = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) final.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const e of ecs) final.push(e[i]);
  const stream = [];
  final.forEach(w => { for (let i = 7; i >= 0; i--) stream.push((w >> i) & 1); });
  if (ver > 1) for (let i = 0; i < 7; i++) stream.push(0);

  const n = ver * 4 + 17;
  const M = Array.from({ length: n }, () => new Array(n).fill(null));
  const finder = (r, c) => {
    for (let dr = -1; dr < 8; dr++) for (let dc = -1; dc < 8; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      M[rr][cc] = on ? 1 : 0;
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) M[6][i] = M[i][6] = i % 2 === 0 ? 1 : 0;
  for (const r of ALIGN[ver]) for (const c of ALIGN[ver]) {
    if (M[r][c] !== null) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) M[r + dr][c + dc] = [0, 2].includes(Math.max(Math.abs(dr), Math.abs(dc))) ? 1 : 0;
  }
  M[4 * ver + 9][8] = 1;
  const reserved = new Set();
  for (let i = 0; i < 9; i++) { reserved.add(`8,${i}`); reserved.add(`${i},8`); }
  for (let i = 0; i < 8; i++) { reserved.add(`8,${n - 1 - i}`); reserved.add(`${n - 1 - i},8`); }
  const func = M.map((row, r) => row.map((v, c) => v !== null || reserved.has(`${r},${c}`)));
  let idx = 0, up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) if (!func[r][c]) { M[r][c] = idx < stream.length ? stream[idx] : 0; idx++; }
    }
    up = !up;
  }
  const masks = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const fmtBits = mask => {
    const d = mask;                  // level M = 00
    let v = d << 10;
    for (let i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= 0x537 << (i - 10);
    return ((d << 10) | v) ^ 0x5412;
  };
  const build = mask => {
    const A = M.map((row, r) => row.map((v, c) => (!func[r][c] && masks[mask](r, c) ? v ^ 1 : v || 0)));
    const f = fmtBits(mask), b = i => (f >> i) & 1;
    for (let i = 0; i < 6; i++) A[i][8] = b(i);
    A[7][8] = b(6); A[8][8] = b(7); A[8][7] = b(8);
    for (let i = 9; i < 15; i++) A[8][14 - i] = b(i);
    for (let i = 0; i < 8; i++) A[8][n - 1 - i] = b(i);
    for (let i = 8; i < 15; i++) A[n - 15 + i][8] = b(i);
    A[4 * ver + 9][8] = 1;
    return A;
  };
  const penalty = A => {
    let p = 0;
    const lines = [...A, ...A[0].map((_, c) => A.map(row => row[c]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i < n; i++) {
        if (line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      if (run >= 5) p += run - 2;
      const s = line.join("");
      p += 40 * ((s.match(/10111010000/g) || []).length + (s.match(/00001011101/g) || []).length);
    }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++)
      if (A[r][c] === A[r][c + 1] && A[r][c] === A[r + 1][c] && A[r][c] === A[r + 1][c + 1]) p += 3;
    const dark = Math.floor((A.flat().reduce((s, v) => s + v, 0) * 100) / (n * n));
    return p + 10 * Math.floor(Math.abs(dark - 50) / 5);
  };
  let best = null, bestP = Infinity;
  for (let m = 0; m < 8; m++) { const A = build(m), p = penalty(A); if (p < bestP) { best = A; bestP = p; } }
  return best;
}

export function qrSvg(text, quiet = 4) {
  const A = qrMatrix(text), n = A.length, size = n + 2 * quiet;
  let path = "";
  A.forEach((row, r) => row.forEach((v, c) => { if (v) path += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the Team app">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
