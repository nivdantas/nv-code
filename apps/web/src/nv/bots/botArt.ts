// Adapted from t3+ src/botArt.js. Required Notice: Copyright 2026 Alex Wang
// (https://github.com/alextyhwang/t3plus), PolyForm Noncommercial License 1.0.0.
// 24x24 pixel faces: an ordered-dither body in three stops with white eyes.
// Faces are static; the row's status dot carries the live state.

const GRID = 24;
const BAYER_N = 16;

const THRESHOLDS = (() => {
  let m = [[0]];
  while (m.length < BAYER_N) {
    const size = m.length;
    const next = Array.from({ length: size * 2 }, () => Array.from({ length: size * 2 }, () => 0));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const v = m[y]![x]! * 4;
        next[y]![x] = v;
        next[y]![x + size] = v + 2;
        next[y + size]![x] = v + 3;
        next[y + size]![x + size] = v + 1;
      }
    }
    m = next;
  }
  return Float32Array.from(m.flat(), (v) => (v + 0.5) / (BAYER_N * BAYER_N));
})();

const bayerThreshold = (x: number, y: number) =>
  THRESHOLDS[(y & (BAYER_N - 1)) * BAYER_N + (x & (BAYER_N - 1))]!;

export const BOT_COLORS = {
  blue: ["#a8d1ff", "#3b82f6", "#1e2f8a"],
  purple: ["#ddd0ff", "#8b5cf6", "#3b0a64"],
  green: ["#bff7cb", "#22c55e", "#14532d"],
  teal: ["#aaf5ec", "#14b8a6", "#123f45"],
  pink: ["#ffc6e4", "#ec4899", "#831843"],
  red: ["#ffb4a8", "#ef4444", "#7f1d1d"],
  yellow: ["#fff4a8", "#eab308", "#6b3a0f"],
  orange: ["#ffd59e", "#f97316", "#7c2d12"],
  gray: ["#ececf0", "#7a7a85", "#26262c"],
} as const;

const SKINS = {
  football: { stops: ["#d9915a", "#94491f", "#3f1a08"], lift: 0 },
  basketball: { stops: ["#ffc38a", "#f26f1d", "#4a1c06"], lift: 0.16 },
} as const;

const CLIPS = {
  circle: "circle(50% at 50% 50%)",
  square: "inset(4% round 26%)",
  hexagon: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)",
  diamond: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
  triangle: "polygon(50% 4%, 97% 92%, 3% 92%)",
  star: "polygon(50% 0, 62% 35%, 99% 36%, 69% 58%, 80% 95%, 50% 73%, 20% 95%, 31% 58%, 1% 36%, 38% 35%)",
  football:
    "polygon(4.7% 95.3%, 20.1% 97.7%, 31.8% 96.4%, 42% 93.7%, 51.3% 90%, 59.6% 85.5%, 67.2% 80.1%, 74% 74%, 80.1% 67.2%, 85.5% 59.6%, 90% 51.3%, 93.7% 42%, 96.4% 31.8%, 97.7% 20.1%, 95.3% 4.7%, 79.9% 2.3%, 68.2% 3.6%, 58% 6.3%, 48.7% 10%, 40.4% 14.5%, 32.8% 19.9%, 26% 26%, 19.9% 32.8%, 14.5% 40.4%, 10% 48.7%, 6.3% 58%, 3.6% 68.2%, 2.3% 79.9%)",
  basketball: "circle(50% at 50% 50%)",
} as const;

// Eye boxes on the grid: [left x, right x, top y, width, height].
const EYES = {
  circle: [7, 14, 9, 3, 5],
  square: [7, 14, 9, 3, 5],
  hexagon: [7, 14, 9, 3, 5],
  diamond: [7, 14, 9, 3, 5],
  triangle: [8, 13, 13, 3, 5],
  star: [9, 13, 10, 2, 4],
  football: [11, 16, 12, 3, 5],
  basketball: [7, 15, 9, 3, 5],
} as const;

export type BotShape = keyof typeof CLIPS;
export type BotColor = keyof typeof BOT_COLORS;
export const BOT_SHAPES = Object.keys(CLIPS) as BotShape[];
export const BOT_COLOR_NAMES = Object.keys(BOT_COLORS) as BotColor[];
export const botShapeHasOwnColors = (shape: BotShape) =>
  shape === "football" || shape === "basketball";
export interface BotLook {
  readonly shape?: BotShape | undefined;
  readonly color?: BotColor | undefined;
}
type Glyph = "open" | "closed" | "lidded" | "wide" | "happy" | "x";
export type BotMood = "awake" | "idle" | "waiting" | "done" | "failed" | "working" | "attention";

interface Frame {
  eyes: Glyph;
  dx?: number;
  dy?: number;
  boost?: number;
  light?: readonly [number, number];
}

const MOODS: Record<BotMood, Frame> = {
  awake: { eyes: "open" },
  idle: { eyes: "closed", boost: -0.12 },
  waiting: { eyes: "lidded", dx: 1 },
  done: { eyes: "happy", boost: 0.08 },
  failed: { eyes: "x", boost: -0.22 },
  working: { eyes: "open", dx: -1, light: [0.33, 0.33] },
  attention: { eyes: "wide", boost: 0.14 },
};

// Circles in every color plus the two balls, so a sidebar of bots reads as distinct faces.
const LOOKS: ReadonlyArray<{ shape: BotShape; color: BotColor }> = [
  { shape: "circle", color: "blue" },
  { shape: "football", color: "blue" },
  { shape: "basketball", color: "blue" },
  ...(["purple", "green", "teal", "pink", "red", "yellow"] as const).map((color) => ({
    shape: "circle" as const,
    color,
  })),
];

function ditherIndex(x: number, y: number, frame: Frame, lift: number) {
  const light = frame.light ?? [0.3, 0.26];
  const cx = (x + 0.5) / GRID - light[0];
  const cy = (y + 0.5) / GRID - light[1];
  const t = Math.max(0, Math.min(1, Math.hypot(cx, cy) / 0.95 - (frame.boost ?? 0) - lift));
  const v = t * 2;
  const band = Math.min(1, Math.floor(v));
  return v - band > bayerThreshold(x, y) ? band + 1 : band;
}

function skinMarks(shape: BotShape) {
  const marks = new Map<string, number>();
  const put = (x: number, y: number, layer: number) => {
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) marks.set(`${x},${y}`, layer);
  };
  if (shape === "football") {
    for (let t = -4; t <= 4; t += 1) {
      put(8 + t, 8 - t, 3);
      if (t > -4) put(8 + t, 9 - t, 3);
    }
    for (const t of [-3, -1, 1, 3]) {
      put(7 + t, 7 - t, 3);
      put(10 + t, 10 - t, 3);
    }
  } else if (shape === "basketball") {
    for (let y = 0; y < GRID; y += 1) put(12, y, 2);
    for (let x = 0; x < GRID; x += 1) {
      put(x, Math.round(13.5 + 3.5 * (1 - ((x - 12) / 12) ** 2)), 2);
    }
    for (let y = 0; y < GRID; y += 1) {
      const bow = Math.round(0.5 + 2.5 * Math.sin((Math.PI * (y + 0.5)) / GRID));
      put(bow, y, 2);
      put(24 - bow, y, 2);
    }
  }
  return marks;
}

function eyeGlyph(glyph: Glyph, w: number, h: number) {
  const cells: Array<[number, number]> = [];
  const pill = (top: number, rows: number, cutTop = true) => {
    for (let dy = 0; dy < rows; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        const edgeRow = (cutTop && dy === 0) || dy === rows - 1;
        if (w >= 3 && edgeRow && (dx === 0 || dx === w - 1)) continue;
        cells.push([dx, top + dy]);
      }
    }
  };
  switch (glyph) {
    case "closed":
      for (let dx = 0; dx < w; dx += 1) cells.push([dx, h - 2]);
      break;
    case "lidded":
      pill(2, h - 2, false);
      break;
    case "wide":
      pill(-1, h + 1);
      break;
    case "happy":
      cells.push([0, 2], [0, 3], [1, 1], [w - 1, 2], [w - 1, 3]);
      break;
    case "x":
      cells.push([0, 1], [2, 1], [1, 2], [0, 3], [2, 3]);
      break;
    default:
      pill(0, h);
  }
  return cells;
}

function eyeCells(shape: BotShape, frame: Frame) {
  const [lx, rx, top, w, h] = EYES[shape];
  const cells = new Set<string>();
  for (const x0 of [lx, rx]) {
    for (const [cx, cy] of eyeGlyph(frame.eyes, w, h)) {
      cells.add(`${x0 + cx + (frame.dx ?? 0)},${top + cy + (frame.dy ?? 0)}`);
    }
  }
  return cells;
}

function eyeOutline(eyes: Set<string>) {
  const out = new Set<string>();
  for (const cell of eyes) {
    const [x, y] = cell.split(",").map(Number) as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = `${x + dx},${y + dy}`;
      if (!eyes.has(next)) out.add(next);
    }
  }
  return out;
}

function resolveLook(key: string, look: BotLook | undefined) {
  let hash = 2166136261;
  for (const ch of key.toLowerCase()) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const fallback = LOOKS[(hash >>> 0) % LOOKS.length]!;
  return { shape: look?.shape ?? fallback.shape, color: look?.color ?? fallback.color };
}

export interface BotArt {
  fill: string;
  clip: string;
  edge: string;
  shape: BotShape;
  color: BotColor;
}

const cache = new Map<string, BotArt>();

/** `key` picks a stable default look; `override` replaces its shape or color. */
export function botArt(key: string, mood: BotMood, override?: BotLook): BotArt {
  const look = resolveLook(key, override);
  const cacheKey = `${look.shape}:${look.color}:${mood}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const skin = look.shape === "football" || look.shape === "basketball" ? SKINS[look.shape] : null;
  const stops = skin ? skin.stops : BOT_COLORS[look.color];
  const marks = skinMarks(look.shape);
  const frame = MOODS[mood];
  const eyes = eyeCells(look.shape, frame);
  const outline = eyeOutline(eyes);
  const rows: Array<Map<number, number[]>> = [new Map(), new Map(), new Map(), new Map()];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const cell = `${x},${y}`;
      // White eyes with a darkest-stop outline read on any part of the gradient.
      const index = eyes.has(cell)
        ? 3
        : outline.has(cell)
          ? 2
          : (marks.get(cell) ?? ditherIndex(x, y, frame, skin?.lift ?? 0));
      const layer = rows[index]!;
      const row = layer.get(y) ?? [];
      row.push(x);
      layer.set(y, row);
    }
  }
  const fills = [...stops, "#ffffff"];
  const body = rows
    .map((layer, i) => {
      let d = "";
      for (const [y, xs] of layer) {
        for (let a = 0; a < xs.length;) {
          let b = a;
          while (b + 1 < xs.length && xs[b + 1] === xs[b]! + 1) b += 1;
          d += `M${xs[a]} ${y}h${b - a + 1}v1h-${b - a + 1}z`;
          a = b + 1;
        }
      }
      return d ? `<path fill="${fills[i]}" d="${d}"/>` : "";
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${body}</svg>`;
  const art = {
    fill: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    clip: CLIPS[look.shape],
    edge: stops[1],
    shape: look.shape,
    color: look.color,
  };
  cache.set(cacheKey, art);
  return art;
}
