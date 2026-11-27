import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "~/connection/runtime";

export const opSessionStatus = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "nv:op-session:status",
  tag: WS_METHODS.nvOpSessionStatus,
  staleTimeMs: 0,
});

export const setOpSessionEnabled = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "nv:op-session:set-enabled",
  tag: WS_METHODS.nvOpSessionSetEnabled,
});
