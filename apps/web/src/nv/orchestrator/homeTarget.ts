import { isLiveTopLevelBot, type EnvironmentId, type ThreadId } from "@t3tools/contracts";

export type HomeTargetChoice = "orchestrator" | "project";

type Candidate = Parameters<typeof isLiveTopLevelBot>[0] & {
  readonly environmentId: EnvironmentId;
};

export function findHomeOrchestrator<T extends Candidate>(
  threads: readonly T[],
  environmentId: EnvironmentId,
): T | null {
  return (
    threads.find((thread) => thread.environmentId === environmentId && isLiveTopLevelBot(thread)) ??
    null
  );
}

/** Home sends to the Orchestrator unless the user picked a project or "No project". */
export function homeOrchestratorTarget(
  orchestratorId: ThreadId | null,
  choice: HomeTargetChoice | undefined,
  isScratchDraft: boolean,
  isTriageDraft: boolean,
): ThreadId | null {
  return !isTriageDraft && (choice === "orchestrator" || (choice === undefined && isScratchDraft))
    ? orchestratorId
    : null;
}
