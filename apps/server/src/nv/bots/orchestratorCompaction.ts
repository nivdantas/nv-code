import {
  CommandId,
  IDLE_COMPACTION_TEXT,
  isLiveTopLevelBot,
  MessageId,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import { derivePendingBackgroundWork } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { IdleCompactionRecords } from "../../orchestration-v2/IdleCompaction.ts";
import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { forkParked } from "../../serverActivation.ts";

export const ORCHESTRATOR_COMPACT_TOKENS = 100_000;
// Drivers whose adapters turn a `/compact` message into a native compaction.
const COMPACTING_DRIVERS = new Set(["claudeAgent", "codex"]);

/** The finished run after which the Orchestrator should compact, or null. */
export function orchestratorCompactionRun({
  thread,
  runs,
  messages,
  providerThreads,
  providerTurns,
  runtimeRequests,
  turnItems,
  contextTransfers,
}: IdleCompactionRecords): RunId | null {
  if (!isLiveTopLevelBot(thread)) return null;
  const latestRun = runs
    .filter((run) => run.status !== "cancelled" || run.startedAt !== null)
    .reduce<(typeof runs)[number] | null>(
      (latest, run) => (latest === null || run.ordinal > latest.ordinal ? run : latest),
      null,
    );
  if (latestRun?.status !== "completed") return null;
  const message = messages.find((candidate) => candidate.id === latestRun.userMessageId);
  if (message === undefined || message.text.trim().toLowerCase() === IDLE_COMPACTION_TEXT) {
    return null;
  }
  if (
    runtimeRequests.some((request) => request.status === "pending") ||
    contextTransfers.some(
      (transfer) =>
        transfer.type === "merge_back" &&
        transfer.targetThreadId === thread.id &&
        transfer.status === "pending",
    ) ||
    derivePendingBackgroundWork({
      latestRun,
      runs,
      providerThreads,
      turnItems: turnItems.filter(
        (item) => item.type !== "subagent" || item.origin !== "app_owned",
      ),
      activeProviderThreadId: thread.activeProviderThreadId,
    }).length > 0
  ) {
    return null;
  }
  const providerThread = providerThreads.find(
    (candidate) => candidate.id === thread.activeProviderThreadId,
  );
  if (
    providerThread === undefined ||
    !COMPACTING_DRIVERS.has(providerThread.driver) ||
    providerThread.id !== latestRun.providerThreadId
  ) {
    return null;
  }
  const usedTokens = providerTurns
    .filter((turn) => turn.providerThreadId === providerThread.id && turn.tokenUsage !== undefined)
    .map((turn) => turn.tokenUsage!)
    .toSorted(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )[0]?.usedTokens;
  return (usedTokens ?? 0) >= ORCHESTRATOR_COMPACT_TOKENS ? latestRun.id : null;
}

/** Compacts the Orchestrator after a finished turn leaves its context over the threshold. */
export const startOrchestratorCompaction = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const compactIfDue = Effect.fn("NvOrchestratorCompaction.compactIfDue")(
    function* (threadId: ThreadId) {
      const thread = yield* projections.getThread(threadId);
      if (!isLiveTopLevelBot(thread) || thread.activeProviderThreadId === null) return;
      const providerThreadIds = [thread.activeProviderThreadId];
      const records = yield* projections.getThreadRecords(
        threadId,
        [
          "runs",
          "messages",
          "providerThreads",
          "providerTurns",
          "runtimeRequests",
          "turnItems",
          "contextTransfers",
        ],
        {
          turnItemStatuses: ["pending", "running", "waiting"],
          runStatuses: ["preparing", "starting", "running", "rolled_back"],
          includeLatestRun: true,
          providerThreadIds,
          providerTurnThreadIds: providerThreadIds,
          latestProviderTurnUsageOnly: true,
          runtimeRequestStatuses: ["pending"],
          contextTransferStatuses: ["pending"],
        },
      );
      const runId = orchestratorCompactionRun(records);
      if (runId === null) return;
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`nv:orchestrator-compact:${threadId}:${runId}`),
        messageId: MessageId.make(`nv-orchestrator-compact:${threadId}:${runId}`),
        threadId,
        text: IDLE_COMPACTION_TEXT,
        attachments: [],
        createdBy: "agent",
        creationSource: "server",
        // A worker update may have started a turn meanwhile; compact once it ends.
        dispatchMode: { type: "queue_after_active" },
      });
    },
    (effect, threadId) =>
      effect.pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Orchestrator compaction skipped", { threadId, cause }),
        ),
      ),
  );

  yield* forkParked(
    Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
      event.type === "run.updated" && event.payload.status === "completed"
        ? compactIfDue(event.threadId)
        : Effect.void,
    ),
  );
});
