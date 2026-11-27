import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { isTriagePrompt } from "@t3tools/shared/triagePrompt";
import { useNavigate } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import { msg } from "gt-react";
import { useState } from "react";

import type { SideChatMessage } from "~/components/chat/useSideChat";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import { m } from "~/i18n/messages";
import { newMessageId } from "~/lib/utils";
import { threadEnvironment, environmentThreadShells } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { buildThreadRouteParams } from "~/threadRoutes";
import { findHomeOrchestrator, homeOrchestratorTarget, type HomeTargetChoice } from "./homeTarget";

const orchestratorAtom = Atom.family((environmentId: EnvironmentId | null) =>
  Atom.make((get) =>
    environmentId === null
      ? null
      : findHomeOrchestrator(get(environmentThreadShells.quietThreadShellsAtom), environmentId),
  ),
);

export type HomeOrchestrator = ReturnType<typeof useHomeOrchestrator>;

export function useHomeOrchestrator(
  draftId: DraftId | null,
  environmentId: EnvironmentId,
  isScratchDraft: boolean,
) {
  const orchestrator = useAtomValue(orchestratorAtom(draftId === null ? null : environmentId));
  const isTriageDraft = useComposerDraftStore(
    (store) =>
      isScratchDraft &&
      draftId !== null &&
      isTriagePrompt(store.getComposerDraft(draftId)?.prompt ?? ""),
  );
  const [selection, setSelection] = useState<{
    draftId: DraftId;
    choice: HomeTargetChoice;
  } | null>(null);
  const navigate = useNavigate();
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });

  const orchestratorId = isTriageDraft ? null : (orchestrator?.id ?? null);
  const targetId = homeOrchestratorTarget(
    orchestratorId,
    draftId === selection?.draftId ? selection.choice : undefined,
    isScratchDraft,
    isTriageDraft,
  );

  const send = async (
    message: SideChatMessage | undefined,
    modelSelection: ModelSelection | undefined,
  ): Promise<boolean> => {
    if (message === undefined || orchestrator === null || targetId === null) return false;
    const { titleSeed: _titleSeed, ...content } = message;
    const turn = await startTurn({
      environmentId,
      input: {
        threadId: orchestrator.id,
        message: { messageId: newMessageId(), role: "user", ...content },
        ...(modelSelection === undefined ? {} : { modelSelection }),
        runtimeMode: orchestrator.runtimeMode,
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    });
    if (turn._tag === "Failure") {
      if (!isAtomCommandInterrupted(turn)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Could not send to the Orchestrator.")),
            description: thrownErrorMessage(squashAtomCommandFailure(turn), m) ?? undefined,
          }),
        );
      }
      return false;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, orchestrator.id)),
    });
    return true;
  };

  return {
    orchestratorId,
    targetId,
    modelSelection: targetId === null ? null : (orchestrator?.modelSelection ?? null),
    selectTarget: (id: DraftId, choice: HomeTargetChoice) => setSelection({ draftId: id, choice }),
    send,
  };
}
