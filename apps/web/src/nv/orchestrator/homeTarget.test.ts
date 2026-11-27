import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { findHomeOrchestrator, homeOrchestratorTarget } from "./homeTarget";

const here = EnvironmentId.make("here");
const thread = (id: string, fields: { bot?: boolean; archived?: boolean; env?: string } = {}) => ({
  id: ThreadId.make(id),
  environmentId: fields.env === undefined ? here : EnvironmentId.make(fields.env),
  botConfig: fields.bot === false ? null : { enabled: true as const, muteChildren: false },
  lineage: { parentThreadId: null },
  archivedAt: fields.archived ? "2026-11-27T00:00:00.000Z" : null,
  deletedAt: null,
});

describe("findHomeOrchestrator", () => {
  it("finds the live Bot on the draft's environment", () => {
    const threads = [
      thread("plain", { bot: false }),
      thread("archived", { archived: true }),
      thread("elsewhere", { env: "other" }),
      thread("nv-orchestrator"),
    ];
    expect(findHomeOrchestrator(threads, here)?.id).toBe("nv-orchestrator");
    expect(findHomeOrchestrator([thread("plain", { bot: false })], here)).toBeNull();
  });
});

describe("homeOrchestratorTarget", () => {
  const id = ThreadId.make("nv-orchestrator");
  it("targets the Orchestrator on the No project home until another target is picked", () => {
    expect(homeOrchestratorTarget(id, undefined, true, false)).toBe(id);
    expect(homeOrchestratorTarget(id, "project", true, false)).toBeNull();
    expect(homeOrchestratorTarget(id, undefined, false, false)).toBeNull();
    expect(homeOrchestratorTarget(id, "orchestrator", false, false)).toBe(id);
  });

  it("leaves triage drafts and environments without an Orchestrator alone", () => {
    expect(homeOrchestratorTarget(id, "orchestrator", true, true)).toBeNull();
    expect(homeOrchestratorTarget(null, undefined, true, false)).toBeNull();
  });
});
