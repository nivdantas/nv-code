// Palette adapted from t3+ (Copyright 2026 Alex Wang, PolyForm Noncommercial License 1.0.0).
export const SIDEBAR_COLORS = {
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

export type SidebarColor = keyof typeof SIDEBAR_COLORS;
export const SIDEBAR_COLOR_NAMES = Object.keys(SIDEBAR_COLORS) as SidebarColor[];
