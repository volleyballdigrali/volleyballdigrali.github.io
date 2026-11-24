/* Volleyball Digrali intro: a spinning volleyball flies at you, then bursts and reveals the page.
   Plays once each time the page is opened (once per launch), about 2.3 seconds. Tap or press a key to skip.
   Skipped for people who turned on "Reduce motion". Drawn on a canvas, so there's nothing to download. */
(() => {
  const BLACK = "#111214", RED = "#c8102e", GRAY = "#8b9096", DARK = "#2a2c30", SEAM = "#16171a";   // club colours: red, gray, black, white
  const APPROACH = 1100, END = 2300;               // ms: ball arrives / everything gone
  const params = new URLSearchParams(location.search);
  const forced = params.has("intro");
  let seen = false;
  try { seen = sessionStorage.getItem("vbd-intro") === "1" || sessionStorage.getItem("vbt-intro") === "1"; sessionStorage.removeItem("vbt-intro"); } catch {}
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.vbdIntro = play;                           // play it again on demand (the main page title does this)
  if (!forced && (seen || reduce)) return;
  try { sessionStorage.setItem("vbd-intro", "1"); } catch {}
  play();

  function play() {
  if (document.querySelector("canvas.vbd-intro")) return;

  // Small seeded random numbers, so every play looks the same.
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true"); cv.className = "vbd-intro";
  cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:3000;touch-action:none;cursor:pointer";
  document.documentElement.appendChild(cv);
  const g = cv.getContext("2d");
  let W = 0, H = 0, D = 1, R = 0;
  function size() {
    D = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * D); cv.height = Math.round(H * D); g.setTransform(D, 0, 0, D, 0, 0);
    R = Math.min(W, H) * 0.5;                         // ball radius when it bursts
  }
  size(); addEventListener("resize", size);

  // The ball, drawn in 3D like a real volleyball: a cube puffed into a sphere, each of the 6 sections made of
  // 3 parallel strips (red, white, gray), each section turned crosswise to its neighbours, with dark seams.
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const STRIPS = [hex(RED), [246, 247, 249], hex(GRAY)], SEAMC = hex(SEAM);
  const buf = document.createElement("canvas"), bg2 = buf.getContext("2d");
  const LX = -0.45, LY = 0.55, LZ = 0.7, LN = Math.hypot(LX, LY, LZ), lx = LX / LN, ly = LY / LN, lz = LZ / LN;
  const hn = Math.hypot(lx, ly, lz + 1), hx = lx / hn, hy = ly / hn, hz = (lz + 1) / hn;
  function ball(c, r, spin, cap = 300) {
    const n = Math.max(12, Math.min(cap, Math.ceil(2 * r * D)));
    if (buf.width !== n) { buf.width = n; buf.height = n; }
    const im = bg2.createImageData(n, n), px = im.data;
    const a = spin, b = spin * 0.62 + 0.5;            // tumble around two axes
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const seamW = Math.max(0.035, 2.2 / n);           // seam width, at least about one pixel
    const third = 1 / 3, q = 4 / Math.PI;
    for (let j = 0; j < n; j++) {
      const v = 1 - (2 * j + 1) / n;
      for (let i = 0; i < n; i++) {
        const u = (2 * i + 1) / n - 1, d2 = u * u + v * v;
        if (d2 >= 1) continue;
        const z = Math.sqrt(1 - d2);
        // screen normal (u, v, z) -> ball's own frame (undo the tumble)
        const y1 = v * cb + z * sb, z1 = -v * sb + z * cb;
        const x = u * ca - z1 * sa, zz = u * sa + z1 * ca, y = y1;
        const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(zz);
        let s, o, m;                                   // s: across the strips, o: along them (both -1..1)
        if (ax >= ay && ax >= az) { m = ax; s = y / m; o = zz / m; }
        else if (ay >= az) { m = ay; s = zz / m; o = x / m; }
        else { m = az; s = x / m; o = y / m; }
        s = Math.atan(s) * q; o = Math.atan(o) * q;   // even strip widths on the sphere
        const f = (s + 1) / 2, k = Math.min(2, Math.floor(f * 3));
        const edgeS = Math.abs(f * 3 - Math.round(f * 3)) * third * 2, edgeO = 1 - Math.abs(o);
        let col = STRIPS[k];
        const seam = Math.min(edgeS, edgeO) < seamW;
        if (seam) col = SEAMC;
        // light: soft diffuse + a highlight, darker toward the rim
        const dif = Math.max(0, u * lx + v * ly + z * lz), nh = Math.max(0, u * hx + v * hy + z * hz);
        const sh = 0.38 + 0.62 * dif, sp = seam ? 0 : Math.pow(nh, 36) * 0.55 * 255;
        const p = (j * n + i) * 4, aa = Math.min(1, (1 - Math.sqrt(d2)) * n / 2);
        px[p] = col[0] * sh + sp; px[p + 1] = col[1] * sh + sp; px[p + 2] = col[2] * sh + sp; px[p + 3] = 255 * aa;
      }
    }
    bg2.putImageData(im, 0, 0);
    if (c) c.drawImage(buf, -r, -r, 2 * r, 2 * r);
  }

  // Where the ball is at time t (ms): it comes in from the upper right, straight at you (size = 1 / distance).
  const spinAt = t => t * 0.011;
  function placeAt(t) {
    const p = Math.min(1, t / APPROACH), z = 24 - 23 * p;
    return { x: W / 2 + W * 0.28 * (1 - p) ** 2, y: H / 2 - H * 0.22 * (1 - p) ** 2, r: R / z };
  }

  // The burst: the ball cut into jagged pieces, sparks, a ring and a flash.
  let shards = null, sparks = null, img = null;
  function makeBurst() {
    const s = Math.ceil(R * 2 + 4);
    img = document.createElement("canvas"); img.width = s * D; img.height = s * D;
    const c = img.getContext("2d"); c.setTransform(D, 0, 0, D, s / 2 * D, s / 2 * D); ball(c, R, spinAt(APPROACH), 640);
    shards = []; const N = 26, rings = [0, 0.42, 0.75, 1.05];
    const ang = Array.from({ length: N + 1 }, (_, i) => (i / N) * Math.PI * 2 + (i % N ? (rnd() - 0.5) * 0.18 : 0));
    const rad = rings.map((v, j) => Array.from({ length: N + 1 }, () => R * (j === 0 || j === 3 ? v : v + (rnd() - 0.5) * 0.12)));
    for (let j = 0; j < 3; j++) {
      const step = j === 0 ? 2 : 1;
      for (let i = 0; i < N; i += step) {
        const a0 = ang[i], a1 = ang[Math.min(N, i + step)], i1 = Math.min(N, i + step) % N;
        const pts = [[a0, rad[j][i]], [a1, rad[j][i1]], [a1, rad[j + 1][i1]], [a0, rad[j + 1][i]]]
          .map(([a, r]) => [Math.cos(a) * r, Math.sin(a) * r]);
        const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
        const d = Math.hypot(cx, cy) || 1, sp = 500 + rnd() * 900;
        shards.push({ pts: pts.map(p => [p[0] - cx, p[1] - cy]), cx, cy, vx: cx / d * sp, vy: cy / d * sp - 120,
                      rot: (rnd() - 0.5) * 9, grow: 1.4 + rnd() * 2.2 });
      }
    }
    sparks = Array.from({ length: 140 }, () => {
      const a = rnd() * Math.PI * 2, sp = 300 + rnd() * 1500;
      return { a, sp, len: 10 + rnd() * 34, w: 1.5 + rnd() * 3, col: [RED, "#ffffff", GRAY, "#ff4d5e"][Math.floor(rnd() * 4)], life: 450 + rnd() * 650 };
    });
  }

  function frame(t) {
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // the black backdrop, fading away after the burst to show the page
    const bg = t < APPROACH ? 1 : Math.max(0, 1 - (t - APPROACH) / 650);
    if (bg > 0) { g.globalAlpha = bg; g.fillStyle = BLACK; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (t < APPROACH) {
      const q = placeAt(t); ball(null, q.r, spinAt(t));   // draw the ball once, then reuse it for the trail
      for (const lag of [90, 55, 25]) {               // faint trail behind the ball
        if (t - lag < 0) continue; const o = placeAt(t - lag);
        g.globalAlpha = 0.12; g.drawImage(buf, o.x - o.r, o.y - o.r, 2 * o.r, 2 * o.r);
      }
      g.globalAlpha = 1; g.drawImage(buf, q.x - q.r, q.y - q.r, 2 * q.r, 2 * q.r);
      return;
    }
    if (!shards) makeBurst();
    const e = t - APPROACH, s = e / 1000;
    // ring
    if (e < 700) {
      g.beginPath(); g.arc(cx, cy, R * (1 + e / 250), 0, Math.PI * 2);
      g.lineWidth = Math.max(1, 26 * (1 - e / 700)); g.strokeStyle = `rgba(200,16,46,${0.9 * (1 - e / 700)})`; g.stroke();
    }
    // sparks
    for (const p of sparks) {
      if (e > p.life) continue; const k = e / p.life, d = R * 0.6 + p.sp * s * (1 - k * 0.35);
      const x = cx + Math.cos(p.a) * d, y = cy + Math.sin(p.a) * d + 260 * s * s;
      g.globalAlpha = 1 - k; g.strokeStyle = p.col; g.lineWidth = p.w; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(p.a) * p.len, y - Math.sin(p.a) * p.len); g.stroke();
    }
    g.globalAlpha = 1;
    // pieces of the ball, flying out and toward you
    const fade = Math.max(0, 1 - e / 950);
    if (fade > 0) for (const p of shards) {
      const sc = 1 + (p.grow - 1) * Math.min(1, s * 1.6);
      g.save(); g.globalAlpha = fade;
      g.translate(cx + p.cx * sc + p.vx * s, cy + p.cy * sc + p.vy * s + 500 * s * s);
      g.rotate(p.rot * s); g.scale(sc, sc);
      g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.clip();
      const half = img.width / D / 2;
      g.drawImage(img, -p.cx - half, -p.cy - half, img.width / D, img.height / D);
      g.restore();
    }
    // flash
    if (e < 260) { g.globalAlpha = 0.9 * (1 - e / 260); g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  }

  let t0 = null, raf = 0, done = false, skipAt = null;
  function finish() { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener("resize", size); cv.remove(); }
  function tick(now) {
    if (t0 === null) t0 = now;
    const t = now - t0;
    if (skipAt !== null) {                            // skipped: fade out quickly
      const k = (now - skipAt) / 200; if (k >= 1) return finish(); cv.style.opacity = String(1 - k);
    } else if (t >= END) return finish();
    frame(t); raf = requestAnimationFrame(tick);
  }
  const skip = () => { if (skipAt === null) skipAt = performance.now(); };
  cv.addEventListener("pointerdown", skip); addEventListener("keydown", skip, { once: true });
  window.__vbdIntroFrame = t => { cancelAnimationFrame(raf); skipAt = null; done = true; cv.style.opacity = "1"; frame(t); };   // for testing
  raf = requestAnimationFrame(tick);
  }
})();
