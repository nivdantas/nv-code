import { useAtomValue } from "@effect/atom-react";
import {
  enumerateDays,
  formatDayShort,
  formatTokens,
  formatUsd,
  makeWindow,
} from "@t3tools/shared/usageFormat";
import {
  collectLimitAccounts,
  collectLimitPools,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import { formatResetsIn } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { T, useGT, useLocale, useMessages } from "gt-react";
import { ArrowUpRightIcon } from "lucide-react";
import { useState } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useNowMinute } from "~/hooks/useNowMinute";
import { environmentPresentations } from "~/state/presentation";
import { useUsage } from "~/state/usage";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PaceIcon } from "./UsageLimits";
import { PROVIDER_PRESENTATION } from "./usageProviders";

const ACTIVITY_DAYS = 28;
const PROVIDERS = [PROVIDER_PRESENTATION.codex, PROVIDER_PRESENTATION.claude];

function WeeklyLimit({
  name,
  color,
  pool,
  now,
}: {
  name: string;
  color: string;
  pool: LimitPoolWindow;
  now: number;
}) {
  const gt = useGT();
  const m = useMessages();
  const nextReset = pool.resets.find(({ at }) => at > now);
  const resetsIn = nextReset ? formatResetsIn(nextReset.member.window, now, m) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <strong className="truncate font-medium">{name}</strong>
        {pool.pace ? <PaceIcon pace={pool.pace} /> : null}
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
          {gt("{percent}% left", { percent: pool.remainingPercent })}
        </span>
      </div>
      <div
        role="meter"
        aria-label={gt("{provider} weekly limit remaining", { provider: name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pool.remainingPercent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pool.remainingPercent}%`, backgroundColor: color }}
        />
      </div>
      {resetsIn ? <p className="text-2xs text-muted-foreground">{resetsIn}</p> : null}
    </div>
  );
}

function WeeklyLimitsWidget() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const now = Date.parse(useNowMinute());
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  const weekly = PROVIDERS.flatMap(({ label, color, driverKind }) => {
    const pool = pools.find((candidate) => candidate.driver === driverKind);
    const window = pool?.windows.find((candidate) => candidate.kind === "weekly");
    return window ? [{ label, color, window }] : [];
  });
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border/75 bg-card px-3 py-2.5">
      <h3 className="text-xs font-semibold">
        <T>Weekly limits</T>
      </h3>
      {weekly.length > 0 ? (
        weekly.map(({ label, color, window }) => (
          <WeeklyLimit key={label} name={label} color={color} pool={window} now={now} />
        ))
      ) : (
        <p className="text-xs text-muted-foreground">
          <T>No Codex or Claude weekly limits reported.</T>
        </p>
      )}
    </section>
  );
}

function UsageActivityWidget() {
  const gt = useGT();
  const locale = useLocale();
  const [window] = useState(() => makeWindow(ACTIVITY_DAYS));
  const { merged, isPending, isPartial } = useUsage(window);
  const days = enumerateDays(window.sinceDay, window.untilDay);
  const daily = new Map(merged.daily.map((entry) => [entry.day, entry]));
  const peak = Math.max(1, ...merged.daily.map(({ totalTokens }) => totalTokens));
  const costKnown = merged.costQuality.unpricedShare < 1;
  const dayLabel = (day: string) =>
    gt("{day}: {tokens} tokens", {
      day: formatDayShort(day, locale),
      tokens: formatTokens(daily.get(day)?.totalTokens ?? 0),
    });

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/75 bg-card px-3 py-2.5">
      <h3 className="text-xs font-semibold">
        <T>Token activity</T>
      </h3>
      {merged.records === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isPending ? <T>Loading usage…</T> : <T>No usage reported in the last 28 days.</T>}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground tabular-nums">
            <strong className="text-base font-semibold text-foreground">
              {formatTokens(merged.totalTokens)}
            </strong>
            <T>tokens · 28 days</T>
            {costKnown ? (
              <span className="ml-auto">{formatUsd(merged.costUsd, locale)}</span>
            ) : null}
          </div>
          <div
            className="grid grid-cols-14 gap-1"
            aria-label={gt("Daily token activity")}
            role="img"
          >
            {days.map((day) => {
              const tokens = daily.get(day)?.totalTokens ?? 0;
              return (
                <Tooltip key={day}>
                  <TooltipTrigger
                    render={
                      <span
                        className="aspect-square min-w-0 rounded-xs bg-muted"
                        style={
                          tokens > 0
                            ? {
                                backgroundColor: `color-mix(in oklab, var(--primary) ${20 + 80 * Math.sqrt(tokens / peak)}%, var(--muted))`,
                              }
                            : undefined
                        }
                      />
                    }
                  />
                  <TooltipPopup>{dayLabel(day)}</TooltipPopup>
                </Tooltip>
              );
            })}
          </div>
          {isPartial ? (
            <p className="text-2xs text-muted-foreground">
              <T>Partial usage data</T>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function DraftUsageWidgets() {
  const gt = useGT();
  const hasRoom = useMediaQuery("(min-height: 710px)");
  if (!hasRoom) return null;

  return (
    <section aria-label={gt("Usage overview")} className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        <WeeklyLimitsWidget />
        <UsageActivityWidget />
      </div>
      <div className="flex justify-end">
        <Button size="xs" variant="ghost-muted" render={<Link to="/usage" />}>
          <T>Open usage</T>
          <ArrowUpRightIcon />
        </Button>
      </div>
    </section>
  );
}
