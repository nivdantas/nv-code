import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  isProviderAvailable,
  type ModelSelection,
  ProviderInstanceId,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import * as BotService from "../../bots/BotService.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import { forkParked } from "../../serverActivation.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

function selectOrchestratorModel(
  settings: Pick<ServerSettings, "defaultModelSelection" | "fallbackModelSelection">,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  const enabled = providers.filter((provider) => provider.enabled);
  const ready = enabled.filter(
    (provider) =>
      isProviderAvailable(provider) &&
      provider.installed &&
      provider.status !== "error" &&
      provider.auth.status !== "unauthenticated",
  );
  const defaults = [settings.defaultModelSelection, settings.fallbackModelSelection];
  const configured = defaults.find((selection) =>
    ready.some((provider) => provider.instanceId === selection?.instanceId),
  );
  if (configured) return configured;
  for (const provider of [...ready, ...enabled]) {
    const model =
      provider.models.find((candidate) => candidate.isDefault && !candidate.isCustom)?.slug ??
      provider.models[0]?.slug ??
      DEFAULT_MODEL_BY_PROVIDER[provider.driver];
    if (model !== undefined) return { instanceId: provider.instanceId, model };
  }
  return (
    settings.defaultModelSelection ?? {
      instanceId: ProviderInstanceId.make("codex"),
      model: DEFAULT_MODEL,
    }
  );
}

export const startOrchestrator = Effect.gen(function* () {
  const bots = yield* BotService.BotService;
  const registry = yield* ProviderRegistry.ProviderRegistry;
  const settings = yield* ServerSettingsService;
  const selectModel = Effect.gen(function* () {
    return selectOrchestratorModel(yield* settings.getSettings, yield* registry.getProviders);
  });
  yield* forkParked(
    bots.ensureOrchestrator(selectModel).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Could not ensure the NV-CODE Orchestrator", error),
      ),
      Effect.retry(Schedule.spaced("10 seconds")),
    ),
  );
});
