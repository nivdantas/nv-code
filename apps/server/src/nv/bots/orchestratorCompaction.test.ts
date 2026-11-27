import { describe, expect, it } from "@effect/vitest";

import type { IdleCompactionRecords } from "../../orchestration-v2/IdleCompaction.ts";
import {
  ORCHESTRATOR_COMPACT_TOKENS,
  orchestratorCompactionRun,
} from "./orchestratorCompaction.ts";

function records(
  options: {
    readonly usedTokens?: number;
    readonly text?: string;
    readonly bot?: boolean;
    readonly driver?: string;
    readonly pendingRequest?: boolean;
  } = {},
) {
  // Only the fields the decision reads; the rest of each record does not matter here.
  return {
    thread: {
      id: "nv-orchestrator",
      botConfig: options.bot === false ? null : { enabled: true, muteChildren: false },
      lineage: { parentThreadId: null },
      archivedAt: null,
      deletedAt: null,
      activeProviderThreadId: "provider-thread",
    },
    runs: [
      {
        id: "run-1",
        ordinal: 1,
        status: "completed",
        startedAt: "2026-11-27T00:00:00.000Z",
        userMessageId: "message-1",
        providerThreadId: "provider-thread",
      },
    ],
    messages: [{ id: "message-1", text: options.text ?? "Plan the release" }],
    providerThreads: [
      { id: "provider-thread", driver: options.driver ?? "codex", pendingBackgroundTasks: [] },
    ],
    providerTurns: [
      {
        providerThreadId: "provider-thread",
        tokenUsage: {
          usedTokens: options.usedTokens ?? ORCHESTRATOR_COMPACT_TOKENS,
          updatedAt: "2026-11-27T00:00:00.000Z",
        },
      },
    ],
    runtimeRequests: options.pendingRequest ? [{ status: "pending" }] : [],
    turnItems: [],
    contextTransfers: [],
  } as unknown as IdleCompactionRecords;
}

describe("orchestratorCompactionRun", () => {
  it("compacts the Orchestrator once a finished turn reaches the threshold", () => {
    expect(orchestratorCompactionRun(records())).toBe("run-1");
    expect(orchestratorCompactionRun(records({ driver: "claudeAgent" }))).toBe("run-1");
  });

  it("leaves small contexts, compactions, other threads and busy turns alone", () => {
    expect(
      orchestratorCompactionRun(records({ usedTokens: ORCHESTRATOR_COMPACT_TOKENS - 1 })),
    ).toBeNull();
    expect(orchestratorCompactionRun(records({ text: "/compact" }))).toBeNull();
    expect(orchestratorCompactionRun(records({ bot: false }))).toBeNull();
    expect(orchestratorCompactionRun(records({ driver: "cursor" }))).toBeNull();
    expect(orchestratorCompactionRun(records({ pendingRequest: true }))).toBeNull();
  });
});
