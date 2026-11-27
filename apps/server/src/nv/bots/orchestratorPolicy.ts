import {
  BotError,
  CommandId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ServerCommand,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";

export class NvBotProvisioning extends Context.Reference<ThreadId | null>(
  "nv/bots/NvBotProvisioning",
  { defaultValue: () => null },
) {}

export const NV_BOT_COMMAND_PREFIX = "nv:bot:";
const ID_PREFIX = "nv-orchestrator";
export const NV_ORCHESTRATOR_TITLE = "Orchestrator";
export const NV_ORCHESTRATOR_PREFERENCES =
  "Coordinate work across my projects. Delegate investigation, implementation, and verification to worker threads. Keep me informed of results and ask me about decisions that need my input.";
export const singleBotMessage =
  "This environment already manages its own Orchestrator. Additional Bots cannot be created.";
export const refuseAdditionalBot = (threadId = ThreadId.make(ID_PREFIX)) =>
  new BotError({ threadId, reason: "cannot_start", detail: singleBotMessage });

export const isNvOrchestratorId = (id: ThreadId) =>
  id === ID_PREFIX || id.startsWith(`${ID_PREFIX}:`);

export const listLiveBotIds = (sql: SqlClient.SqlClient) =>
  sql<{ readonly thread_id: string }>`
    SELECT thread_id FROM orchestration_v2_projection_threads
    WHERE archived_at IS NULL AND deleted_at IS NULL
      AND json_extract(payload_json, '$.botConfig.enabled') = 1
      AND json_extract(payload_json, '$.lineage.parentThreadId') IS NULL
    ORDER BY created_at, thread_id
  `.pipe(Effect.map((rows) => rows.map((row) => ThreadId.make(row.thread_id))));

export const ensureNvOrchestrator = Effect.fn("NvBot.ensure")(function* <E>(deps: {
  readonly liveIds: Effect.Effect<ReadonlyArray<ThreadId>, E>;
  readonly findThread: (id: ThreadId) => Effect.Effect<OrchestrationV2AppThread | null, E>;
  readonly create: (id: ThreadId) => Effect.Effect<unknown, E>;
  readonly activate: (id: ThreadId) => Effect.Effect<void, E>;
  readonly retire: (id: ThreadId, keep: ThreadId) => Effect.Effect<void, E>;
}) {
  const [oldest, ...extras] = yield* deps.liveIds;
  if (oldest !== undefined) {
    yield* deps.activate(oldest);
    yield* Effect.forEach(extras, (id) => deps.retire(id, oldest), { discard: true });
    return oldest;
  }
  // An imported database can contain a tombstone. Reserve the next deterministic id in that case.
  let index = 0;
  let id = ThreadId.make(ID_PREFIX);
  while ((yield* deps.findThread(id)) !== null) {
    index += 1;
    id = ThreadId.make(`${ID_PREFIX}:${index}`);
  }
  yield* deps.create(id);
  return id;
});

export const nvBotLifecycleError = (
  command: OrchestrationV2ServerCommand,
  thread: OrchestrationV2AppThread,
  provisionedThreadId: ThreadId | null,
): string | undefined => {
  if (thread.botConfig == null || thread.lineage.parentThreadId !== null) return;
  switch (command.type) {
    case "thread.archive":
      if (provisionedThreadId === thread.id) return;
      if (thread.archivedAt === null) return "The Orchestrator cannot be archived.";
      return;
    case "thread.delete":
      if (thread.archivedAt === null) return "The Orchestrator cannot be deleted.";
      return;
    case "thread.unarchive":
      if (thread.archivedAt !== null) return singleBotMessage;
      return;
    case "thread.settle":
    case "thread.snooze":
      return "The Orchestrator stays active to receive updates from its workers.";
    case "thread.project.adopt-folder":
      return "The Orchestrator belongs in No project.";
    default:
      return;
  }
};

export const provisionNvBot = <A, E, R>(id: ThreadId, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(NvBotProvisioning, id));

export const nvBotCreateCommandId = (id: ThreadId) =>
  CommandId.make(`${NV_BOT_COMMAND_PREFIX}create:${id}`);
