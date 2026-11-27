import { createFileRoute } from "@tanstack/react-router";

import { OpSessionSettings } from "~/nv/opSession/OpSessionSettings";

export const Route = createFileRoute("/_chat/settings/one-password")({
  component: OpSessionSettings,
});
