#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot fork tool; synchronous Node APIs keep it small.
// Builds the CSS for NV-CODE's built-in "Tako Ink" theme: Tako-streak's tako as pixel art,
// shaded with NV-CODE's ordered dither (apps/web/src/nv/bots/botArt.ts) in the home-glow blue
// (apps/web/public/nv-grain.png). It walks, runs, looks at you and jumps on the ground of the
// chat's left gutter.
//
//   node scripts/nv-tako-ink.ts                 writes apps/web/src/nv/theme/takoInk.css.generated.ts
//   node scripts/nv-tako-ink.ts --check         fails when that file is stale
//   node scripts/nv-tako-ink.ts --json <file>   also writes a published theme file (any T3 Code build)
//
// The CSS styles the app through stable data-* hooks only (see FORK.md, "Theme hooks"), so an
// upstream restyle cannot silently break it.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const root = NodePath.resolve(import.meta.dirname, "..");
const generatedFile = NodePath.join(root, "apps/web/src/nv/theme/takoInk.css.generated.ts");

type Cell = string; // "c,r"
type Layers = Map<string, Set<Cell>>;
type Point = readonly [number, number];

// NV-CODE dither: a 16x16 Bayer matrix.
function bayerMatrix(size: number): number[][] {
  let m: number[][] = [[0]];
  while (m.length < size) {
    const n = m.length;
    const next = Array.from({ length: n * 2 }, () => Array<number>(n * 2).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = m[y]![x]! * 4;
        next[y]![x] = v;
        next[y]![x + n] = v + 2;
        next[y + n]![x] = v + 3;
        next[y + n]![x + n] = v + 1;
      }
    m = next;
  }
  return m;
}
const B16 = bayerMatrix(16);
const bayer = (x: number, y: number) => (B16[y & 15]![x & 15]! + 0.5) / 256;

// Colours: NV-CODE home glow.
const BLUE = { light: "#7f9ef0", mid: "#3c6dec", dark: "#1842b4" } as const;
const LIGHT_ACCENT = "#2d5cd7";
const INK = "#0b1a52";
const WHITE = "#ffffff";
const CHEEK = "#ffc6e4";
const SPARK = "#a8c4ff";

// Tako geometry (Tako-streak TakoPet.tsx BODY, viewBox 200x170).
const CELL = 4;
const X0 = 16;
const Y0 = 16;
const COLS = 42;
const ROWS = 28;
const N4: ReadonlyArray<Point> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const cx = (c: number) => X0 + (c + 0.5) * CELL;
const cy = (r: number) => Y0 + (r + 0.5) * CELL;
const col = (x: number) => Math.floor((x - X0) / CELL);
const row = (y: number) => Math.floor((y - Y0) / CELL);
const key = (c: number, r: number): Cell => `${c},${r}`;
const unkey = (k: Cell) => k.split(",").map(Number) as [number, number];

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, n = 40): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const at = (k: 0 | 1) =>
      u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k];
    pts.push([at(0), at(1)]);
  }
  return pts;
}

/** Body cells. `lifts` raises each tentacle tip, left to right, for the walk cycle. */
function bodyCells(lifts: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0], sway = 0) {
  const poly: Point[] = [[22, 104], ...cubic([22, 104], [22, 18], [178, 18], [178, 104])];
  for (let i = 5, x = 178; i >= 0; i--, x -= 26) {
    const l = lifts[i] ?? 0;
    poly.push(...cubic([x, 104], [x + sway, 134 - l], [x - 26 + sway, 126 - l], [x - 26, 104]));
  }
  const inside = (px: number, py: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const body = new Set<Cell>();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) if (inside(cx(c), cy(r))) body.add(key(c, r));
  const edge = new Set(
    [...body].filter((k) => {
      const [c, r] = unkey(k);
      return N4.some(([dx, dy]) => !body.has(key(c + dx, r + dy)));
    }),
  );
  return { body, edge };
}

// Pixel helpers.
function add(layers: Layers, color: string, k: Cell) {
  let cells = layers.get(color);
  if (!cells) layers.set(color, (cells = new Set()));
  cells.add(k);
}

function svg(layers: Layers, height = ROWS): string {
  let out = "";
  for (const [color, cells] of layers) {
    const rows = new Map<number, number[]>();
    for (const k of cells) {
      const [c, r] = unkey(k);
      if (c < 0 || r < 0 || c >= COLS || r >= height) continue;
      let xs = rows.get(r);
      if (!xs) rows.set(r, (xs = []));
      xs.push(c);
    }
    let d = "";
    for (const [r, xs] of [...rows].toSorted((a, b) => a[0] - b[0])) {
      xs.sort((a, b) => a - b);
      for (let a = 0; a < xs.length;) {
        let b = a;
        while (b + 1 < xs.length && xs[b + 1] === xs[b]! + 1) b++;
        d += `M${xs[a]} ${r}h${b - a + 1}v1h-${b - a + 1}z`;
        a = b + 1;
      }
    }
    if (d) out += `<path fill='${color}' d='${d}'/>`;
  }
  // preserveAspectRatio='none' lets the hop squash and stretch the sprite.
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${COLS} ${height}' preserveAspectRatio='none' shape-rendering='crispEdges'>${out}</svg>`;
}

const dataUrl = (s: string) =>
  `url("data:image/svg+xml,${s.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/"/g, "'")}")`;

// Body: dithered skin, ink outline, cheeks.
function bodySvg(lifts?: ReadonlyArray<number>, sway = 0): string {
  const { body, edge } = bodyCells(lifts, sway);
  const layers: Layers = new Map();
  const bx0 = col(22);
  const bx1 = col(178);
  const by0 = row(40);
  const by1 = row(124);
  const stops = [BLUE.light, BLUE.mid, BLUE.dark];
  for (const k of body) {
    const [c, r] = unkey(k);
    if (edge.has(k)) {
      add(layers, INK, k);
      continue;
    }
    const u = (c - bx0 + 0.5) / (bx1 - bx0 + 1) - 0.34;
    const v = ((r - by0 + 0.5) / (by1 - by0 + 1) - 0.22) * ((by1 - by0) / (bx1 - bx0));
    const t = Math.max(0, Math.min(1, Math.hypot(u, v) / 0.62));
    const s = t * 2;
    const band = Math.min(1, Math.floor(s));
    add(layers, stops[s - band > bayer(c, r) ? band + 1 : band]!, k);
  }
  for (const [ex, ey] of [
    [58, 94],
    [142, 94],
  ] as const)
    for (const k of body) {
      if (edge.has(k)) continue;
      const [c, r] = unkey(k);
      const q = ((cx(c) - ex) / 11) ** 2 + ((cy(r) - ey) / 7) ** 2;
      if (q <= 0.5 || (q <= 1 && (c + r) % 2 === 0)) {
        for (const cells of layers.values()) cells.delete(k);
        add(layers, CHEEK, k);
      }
    }
  return svg(layers);
}

// Faces: NV-CODE bot eyes (white, ink-outlined) and a mouth.
const EYE_L = col(76) - 2;
const EYE_R = col(124) - 1;
const EYE_TOP = row(78) - 2;
const EW = 4;
const EH = 5;
const MOUTH_C = col(100) - 1;
const MOUTH_R = row(95);
type Eyes = "open" | "closed" | "lidded" | "wide" | "happy";
type Mouth = "smile" | "open" | "oh" | "flat" | "chew" | "sip" | "snore";

function eyeGlyph(glyph: Eyes): Point[] {
  const cells: Point[] = [];
  const pill = (top: number, rows: number, cutTop = true) => {
    for (let dy = 0; dy < rows; dy++)
      for (let dx = 0; dx < EW; dx++) {
        const edgeRow = (cutTop && dy === 0) || dy === rows - 1;
        if (edgeRow && (dx === 0 || dx === EW - 1)) continue;
        cells.push([dx, top + dy]);
      }
  };
  switch (glyph) {
    case "closed":
      for (let dx = 0; dx < EW; dx++) cells.push([dx, EH - 2]);
      break;
    case "lidded":
      pill(2, EH - 2, false);
      break;
    case "wide":
      pill(-1, EH + 1);
      break;
    case "happy":
      cells.push([0, 2], [0, 3], [1, 1], [2, 1], [3, 2], [3, 3]);
      break;
    case "open":
      pill(0, EH);
  }
  return cells;
}
const MOUTHS: Record<Mouth | "tongue", ReadonlyArray<Point>> = {
  smile: [
    [-2, 0],
    [2, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  open: [
    [-2, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
    [-1, 1],
    [1, 1],
    [0, 2],
  ],
  tongue: [[0, 1]],
  oh: [
    [0, 0],
    [-1, 1],
    [1, 1],
    [0, 2],
  ],
  flat: [
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  chew: [
    [-1, 0],
    [0, 1],
    [1, 0],
  ],
  sip: [
    [0, 0],
    [0, 1],
  ],
  snore: [[0, 1]],
};

// Props the tako holds in front of its mouth, as pixel rows ("." is empty). Rows start one
// row under the mouth; columns centre on it.
const RICE = "#f4f6ff";
const NORI = "#1e3b34";
const GLASS = "#dfe8ff";
const WATER = "#6fd3ff";
const PROP_COLORS: Record<string, string> = {
  o: INK,
  w: RICE,
  n: NORI,
  g: GLASS,
  a: WATER,
  z: WHITE,
};
const PROPS = {
  onigiri: [
    "....o....",
    "...owo...",
    "..owwwo..",
    ".owwwwwo.",
    "owwwwwwwo",
    "ownnnnnwo",
    "onnnnnnno",
  ],
  bitten: [
    ".........",
    ".........",
    ".........",
    ".o.o.o.o.",
    "owwwwwwwo",
    "ownnnnnwo",
    "onnnnnnno",
  ],
  lastBite: [
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
    ".o.o.o.o.",
    "onnnnnnno",
  ],
  crumbs: ["w.......w", ".........", "...w....."],
  glassFull: ["g...g", "gaaag", "gaaag", "gaaag", "gaaag", ".ggg."],
  glassHalf: ["g...g", "g...g", "g...g", "gaaag", "gaaag", ".ggg."],
  glassEmpty: ["g...g", "g...g", "g...g", "g...g", "g...g", ".ggg."],
  // Sleep: one, then two z's drift up beside the head.
  z1: [".........", ".........", "zzzz.....", "..z......", ".z.......", "zzzz....."],
  z2: [".....zzzz", ".......z.", "zzzz..z..", "..z..zzzz", ".z.......", "zzzz....."],
} satisfies Record<string, ReadonlyArray<string>>;
type Prop = keyof typeof PROPS;

function drawProp(layers: Layers, prop: Prop) {
  const rows = PROPS[prop];
  const sleeping = prop === "z1" || prop === "z2";
  // Z's float over the head's right side; food and drink sit under the mouth.
  const top = sleeping ? 0 : MOUTH_R + 2;
  const left = sleeping ? col(140) : MOUTH_C - Math.floor(rows[0]!.length / 2);
  rows.forEach((line, dy) =>
    [...line].forEach((ch, dx) => {
      const color = PROP_COLORS[ch];
      if (!color) return;
      const k = key(left + dx, top + dy);
      for (const cells of layers.values()) cells.delete(k);
      add(layers, color, k);
    }),
  );
}
const SPARKS: ReadonlyArray<Point> = [
  [col(30), row(34)],
  [col(172), row(28)],
  [col(100), row(20)],
];
const PLUS: ReadonlyArray<Point> = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
];

function face(eyes: Eyes, mouth: Mouth, sparks = false, ...props: Prop[]): string {
  const layers: Layers = new Map();
  const white = new Set<Cell>();
  for (const x0 of [EYE_L, EYE_R])
    for (const [dx, dy] of eyeGlyph(eyes)) white.add(key(x0 + dx, EYE_TOP + dy));
  const ring = new Set<Cell>();
  for (const k of white) {
    const [c, r] = unkey(k);
    for (const [dx, dy] of N4) if (!white.has(key(c + dx, r + dy))) ring.add(key(c + dx, r + dy));
  }
  layers.set(INK, ring);
  layers.set(WHITE, white);
  for (const [dx, dy] of MOUTHS[mouth]) add(layers, INK, key(MOUTH_C + dx, MOUTH_R + dy));
  if (mouth === "open")
    for (const [dx, dy] of MOUTHS.tongue) add(layers, CHEEK, key(MOUTH_C + dx, MOUTH_R + dy));
  if (sparks)
    for (const [sc, sr] of SPARKS)
      for (const [dx, dy] of PLUS) add(layers, SPARK, key(sc + dx, sr + dy));
  for (const prop of props) drawProp(layers, prop);
  return svg(layers);
}

function shadowSvg(): string {
  const height = 3;
  const layers: Layers = new Map();
  for (let r = 0; r < height; r++)
    for (let c = 0; c < COLS; c++) {
      const q = ((c + 0.5 - COLS / 2) / 17) ** 2 + ((r + 0.5 - height / 2) / 1.6) ** 2;
      if (q <= 1 && bayer(c, r) < 0.85 - q * 0.7)
        add(layers, q < 0.35 ? BLUE.dark : INK, key(c, r));
    }
  return svg(layers, height);
}

/**
 * The home glow as one SVG: an 8x8 Bayer threshold against an elliptical coverage gradient,
 * binarised by a filter. Same dot size and blues as nv-grain.png.
 */
function glowSvg(alpha: number): string {
  const b8 = bayerMatrix(8);
  let pattern = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const g = Math.round(((b8[y]![x]! + 0.5) / 64) * 255)
        .toString(16)
        .padStart(2, "0");
      pattern += `<path fill='#00${g}00' d='M${x} ${y}h1v1h-1z'/>`;
    }
  const W = 384;
  const H = 224;
  // Colour follows coverage R (0..0.55): edge #1842b4 to centre #7797e3.
  const edge = [0x18, 0x42, 0xb4].map((v) => v / 255);
  const centre = [0x77, 0x97, 0xe3].map((v) => v / 255);
  const channel = (i: number) =>
    `${((centre[i]! - edge[i]!) / 0.55).toFixed(3)} 0 0 0 ${edge[i]!.toFixed(3)}`;
  const matrix = [channel(0), channel(1), channel(2), "60 -60 0 0 0.5"].join(" ");
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' width='${W}' height='${H}' shape-rendering='crispEdges'>` +
    `<defs><radialGradient id='g'><stop offset='0' stop-color='#9a0000'/><stop offset='.45' stop-color='#620000'/><stop offset='.78' stop-color='#1c0000'/><stop offset='1' stop-color='#000000'/></radialGradient>` +
    `<pattern id='b' width='8' height='8' patternUnits='userSpaceOnUse'>${pattern}</pattern>` +
    `<filter id='d' x='0' y='0' width='1' height='1' color-interpolation-filters='sRGB'><feColorMatrix type='matrix' values='${matrix}'/>` +
    `<feComponentTransfer><feFuncA type='discrete' tableValues='0 ${alpha}'/></feComponentTransfer></filter></defs>` +
    `<g filter='url(#d)'><rect width='${W}' height='${H}' fill='url(#g)'/><rect width='${W}' height='${H}' fill='url(#b)' style='mix-blend-mode:screen'/></g></svg>`
  );
}

// Gentle gait: alternate tentacles lift a little; running lifts more and leans.
const WALK_A = [6, 0, 6, 0, 6, 0];
const WALK_B = [0, 6, 0, 6, 0, 6];
const RUN_A = [10, 0, 10, 0, 10, 0];
const RUN_B = [0, 10, 0, 10, 0, 10];
const sprites: Record<string, string> = {
  stand: bodySvg(),
  stepA: bodySvg(WALK_A),
  stepB: bodySvg(WALK_B),
  runRA: bodySvg(RUN_A, -4),
  runRB: bodySvg(RUN_B, -4),
  runLA: bodySvg(RUN_A, 4),
  runLB: bodySvg(RUN_B, 4),
  shadow: shadowSvg(),
  open: face("open", "smile"),
  blink: face("closed", "smile"),
  happy: face("happy", "open", true),
  wide: face("wide", "oh"),
  sleepy: face("lidded", "flat"),
  eat: face("wide", "open", false, "onigiri"),
  chomp: face("happy", "chew", false, "bitten"),
  chew: face("happy", "smile", false, "bitten"),
  chompLast: face("happy", "chew", false, "lastBite"),
  chewLast: face("happy", "chew", false, "crumbs"),
  drink: face("open", "sip", false, "glassFull"),
  gulp: face("closed", "sip", false, "glassHalf"),
  gulpLast: face("closed", "sip", false, "glassEmpty"),
  ahh: face("happy", "open", true, "glassEmpty"),
  doze: face("closed", "snore", false, "z1"),
  snooze: face("closed", "snore", false, "z2"),
};

// Choreography: one loop on the chat's left side.
// x is a percentage of the walkway; look is the eye offset in tako pixels.
type Gait = "stand" | "walk" | "runR" | "runL" | "skid" | "jump" | "sleep";
type Face =
  | "open"
  | "blink"
  | "happy"
  | "wide"
  | "sleepy"
  | "eat"
  | "chomp"
  | "chew"
  | "chompLast"
  | "chewLast"
  | "drink"
  | "gulp"
  | "gulpLast"
  | "ahh"
  | "doze"
  | "snooze";
const STILL: ReadonlyArray<readonly [number, Point]> = [[0, [0, 0]]];
/** Repeats `frames` every `step` seconds from `from` until `until`. */
function cycle(
  frames: ReadonlyArray<Face>,
  step: number,
  from: number,
  until: number,
): Array<readonly [number, Face]> {
  const out: Array<readonly [number, Face]> = [];
  for (let i = 0, t = from; t < until - 1e-6; i++, t += step)
    out.push([t, frames[i % frames.length]!]);
  return out;
}
interface Beat {
  readonly d: number;
  readonly x?: number;
  readonly gait: Gait;
  readonly h?: number;
  readonly face: ReadonlyArray<readonly [number, Face]>;
  readonly look: ReadonlyArray<readonly [number, Point]>;
}
const SCRIPT: ReadonlyArray<Beat> = [
  {
    d: 1.4,
    x: 0,
    gait: "stand",
    face: [
      [0, "open"],
      [0.9, "blink"],
      [1.05, "open"],
    ],
    look: [[0, [0, 0]]],
  },
  {
    d: 4.2,
    x: 55,
    gait: "walk",
    face: [
      [0, "open"],
      [2.6, "blink"],
      [2.75, "open"],
    ],
    look: [[0, [2, 0]]],
  },
  { d: 0.8, gait: "stand", face: [[0, "open"]], look: [[0, [2, -1]]] },
  { d: 0.8, gait: "stand", face: [[0, "open"]], look: [[0, [-2, -1]]] },
  {
    d: 1.5,
    gait: "stand",
    face: [
      [0, "wide"],
      [1.0, "happy"],
    ],
    look: [[0, [0, 0]]],
  },
  // Snack: an onigiri, three bites.
  {
    d: 3.6,
    gait: "stand",
    face: [
      [0, "eat"],
      ...cycle(["chomp", "chew"], 0.3, 0.7, 2.2),
      ...cycle(["chompLast", "chewLast"], 0.3, 2.2, 3.1),
      [3.1, "happy"],
    ],
    look: STILL,
  },
  { d: 1.0, gait: "jump", h: 16, face: [[0, "happy"]], look: [[0, [0, 0]]] },
  { d: 1.4, x: 100, gait: "runR", face: [[0, "open"]], look: [[0, [2, 0]]] },
  { d: 0.35, gait: "skid", face: [[0, "wide"]], look: [[0, [2, 0]]] },
  {
    d: 1.4,
    gait: "stand",
    face: [[0, "wide"]],
    look: [
      [0, [2, -1]],
      [0.7, [0, -1]],
    ],
  },
  {
    d: 0.8,
    gait: "stand",
    face: [
      [0, "open"],
      [0.4, "blink"],
      [0.55, "open"],
    ],
    look: [[0, [0, 0]]],
  },
  // A glass of water.
  {
    d: 3.0,
    gait: "stand",
    face: [
      [0, "drink"],
      [0.5, "gulp"],
      [1.3, "drink"],
      [1.5, "gulp"],
      [2.1, "gulpLast"],
      [2.5, "ahh"],
    ],
    look: STILL,
  },
  { d: 2.4, x: 10, gait: "runL", face: [[0, "open"]], look: [[0, [-2, 0]]] },
  { d: 0.35, gait: "skid", face: [[0, "wide"]], look: [[0, [-2, 0]]] },
  {
    d: 0.9,
    gait: "stand",
    face: [
      [0, "wide"],
      [0.5, "open"],
    ],
    look: [
      [0, [0, -1]],
      [0.5, [0, 0]],
    ],
  },
  { d: 0.6, gait: "jump", h: 7, face: [[0, "happy"]], look: [[0, [0, 0]]] },
  { d: 1.0, x: 0, gait: "walk", face: [[0, "open"]], look: [[0, [-2, 0]]] },
  {
    d: 1.6,
    gait: "stand",
    face: [
      [0, "sleepy"],
      [0.8, "blink"],
      [1.0, "sleepy"],
    ],
    look: STILL,
  },
  // A nap, breathing slowly, then it wakes.
  { d: 6.0, gait: "sleep", face: cycle(["doze", "snooze"], 1.0, 0, 6.0), look: STILL },
  {
    d: 1.2,
    gait: "stand",
    face: [
      [0, "sleepy"],
      [0.5, "blink"],
      [0.7, "open"],
    ],
    look: STILL,
  },
];

const LOOP = SCRIPT.reduce((sum, beat) => sum + beat.d, 0);
const pct = (t: number) => `${+((t / LOOP) * 100).toFixed(3)}%`;
const px = (n: number) => (n === 0 ? "0px" : `calc(var(--tako-px) * ${n})`);
const BODY = (frame: string) => `background-image: var(--tako-${frame}), var(--tako-shadow);`;
type Frames = Array<readonly [number, string]>;
const kf: Record<"x" | "gait" | "hop" | "face" | "look", Frames> = {
  x: [],
  gait: [],
  hop: [],
  face: [],
  look: [],
};
{
  let t = 0;
  let x = 0;
  for (const beat of SCRIPT) {
    const t1 = t + beat.d;
    kf.x.push([t, `--tako-x: ${x}%;`]);
    if (beat.x !== undefined) x = beat.x;
    kf.x.push([t1, `--tako-x: ${x}%;`]);
    for (const [at, f] of beat.face) kf.face.push([t + at, `background-image: var(--tako-${f});`]);
    for (const [at, [lx, ly]] of beat.look)
      kf.look.push([t + at, `--tako-lx: ${lx}; --tako-ly: ${ly};`]);
    const start = t;
    const hop = (at: number, jump: number, sx = 1, sy = 1) =>
      kf.hop.push([start + at, `--tako-jump: ${px(jump)}; --tako-sx: ${sx}; --tako-sy: ${sy};`]);
    switch (beat.gait) {
      case "stand":
        kf.gait.push([t, BODY("stand")]);
        hop(0, 0);
        break;
      case "walk":
      case "runR":
      case "runL": {
        // Four-beat cycle: plant, lift A, plant, lift B. The body rises one pixel on each lift.
        const run = beat.gait !== "walk";
        const beatLength = run ? 0.09 : 0.15;
        const frames = run
          ? ["stand", `${beat.gait}A`, "stand", `${beat.gait}B`]
          : ["stand", "stepA", "stand", "stepB"];
        const n = Math.max(4, Math.round(beat.d / beatLength / 4) * 4);
        const step = beat.d / n;
        for (let i = 0; i < n; i++) {
          const frame = frames[i % 4]!;
          kf.gait.push([t + i * step, BODY(frame)]);
          hop(i * step, frame === "stand" ? 0 : 1);
        }
        kf.gait.push([t1 - 0.001, BODY("stand")]);
        hop(beat.d, 0);
        break;
      }
      case "sleep":
        // Slow breaths: wider and lower on the out-breath.
        kf.gait.push([t, BODY("stand")]);
        for (let at = 0; at < beat.d - 1e-6; at += 2) {
          hop(at, 0);
          hop(at + 1, 0, 1.04, 0.94);
        }
        hop(beat.d, 0);
        break;
      case "skid":
        kf.gait.push([t, BODY("stand")]);
        hop(0, 0, 1.05, 0.95);
        hop(beat.d, 0);
        break;
      case "jump": {
        const h = beat.h ?? 10;
        const d = beat.d;
        kf.gait.push(
          [t, BODY("stand")],
          [t + d * 0.25, BODY("stepA")],
          [t + d * 0.7, BODY("stand")],
        );
        hop(0, 0);
        hop(d * 0.15, 0, 1.14, 0.8);
        hop(d * 0.32, Math.round(h * 0.8), 0.9, 1.14);
        hop(d * 0.45, h);
        hop(d * 0.62, Math.round(h * 0.25), 0.94, 1.08);
        hop(d * 0.7, 0, 1.16, 0.8);
        hop(d * 0.85, 0, 0.97, 1.04);
        hop(d, 0);
        break;
      }
    }
    t = t1;
  }
}
function keyframes(name: string, frames: Frames, rest: string): string {
  const byPercent = new Map<string, string>();
  for (const [t, v] of frames.toSorted((a, b) => a[0] - b[0]))
    byPercent.set(pct(Math.min(t, LOOP)), v);
  if (!byPercent.has("0%")) byPercent.set("0%", rest);
  if (!byPercent.has("100%")) byPercent.set("100%", rest);
  return `@keyframes ${name} {\n${[...byPercent].map(([p, v]) => `  ${p} { ${v} }`).join("\n")}\n}`;
}

// Theme CSS.
const spriteVars = Object.entries(sprites)
  .map(([name, art]) => `  --tako-${name}: ${dataUrl(art)};`)
  .join("\n");
const duration = `${LOOP.toFixed(2)}s`;
const CONVERSATION = `[data-workspace-area="conversation"]`;
const TAKO = `${CONVERSATION}::before,\n${CONVERSATION}::after`;
const USAGE = `[data-thread-details-section="thread-details-usage-heading"]`;
const USAGE_ROWS = `:is([data-thread-details-section="thread-details-context-heading"], ${USAGE})`;
const NORMAL_FILL = `[data-usage-fill="normal"]`;
const PICKER = (driver: string) =>
  `body:has([data-chat-provider-model-picker] [data-provider-driver="${driver}"]) ${USAGE}`;
const PROVIDERS: ReadonlyArray<{
  readonly driver: string;
  readonly label: string;
  readonly color: string;
  readonly lightText?: string;
}> = [
  // Light mode darkens Claude's orange label so it passes contrast on the pale canvas.
  { driver: "claudeAgent", label: "Claude", color: "#d97757", lightText: "#b4532f" },
  { driver: "codex", label: "Codex", color: "var(--foreground)" },
  { driver: "antigravity", label: "Antigravity", color: "#5b87bf", lightText: "#3d6ba6" },
];
const GRAIN = `repeating-conic-gradient(rgb(0 0 0 / 28%) 0% 25%, transparent 0% 50%)`;
const SHELF = `[data-sidebar-row^="shelf:"]`;

const css = `/* Tako Ink: Tako-streak's tako in NV-CODE's ordered dither and home-glow blue.
   It lives on the ground of the chat's left gutter: walks, runs, stops to look at you, jumps.
   Generated by scripts/nv-tako-ink.ts; styles only stable data-* hooks (FORK.md). */
@property --tako-x { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
@property --tako-jump { syntax: "<length>"; inherits: false; initial-value: 0px; }
@property --tako-sx { syntax: "<number>"; inherits: false; initial-value: 1; }
@property --tako-sy { syntax: "<number>"; inherits: false; initial-value: 1; }
@property --tako-lx { syntax: "<number>"; inherits: false; initial-value: 0; }
@property --tako-ly { syntax: "<number>"; inherits: false; initial-value: 0; }

/* Commit Mono (free, OFL) is a neutral, MonoLisa-like mono. MonoLisa wins when installed. */
:root {
  --font-mono: "MonoLisa", "CommitMono", "Commit Mono", ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace;
}
.chat-markdown code,
.chat-markdown-codeblock,
.chat-markdown-codeblock * {
  font-family: var(--font-mono);
}

${CONVERSATION} {
  container-type: inline-size;
  /* Keeps the tako's z-index inside the conversation, under the composer and popovers. */
  isolation: isolate;
}

/* ::before is the body (walk cycle) and its shadow, ::after the face. Both share one walkway:
   the gutter left of the chat column, with the tentacle tips on the bottom edge. */
${TAKO} {
${spriteVars}
  --tako-px: 3px;
  --tako-w: calc(var(--tako-px) * ${COLS});
  --tako-h: calc(var(--tako-px) * ${ROWS});
  content: "";
  position: absolute;
  z-index: 1;
  left: 12px;
  bottom: 0;
  width: max(var(--tako-w), calc((100% - var(--chat-content-max-width)) / 2 - 28px));
  height: calc(var(--tako-h) * 1.9);
  pointer-events: none;
  image-rendering: pixelated;
  background-repeat: no-repeat;
  background-size: calc(var(--tako-w) * var(--tako-sx)) calc(var(--tako-h) * var(--tako-sy));
}
${CONVERSATION}::before {
  background-image: var(--tako-stand), var(--tako-shadow);
  background-size:
    calc(var(--tako-w) * var(--tako-sx)) calc(var(--tako-h) * var(--tako-sy)),
    calc(var(--tako-w) * var(--tako-sx)) calc(var(--tako-px) * 3);
  background-position:
    var(--tako-x) calc(100% + var(--tako-px) - var(--tako-jump)),
    var(--tako-x) 100%;
  animation:
    tako-x ${duration} linear infinite,
    tako-hop ${duration} ease-in-out infinite,
    tako-gait ${duration} step-end infinite;
}
${CONVERSATION}::after {
  z-index: 2;
  background-image: var(--tako-open);
  background-position:
    calc(var(--tako-x) + var(--tako-lx) * var(--tako-px))
    calc(100% + var(--tako-px) - var(--tako-jump) + var(--tako-ly) * var(--tako-px));
  animation:
    tako-x ${duration} linear infinite,
    tako-hop ${duration} ease-in-out infinite,
    tako-face ${duration} step-end infinite,
    tako-look ${duration} step-end infinite;
}

/* The gutter must fit the tako (126px) beside the chat column, or it stays home. The column
   is 46rem, 72rem with the wide chat setting, and the full width with the full setting. */
@container (width < calc(46rem + 340px)) {
  ${TAKO.replace("\n", "\n  ")} {
    display: none;
  }
}
@container (width < calc(72rem + 340px)) {
  ${TAKO.replace(/^|\n/g, (m) => `${m}:root[data-chat-width="wide"] `).replace("\n", "\n  ")} {
    display: none;
  }
}
${TAKO.replace(/^|\n/g, (m) => `${m}:root[data-chat-width="full"] `)} {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  ${TAKO.replace("\n", "\n  ")} {
    animation: none;
  }
}

${keyframes("tako-x", kf.x, "--tako-x: 0%;")}

${keyframes("tako-hop", kf.hop, "--tako-jump: 0px; --tako-sx: 1; --tako-sy: 1;")}

${keyframes("tako-gait", kf.gait, BODY("stand"))}

${keyframes("tako-face", kf.face, "background-image: var(--tako-open);")}

${keyframes("tako-look", kf.look, "--tako-lx: 0; --tako-ly: 0;")}

/* The home's dithered glow, carried low and dim onto the thread page. The new-thread draft
   (data-nv-draft) keeps its own, brighter glow. Same 3px dots as nv-grain.png. */
${CONVERSATION} {
  --tako-glow-dark: ${dataUrl(glowSvg(0.42))};
  --tako-glow-light: ${dataUrl(glowSvg(0.14))};
}
${CONVERSATION}:not(:has(~ [data-workspace-area="composer"] [data-nv-draft])) {
  background-image: var(--tako-glow-dark);
  background-repeat: no-repeat;
  background-size: 1152px 672px;
  background-position: 50% calc(100% + 476px);
}
:root:not(.dark) ${CONVERSATION}:not(:has(~ [data-workspace-area="composer"] [data-nv-draft])) {
  background-image: var(--tako-glow-light);
}

/* Context, Session and Weekly rows in the thread details card: same size, more contrast.
   Warning and error tones keep their own colours. */
${USAGE_ROWS} [data-usage-label] {
  color: var(--foreground);
  opacity: 0.88;
}
${USAGE_ROWS} [data-usage-value="normal"] {
  color: var(--foreground);
  font-weight: 600;
}
${USAGE_ROWS} [data-usage-track] {
  background: color-mix(in srgb, var(--foreground) 24%, transparent);
}
${USAGE_ROWS} ${NORMAL_FILL} {
  background: ${BLUE.light};
  box-shadow: 0 0 6px color-mix(in srgb, ${BLUE.mid} 70%, transparent);
}
:root:not(.dark) ${USAGE_ROWS} ${NORMAL_FILL} {
  background: ${LIGHT_ACCENT};
  box-shadow: none;
}

/* Which provider the Session and Weekly limits belong to, read from the composer's model
   picker. Their bars take the provider's colour. */
${USAGE}::before {
  display: none;
  align-items: center;
  margin: 0 10px 4px;
  padding-left: 12px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tako-provider-text, var(--tako-provider));
  background: linear-gradient(var(--tako-provider), var(--tako-provider)) left center / 6px 6px no-repeat;
}
${PROVIDERS.map(
  (p) => `${PICKER(p.driver)} {
  --tako-provider: ${p.color};
}
${PICKER(p.driver)}::before {
  display: flex;
  content: "${p.label}";
}${
    p.lightText
      ? `
:root:not(.dark) ${PICKER(p.driver)} {
  --tako-provider-text: ${p.lightText};
}`
      : ""
  }`,
).join("\n")}
${USAGE} ${NORMAL_FILL} {
  background: var(--tako-provider, ${BLUE.light});
  box-shadow: 0 0 6px color-mix(in srgb, var(--tako-provider, ${BLUE.mid}) 60%, transparent);
}
:root:not(.dark) ${USAGE} ${NORMAL_FILL} {
  background: var(--tako-provider, ${LIGHT_ACCENT});
  box-shadow: none;
}

/* Sidebar shelves (Working, Snoozed, Settled): easier to find while scrolling. A dithered
   tile marks each one, and Working's pulses while threads run. A drop target keeps its
   own accent colour. */
${SHELF}[aria-expanded] {
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.6875rem;
}
${SHELF}:not(.text-primary) {
  color: color-mix(in srgb, var(--sidebar-foreground) 90%, transparent);
}
${SHELF}::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  background: ${BLUE.mid} ${GRAIN};
  background-size: 2px 2px;
}
${SHELF}:hover {
  background: color-mix(in srgb, ${BLUE.mid} 10%, transparent);
}
${SHELF} > span[aria-hidden] {
  background: color-mix(in srgb, var(--sidebar-foreground) 22%, transparent);
}
${SHELF} > .tabular-nums {
  min-width: 1.25rem;
  padding: 1px 6px;
  border-radius: 999px;
  text-align: center;
  letter-spacing: 0;
  color: var(--sidebar-foreground);
  background: color-mix(in srgb, var(--sidebar-foreground) 12%, transparent);
}
[data-sidebar-row="shelf:working"]::before {
  background-color: ${BLUE.light};
  animation: tako-shelf-pulse 1.6s steps(2, jump-none) infinite;
}
[data-sidebar-row="shelf:working"] > .tabular-nums {
  color: ${WHITE};
  background: ${BLUE.mid};
}
:root:not(.dark) [data-sidebar-row="shelf:working"]::before {
  background-color: ${LIGHT_ACCENT};
}
:root:not(.dark) [data-sidebar-row="shelf:working"] > .tabular-nums {
  background: ${LIGHT_ACCENT};
}
@keyframes tako-shelf-pulse {
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  [data-sidebar-row="shelf:working"]::before {
    animation: none;
  }
}

/* Tabs: the open one reads at a glance (tinted, with a tako-blue underline); the others are
   brighter than muted text. */
[data-right-panel-tab-list] [data-active-tab] {
  position: relative;
}
[data-right-panel-tab-list] [data-active-tab="false"] {
  color: color-mix(in srgb, var(--foreground) 74%, transparent);
}
[data-right-panel-tab-list] [data-active-tab="true"],
[role="tab"][aria-selected="true"] {
  color: var(--foreground);
  background: color-mix(in srgb, ${BLUE.mid} 22%, transparent);
  box-shadow: inset 0 -2px 0 ${BLUE.mid};
}
:root:not(.dark) [data-right-panel-tab-list] [data-active-tab="true"],
:root:not(.dark) [role="tab"][aria-selected="true"] {
  background: color-mix(in srgb, ${LIGHT_ACCENT} 14%, transparent);
  box-shadow: inset 0 -2px 0 ${LIGHT_ACCENT};
}

/* NV dither touches: tako-blue selection and a pixel-grain scrollbar. */
::selection {
  background: color-mix(in srgb, ${BLUE.mid} 45%, transparent);
}
::-webkit-scrollbar-thumb,
[data-slot="scroll-area-thumb"] {
  background-color: color-mix(in srgb, ${BLUE.mid} 55%, transparent);
  background-image: ${GRAIN};
  background-size: 4px 4px;
  border-radius: 0;
}
::-webkit-scrollbar-thumb:hover,
[data-slot="scroll-area-thumb"]:hover {
  background-color: color-mix(in srgb, ${BLUE.mid} 80%, transparent);
}
`;

// Output.
const MAX_THEME_CSS = 100_000;
if (css.length > MAX_THEME_CSS)
  throw new Error(`theme CSS is ${css.length} chars; the cap is ${MAX_THEME_CSS}`);
if (/url\(/.test(css.replace(/url\("data:[^"]*"\)/g, "")))
  throw new Error("theme CSS may only use data: URLs");

const generated = `// Generated by scripts/nv-tako-ink.ts (vp run theme:nv). Do not edit.
export const TAKO_INK_CSS =
  ${JSON.stringify(css)};
`;

const args = process.argv.slice(2);
if (args.includes("--check")) {
  const current = NodeFS.existsSync(generatedFile)
    ? NodeFS.readFileSync(generatedFile, "utf8")
    : "";
  if (current !== generated) {
    console.error("takoInk.css.generated.ts is stale: run `vp run theme:nv`.");
    process.exit(1);
  }
  console.log("Tako Ink CSS is up to date.");
} else {
  NodeFS.mkdirSync(NodePath.dirname(generatedFile), { recursive: true });
  NodeFS.writeFileSync(generatedFile, generated);
  console.log(`Tako Ink: ${css.length} chars, loop ${duration}`);
}

const jsonAt = args.indexOf("--json");
if (jsonAt !== -1) {
  const out = args[jsonAt + 1];
  if (!out) throw new Error("--json needs a file path");
  // A published theme file (schema version 1) for T3 Code builds without the built-in.
  // The id comes from the file name, so name it something other than tako-ink.json on
  // NV-CODE, where that id is reserved.
  const theme = {
    version: 1,
    name: "Tako Ink",
    appearance: "dark",
    canvas: "#0b1124",
    accent: BLUE.mid,
    colors: {
      focus: BLUE.mid,
      terminalCursor: BLUE.light,
      terminalSelection: "#1842b466",
      searchMatchActiveBackground: BLUE.mid,
    },
    variants: { light: { canvas: "#f0eeec", accent: LIGHT_ACCENT, focus: LIGHT_ACCENT } },
    css,
  };
  NodeFS.writeFileSync(NodePath.resolve(out), `${JSON.stringify(theme, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
