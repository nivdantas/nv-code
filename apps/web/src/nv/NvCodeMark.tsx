import type { ComponentProps } from "react";

export function NvCodeMark(props: Omit<ComponentProps<"img">, "src" | "alt">) {
  return <img {...props} src="/nv-code-icon.png" alt="" />;
}
