import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, OpSessionStatus } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useGT } from "gt-react";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { useSearchableSetting } from "~/components/settings/settingsSearch";
import { useSettingsScope } from "~/components/settings/SettingsScopeContext";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { useAtomCommand } from "~/state/use-atom-command";
import { opSessionStatus, setOpSessionEnabled } from "./opSessionRpc";

export function OpSessionSettings() {
  const gt = useGT();
  const setting = useSearchableSetting();
  const { environment } = useSettingsScope();

  return (
    <SettingsPageContainer>
      <SettingsSection {...setting("op-session")} variant="plain">
        {environment?.connection.phase === "connected" ? (
          <HostSettings key={environment.environmentId} environmentId={environment.environmentId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {gt("Connect an environment to check its 1Password setup.")}
          </p>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function HostSettings({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const gt = useGT();
  const query = opSessionStatus({ environmentId, input: {} });
  const result = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const canManage = useAtomValue(setOpSessionEnabled.permissionAtom(environmentId));
  const setEnabled = useAtomCommand(setOpSessionEnabled, { reportFailure: false });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const status = AsyncResult.getOrElse(result, () => null);

  async function update(enabled: boolean) {
    setSaving(true);
    setSaveFailed(false);
    const outcome = await setEnabled({ environmentId, input: { enabled } });
    setSaveFailed(outcome._tag === "Failure");
    refresh();
    setSaving(false);
  }

  if (status === null) {
    if (result._tag === "Failure" && !result.waiting) {
      return (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{gt("Could not check 1Password on this host.")}</AlertTitle>
          <AlertDescription>
            {gt(
              "Check your connection and make sure the host is running NV-CODE with 1Password support.",
            )}
          </AlertDescription>
          <AlertAction>
            <Button size="xs" variant="outline" onClick={refresh}>
              {gt("Try again")}
            </Button>
          </AlertAction>
        </Alert>
      );
    }
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {gt("Checking 1Password on the host…")}
      </p>
    );
  }

  if (!status.supported) {
    return (
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertDescription>
          {gt("1Password sessions support macOS and Linux hosts.")}
        </AlertDescription>
      </Alert>
    );
  }

  const repairNeeded = status.skills.some(
    ({ state }) => state === "outdated" || state === "missing",
  );
  const busy = saving || result.waiting;
  const prerequisitesMissing =
    !status.cliVersion ||
    !status.environmentsSupported ||
    !status.desktopInstalled ||
    !status.nodeVersion;
  const enableLabel = gt("Enable op-session");
  const installed = gt("Installed");
  const unavailable = gt("Unavailable");

  return (
    <div className="flex flex-col gap-4">
      <Alert variant={prerequisitesMissing ? "warning" : "info"}>
        <TriangleAlertIcon />
        <AlertTitle>
          {prerequisitesMissing
            ? gt("1Password setup required on the host")
            : gt("CLI integration required")}
        </AlertTitle>
        <AlertDescription>
          <p>
            {gt(
              "In the 1Password desktop app, open Settings → Developer and turn on Integrate with 1Password CLI.",
            )}
          </p>
          <p>
            {gt(
              "The first command for an Environment asks you to approve access in the desktop app.",
            )}
          </p>
          <a
            className="underline underline-offset-2"
            href="https://developer.1password.com/docs/cli/get-started/"
            target="_blank"
            rel="noreferrer"
          >
            {gt("Install or update the 1Password CLI")}
          </a>
        </AlertDescription>
      </Alert>
      {saveFailed || result._tag === "Failure" ? (
        <Alert variant="error" role="alert">
          <AlertDescription>
            {saveFailed
              ? gt("Could not change the op-session installation on this host.")
              : gt("Could not check 1Password on this host.")}
          </AlertDescription>
        </Alert>
      ) : null}
      <SettingsSection title={gt("Agent skill")}>
        <SettingsRow
          title={enableLabel}
          description={gt(
            "Install the skill on this host. Then ask your agent to use op-session with a 1Password Environment.",
          )}
          control={
            <Switch
              size="sm"
              aria-label={enableLabel}
              checked={status.enabled}
              disabled={!canManage || busy}
              onCheckedChange={(enabled) => void update(enabled)}
            />
          }
        />
        {canManage && status.enabled && repairNeeded ? (
          <SettingsRow
            title={gt("Repair installation")}
            control={
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void update(true)}>
                {gt("Repair")}
              </Button>
            }
          />
        ) : null}
      </SettingsSection>
      <SettingsSection
        title={gt("Host requirements")}
        headerAction={
          <Button size="xs" variant="outline" disabled={busy} onClick={refresh}>
            {gt("Check again")}
          </Button>
        }
      >
        <SettingsRow
          title={gt("1Password CLI")}
          control={
            <StatusBadge ready={status.cliVersion !== null}>
              {status.cliVersion ?? (status.cliFound ? unavailable : gt("Missing"))}
            </StatusBadge>
          }
        />
        <SettingsRow
          title={gt("1Password Environments")}
          control={
            <StatusBadge ready={status.environmentsSupported}>
              {status.environmentsSupported ? gt("Supported") : unavailable}
            </StatusBadge>
          }
        />
        <SettingsRow
          title={gt("1Password desktop app")}
          control={
            <StatusBadge ready={status.desktopInstalled}>
              {status.desktopInstalled ? installed : gt("Missing")}
            </StatusBadge>
          }
        />
        <SettingsRow
          title={gt("Node.js 18 or later")}
          control={
            <StatusBadge ready={status.nodeVersion !== null}>
              {status.nodeVersion ?? unavailable}
            </StatusBadge>
          }
        />
      </SettingsSection>
      <SettingsSection title={gt("Provider skills")}>
        {status.skills.map(({ provider, state }) => (
          <SettingsRow key={provider} title={provider} control={<SkillBadge state={state} />} />
        ))}
      </SettingsSection>
    </div>
  );
}

function StatusBadge({ ready, children }: { readonly ready: boolean; readonly children: string }) {
  return <Badge variant={ready ? "success" : "warning"}>{children}</Badge>;
}

function SkillBadge({ state }: { readonly state: OpSessionStatus["skills"][number]["state"] }) {
  const gt = useGT();
  switch (state) {
    case "current":
      return <Badge variant="success">{gt("Installed")}</Badge>;
    case "unmanaged":
      return <Badge variant="secondary">{gt("Installed by you")}</Badge>;
    case "outdated":
      return <Badge variant="warning">{gt("Needs repair")}</Badge>;
    case "missing":
      return <Badge variant="outline">{gt("Missing")}</Badge>;
  }
}
