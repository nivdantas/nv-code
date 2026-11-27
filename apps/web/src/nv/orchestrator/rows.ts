import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import type { BotGroups } from "@t3tools/client-runtime/state/thread-grouping";

export function orchestratorRows(orderedBots: ReadonlyArray<EnvironmentThreadShell>) {
  const seen = new Set<EnvironmentId>();
  return orderedBots.filter((bot) => {
    if (bot.lineage.parentThreadId !== null || seen.has(bot.environmentId)) return false;
    seen.add(bot.environmentId);
    return true;
  });
}

// Upstream keeps a Bot's workers off the thread list; NV-CODE lists them in their projects.
export function listOrchestratorWorkers<T>(groups: BotGroups<T>): BotGroups<T> {
  return { ...groups, botAndWorkerKeys: new Set(groups.boardByBotKey.keys()) };
}
