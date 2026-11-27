import { describe, expect, it } from "vite-plus/test";

import { listOrchestratorWorkers } from "./rows";

describe("listOrchestratorWorkers", () => {
  it("keeps only the Orchestrator off the thread list, so its workers get rows", () => {
    const board = { needsYou: [], working: ["worker"], done: [] };
    const groups = listOrchestratorWorkers({
      bots: ["bot"],
      boardByBotKey: new Map([["env:bot", board]]),
      botAndWorkerKeys: new Set(["env:bot", "env:worker"]),
    });

    expect([...groups.botAndWorkerKeys]).toEqual(["env:bot"]);
    expect(groups.boardByBotKey.get("env:bot")).toBe(board);
  });
});
