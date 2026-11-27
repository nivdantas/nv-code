import { assert, it } from "@effect/vitest";
import {
  type MilestoneEvent,
  MilestoneId,
  ProjectId,
  RunId,
  ThreadId,
  MessageId,
  TurnItemId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as BotService from "./BotService.ts";
import { makeOrchestration, model, provideBots } from "./BotTestkit.ts";

const bot = { enabled: true, muteChildren: false } as const;

const milestone = (
  id: string,
  fields:
    | {
        readonly threadId: string;
        readonly type?: "thread.run_settled" | "thread.needs_input";
        /** The run whose agent step the thread is. */
        readonly stepOf?: string;
        readonly outcome?: "completed" | "failed";
      }
    | { readonly workflowRunId: string },
): MilestoneEvent => {
  const envelope = {
    id: MilestoneId.make(id),
    occurredAt: "2026-11-20T00:00:00.000Z",
    projectId: ProjectId.make("project:a"),
    parentThreadId: null,
    actor: { type: "agent" as const },
    isSubagentChild: false,
  };
  if ("workflowRunId" in fields) {
    return {
      ...envelope,
      type: "workflow.run_ended",
      projectId: null,
      threadId: null,
      workflowRunId: fields.workflowRunId,
      workflow: "release",
      runTitle: "Release",
      parentWorkflowRunId: null,
      outcome: "completed",
      detail: null,
    };
  }
  const thread = {
    ...envelope,
    ...(fields.stepOf === undefined ? {} : { workflowRunId: fields.stepOf }),
  };
  return fields.type === "thread.needs_input"
    ? {
        ...thread,
        type: "thread.needs_input",
        threadId: ThreadId.make(fields.threadId),
        requestId: `request:${id}` as never,
        kind: "approval",
      }
    : {
        ...thread,
        type: "thread.run_settled",
        threadId: ThreadId.make(fields.threadId),
        runId: RunId.make(`run:${id}`),
        outcome: fields.outcome ?? "completed",
      };
};

it.effect("keeps a Bot's memory in its own folder and refuses writes from other threads", () => {
  const orchestration = makeOrchestration();
  const botThread = orchestration.addThread("../bot", { botConfig: bot });
  orchestration.addThread("thread:plain");
  return Effect.gen(function* () {
    const bots = yield* BotService.BotService;
    assert.deepStrictEqual(yield* bots.readFiles({ threadId: botThread.id }), {
      preferences: "",
      notes: [],
    });
    const refused = yield* bots
      .writeNote({
        threadId: ThreadId.make("thread:plain"),
        slug: "plan",
        title: "Plan",
        summary: "",
        body: "x",
      })
      .pipe(Effect.flip);
    assert.strictEqual(refused.reason, "not_a_bot");

    // A Bot from before notes were split keeps its notes.md as the note "notes".
    const { baseDir } = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const botFolder = path.join(baseDir, "bots", "thread-~2e~2e~2fbot");
    yield* fileSystem.makeDirectory(botFolder, { recursive: true });
    yield* fileSystem.writeFileString(path.join(botFolder, "notes.md"), "# Old plan\n");

    yield* bots.writeNote({
      threadId: botThread.id,
      slug: "release",
      title: "Release 2.1",
      summary: "What ships and when",
      body: "Tag on Friday.",
    });
    yield* bots.appendPreference({ threadId: botThread.id, text: "Use pnpm" });
    yield* bots.appendPreference({ threadId: botThread.id, text: "  Small PRs  " });
    const files = yield* bots.readFiles({ threadId: botThread.id });
    assert.strictEqual(files.preferences, "Use pnpm\nSmall PRs\n");
    assert.deepStrictEqual(files.notes.map(({ slug, title }) => [slug, title]).sort(), [
      ["notes", "Notes"],
      ["release", "Release 2.1"],
    ]);
    assert.strictEqual(
      (yield* bots.readNote({ threadId: botThread.id, slug: "notes" })).body,
      "# Old plan\n",
    );
    assert.deepStrictEqual(
      (yield* bots.searchNotes({ threadId: botThread.id, query: "friday" })).map(
        ({ slug, excerpt }) => [slug, excerpt],
      ),
      [["release", "Tag on Friday."]],
    );
    yield* bots.deleteNote({ threadId: botThread.id, slug: "notes" });
    const missing = yield* bots
      .readNote({ threadId: botThread.id, slug: "notes" })
      .pipe(Effect.flip);
    assert.strictEqual(missing.reason, "note_not_found");

    // An archived Bot keeps its memory but can no longer change it.
    botThread.archivedAt = "2026-11-20T00:00:00.000Z";
    assert.isFalse(yield* bots.isBot(botThread.id));

    // "../bot" cannot climb out: its folder name is escaped.
    assert.deepStrictEqual(yield* fileSystem.readDirectory(path.join(baseDir, "bots")), [
      "thread-~2e~2e~2fbot",
    ]);
  }).pipe(provideBots(orchestration));
});

it.effect(
  "wakes a Bot when its workers or a watched run reaches a milestone, and not once it is settled",
  () => {
    const orchestration = makeOrchestration();
    const leader = orchestration.addThread("thread:bot", { botConfig: bot });
    orchestration.addThread("thread:worker", { groupedUnderThreadId: leader.id });
    orchestration.addThread("thread:plain-worker", {
      groupedUnderThreadId: orchestration.addThread("thread:plain-leader").id,
    });
    return Effect.gen(function* () {
      const bots = yield* BotService.BotService;
      yield* bots.addWatch(leader.id, { workflowRunId: "run:release", reason: "manual" });

      yield* bots.handleMilestone(milestone("other", { threadId: "thread:other" }));
      // A leader that is not a Bot is never woken.
      yield* bots.handleMilestone(milestone("plain", { threadId: "thread:plain-worker" }));
      yield* bots.handleMilestone(
        milestone("ask", { threadId: "thread:worker", type: "thread.needs_input" }),
      );
      yield* bots.handleMilestone(milestone("done", { threadId: "thread:worker" }));
      // A watched run's agent step asking wakes the Bot; its turn ending neither wakes nor ends it.
      yield* bots.handleMilestone(
        milestone("step-ask", {
          threadId: "thread:step",
          type: "thread.needs_input",
          stepOf: "run:release",
        }),
      );
      yield* bots.handleMilestone(
        milestone("step-done", { threadId: "thread:step", stepOf: "run:release" }),
      );
      assert.lengthOf(yield* bots.watches(leader.id), 1);
      yield* bots.handleMilestone(milestone("release", { workflowRunId: "run:release" }));
      assert.deepStrictEqual(
        orchestration.sent.map((message) => [message.threadId, message.commandId]),
        [
          [leader.id, "bot-wake:ask:thread:bot"],
          [leader.id, "bot-wake:done:thread:bot"],
          [leader.id, "bot-wake:step-ask:thread:bot"],
          [leader.id, "bot-wake:release:thread:bot"],
        ],
      );
      assert.include(orchestration.sent[0]!.text, "waits for an approval");
      // The settled run's watch ended; workers stay watched with no watch at all.
      assert.deepStrictEqual(yield* bots.watches(leader.id), []);

      leader.settledOverride = "settled";
      yield* bots.handleMilestone(milestone("after-settle", { threadId: "thread:worker" }));
      assert.strictEqual(orchestration.sent.length, 4);
    }).pipe(provideBots(orchestration));
  },
);

it.effect("records completed and failed workers while the Orchestrator is busy", () => {
  const orchestration = makeOrchestration();
  const leader = orchestration.addThread("orchestrator", {
    botConfig: bot,
    activeRunId: RunId.make("busy"),
  });
  const worker = orchestration.addThread("worker", {
    title: "Checkout fix",
    groupedUnderThreadId: leader.id,
  });
  const runId = RunId.make("run:done");
  const now = DateTime.makeUnsafe("2026-11-20T00:00:00.000Z");
  orchestration.turnItemsByRun.set(runId, [
    {
      id: TurnItemId.make("final-reply"),
      threadId: worker.id,
      runId,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 1,
      status: "completed",
      title: null,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
      type: "assistant_message",
      phase: "final_answer",
      messageId: MessageId.make("final-reply"),
      text: "Fixed the checkout test.",
      streaming: false,
    },
  ]);
  return Effect.gen(function* () {
    const bots = yield* BotService.BotService;
    const completed = milestone("done", { threadId: "worker" });
    const failed = milestone("fail", { threadId: "worker", outcome: "failed" });
    yield* bots.handleMilestone(completed);
    yield* bots.handleMilestone(failed);
    yield* bots.handleMilestone(completed);
    const { notes } = yield* bots.readFiles({ threadId: leader.id });
    assert.sameMembers(
      notes.map(({ summary }) => summary),
      ["Worker turn completed. Fixed the checkout test.", "Worker turn failed."],
    );
    for (const { slug, title } of notes) {
      assert.strictEqual(title, "Checkout fix");
      const { body } = yield* bots.readNote({ threadId: leader.id, slug });
      assert.include(body, "<t3-thread://v2/env:here/worker>");
    }
  }).pipe(provideBots(orchestration));
});

it.effect("creates exactly one idle Orchestrator in scratch at startup", () => {
  const orchestration = makeOrchestration();
  return Effect.gen(function* () {
    const bots = yield* BotService.BotService;
    const ensure = bots.ensureOrchestrator(Effect.succeed(model));
    const [threadId, repeated] = yield* Effect.all([ensure, ensure], { concurrency: 2 });
    assert.strictEqual(threadId, repeated);
    assert.strictEqual(yield* ensure, threadId);

    assert.deepStrictEqual(orchestration.launched, [
      {
        threadId,
        projectId: ProjectId.make("project:scratch"),
        commandId: "nv:bot:create:nv-orchestrator",
        text: undefined,
      },
    ]);
    assert.strictEqual(orchestration.threads.get(threadId)?.title, "Orchestrator");
    assert.isTrue(yield* bots.isBot(threadId));
    yield* bots.writePreferences({ threadId, contents: "Remember my preferences." });
    yield* ensure;
    assert.strictEqual(
      (yield* bots.readFiles({ threadId })).preferences,
      "Remember my preferences.",
    );

    const refused = yield* bots
      .create({ title: "Another Bot", instructions: "", modelSelection: model })
      .pipe(Effect.flip);
    const start = yield* bots.start({ threadId }).pipe(Effect.flip);
    assert.include(refused.message, "Additional Bots cannot be created");
    assert.strictEqual(refused.message, start.message);
    assert.lengthOf(orchestration.launched, 1);
  }).pipe(provideBots(orchestration));
});

it.effect("keeps the oldest live Bot and moves the other Bots' workers to it", () => {
  const orchestration = makeOrchestration();
  const newest = orchestration.addThread("newest", {
    botConfig: bot,
    createdAt: "2026-11-20T01:00:00Z",
  });
  const oldest = orchestration.addThread("oldest", {
    botConfig: bot,
    createdAt: "2026-11-20T00:00:00Z",
    settledOverride: "settled",
  });
  const worker = orchestration.addThread("worker", { groupedUnderThreadId: newest.id });
  return Effect.gen(function* () {
    const bots = yield* BotService.BotService;
    const ensured = yield* bots.ensureOrchestrator(Effect.succeed(model));
    assert.strictEqual(ensured, oldest.id);
    assert.isTrue(yield* bots.isBot(oldest.id));
    assert.isNull(oldest.settledOverride);
    assert.isFalse(yield* bots.isBot(newest.id));
    assert.strictEqual(worker.groupedUnderThreadId, oldest.id);
    assert.isEmpty(orchestration.launched);
  }).pipe(provideBots(orchestration));
});
