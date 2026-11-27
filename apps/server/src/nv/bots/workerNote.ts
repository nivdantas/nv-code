import type {
  EnvironmentId,
  MilestoneEvent,
  OrchestrationV2TurnItem,
  ThreadId,
} from "@t3tools/contracts";
import { formatThreadLink } from "@t3tools/shared/threadLinks";

export const WORKER_NOTE_PREFIX = "worker-run-";

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function workerRunNote(input: {
  readonly event: Extract<MilestoneEvent, { type: "thread.run_settled" }>;
  readonly threadId: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly title: string;
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
}) {
  const { event, threadId, environmentId, title, turnItems } = input;
  const final = turnItems.findLast(
    (item) =>
      item.runId === event.runId &&
      item.type === "assistant_message" &&
      !item.streaming &&
      !item.textOmitted &&
      item.delivery !== "async" &&
      (item.phase === undefined || item.phase === "final_answer") &&
      item.text.trim() !== "",
  );
  const excerpt =
    final?.type === "assistant_message" ? final.text.replace(/\s+/gu, " ").trim() : "";
  const outcome = event.outcome === "completed" ? "Worker turn completed." : "Worker turn failed.";
  return {
    title: truncate(title, 120),
    summary: excerpt === "" ? outcome : `${outcome} ${truncate(excerpt, 240)}`,
    body: [
      outcome,
      `Recorded at ${event.occurredAt}.`,
      formatThreadLink({ environmentId, threadId }),
      ...(excerpt === ""
        ? []
        : ["", "Worker's final reply excerpt:", `> ${truncate(excerpt, 1200)}`]),
    ].join("\n"),
  };
}
