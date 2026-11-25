import type { ComponentProps } from "react";

export function NightshiftMark(props: Omit<ComponentProps<"img">, "src" | "alt">) {
  return <img {...props} src="/nightshift-icon.png" alt="" />;
}
