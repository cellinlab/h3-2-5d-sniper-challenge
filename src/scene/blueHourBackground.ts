/**
 * Procedural blue-hour industrial placeholder for the H3 2.5D sniper
 * challenge. Used when a scene is configured with the procedural
 * fallback (locked scenes, or the brief moment before a video master
 * has decoded its first frame). The draw is fully deterministic given
 * the timestamp: slow steam drift, a few warning lights, a barely
 * perceptible camera sway. Nothing is downloaded.
 */

export type AtmosphereFrame = {
  /** monotonic seconds since the round started; used by wide + scope */
  t: number;
  /** width in CSS pixels of the rendered scene rectangle */
  w: number;
  /** height in CSS pixels of the rendered scene rectangle */
  h: number;
  /** current danger level, which slightly intensifies the vignette */
  danger: "calm" | "warning" | "final";
};

const drawSky = (ctx: CanvasRenderingContext2D, w: number, h: number, _t: number) => {
  // Vertical gradient from near-black navy to a slightly warmer steel blue.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#04080f");
  g.addColorStop(0.55, "#0c1a2a");
  g.addColorStop(0.9, "#142b40");
  g.addColorStop(1, "#1a3852");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Distant horizon band
  ctx.fillStyle = "rgba(70, 110, 150, 0.08)";
  ctx.fillRect(0, h * 0.45, w, h * 0.05);
};

const drawDistantBuildings = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#0a1623";
  for (let i = 0; i < 14; i += 1) {
    const bw = w * (0.04 + (i % 3) * 0.012);
    const bh = h * (0.18 + ((i * 37) % 11) * 0.012);
    const bx = (w / 14) * i + (i % 2) * 6;
    const by = h * 0.55 - bh;
    ctx.fillRect(bx, by, bw, bh);
  }
};

const drawMidgroundTowers = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  // Two large industrial towers in the middle distance.
  ctx.fillStyle = "#0d1a26";
  const t1x = w * 0.18;
  const t2x = w * 0.62;
  const t1w = w * 0.12;
  const t2w = w * 0.18;
  const th = h * 0.42;
  const ty = h * 0.55;
  ctx.fillRect(t1x, ty, t1w, th);
  ctx.fillRect(t2x, ty, t2w, th);

  // Window grid: a sparse pattern of warm amber windows.
  ctx.fillStyle = "rgba(255, 184, 96, 0.5)";
  const drawWindowGrid = (ox: number, oy: number, cols: number, rows: number) => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if ((r * 7 + c * 3) % 5 === 0) continue;
        const wx = ox + c * 8 + 2;
        const wy = oy + r * 9 + 4;
        ctx.fillRect(wx, wy, 3, 4);
      }
    }
  };
  drawWindowGrid(t1x + 6, ty + 12, 8, 14);
  drawWindowGrid(t2x + 8, ty + 12, 12, 18);
};

const drawForeground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  // Concrete platform / railing in front.
  ctx.fillStyle = "#08111b";
  ctx.fillRect(0, h * 0.78, w, h * 0.22);

  // Railing posts
  ctx.fillStyle = "#1a2a3a";
  const postY = h * 0.78;
  const postTop = h * 0.7;
  for (let x = 0; x < w; x += w / 22) {
    ctx.fillRect(x, postTop, 2, postY - postTop + 1);
  }
  ctx.fillRect(0, postTop, w, 2);
  ctx.fillRect(0, postY - 2, w, 2);

  // Walkway grime and concrete flecks
  ctx.fillStyle = "rgba(120, 150, 180, 0.06)";
  for (let i = 0; i < 80; i += 1) {
    const x = ((i * 37) % w);
    const y = h * 0.78 + ((i * 53) % (h * 0.22));
    ctx.fillRect(x, y, 1.5, 1.5);
  }
};

const drawSteam = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  // Three soft steam puffs that drift upward and reset. The wrap is
  // driven by the master scene clock so the wide view and scope view
  // stay in sync.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i += 1) {
    const phase = (t * 0.05 + i / 3) % 1;
    const cx = w * (0.22 + i * 0.27);
    const cy = h * (0.72 - phase * 0.18);
    const radius = 30 + phase * 70;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, "rgba(180, 210, 230, 0.18)");
    g.addColorStop(1, "rgba(180, 210, 230, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawWarningLights = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.save();
  ctx.fillStyle = `rgba(255, 90, 80, ${0.4 + 0.5 * pulse})`;
  ctx.beginPath();
  ctx.arc(w * 0.16, h * 0.6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.84, h * 0.58, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawFilmGrain = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  // Very low-opacity noise so the wide view does not feel sterile.
  const cell = 6;
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const n = (Math.sin(x * 12.9898 + y * 78.233 + t * 0.7) * 43758.5453) % 1;
      const v = (n - Math.floor(n)) * 255;
      ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.06)`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.restore();
};

const drawVignette = (ctx: CanvasRenderingContext2D, w: number, h: number, danger: AtmosphereFrame["danger"]) => {
  const intensity = danger === "final" ? 0.65 : danger === "warning" ? 0.45 : 0.3;
  const tint = danger === "calm" ? "0, 0, 0" : "120, 30, 30";
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, `rgba(${tint}, 0)`);
  g.addColorStop(1, `rgba(${tint}, ${intensity})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

const drawSubtleSway = (ctx: CanvasRenderingContext2D, _w: number, _h: number, t: number) => {
  // Less than 1 px of drift to keep spatial landmarks stable. The
  // function is a no-op transform right now: keeping it for future
  // camera sway experimentation without changing the call site.
  ctx.save();
  ctx.translate(Math.sin(t * 0.5) * 0.5, Math.cos(t * 0.4) * 0.3);
  ctx.restore();
};

/** Render the placeholder background to the supplied 2D context. */
export const drawAtmosphere = (ctx: CanvasRenderingContext2D, frame: AtmosphereFrame): void => {
  const { w, h, t, danger } = frame;
  if (w === 0 || h === 0) return;
  ctx.save();
  drawSubtleSway(ctx, w, h, t);
  drawSky(ctx, w, h, t);
  drawDistantBuildings(ctx, w, h);
  drawMidgroundTowers(ctx, w, h);
  drawForeground(ctx, w, h);
  drawWarningLights(ctx, w, h, t);
  drawSteam(ctx, w, h, t);
  drawVignette(ctx, w, h, danger);
  drawFilmGrain(ctx, w, h, t);
  ctx.restore();
};
