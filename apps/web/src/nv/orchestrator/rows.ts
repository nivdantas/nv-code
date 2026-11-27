import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";

export function orchestratorRows(orderedBots: ReadonlyArray<EnvironmentThreadShell>) {
  const seen = new Set<EnvironmentId>();
  return orderedBots.filter((bot) => {
    if (bot.lineage.parentThreadId !== null || seen.has(bot.environmentId)) return false;
    seen.add(bot.environmentId);
    return true;
  });
}
