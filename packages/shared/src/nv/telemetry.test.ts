import { assert, describe, it } from "@effect/vitest";

import { isRelayTracingEnabled } from "../otelEnvironment.ts";

describe("NV-CODE relay tracing default", () => {
  it("is off until T3CODE_TELEMETRY_ENABLED turns it on", () => {
    assert.isFalse(isRelayTracingEnabled({}));
    assert.isTrue(isRelayTracingEnabled({ T3CODE_TELEMETRY_ENABLED: "true" }));
    assert.isFalse(isRelayTracingEnabled({ T3CODE_TELEMETRY_ENABLED: "false" }));
  });

  it("still lets DO_NOT_TRACK and the SDK kill switch override the opt-in", () => {
    const optedIn = { T3CODE_TELEMETRY_ENABLED: "true" };
    assert.isFalse(isRelayTracingEnabled({ ...optedIn, DO_NOT_TRACK: "1" }));
    assert.isFalse(isRelayTracingEnabled({ ...optedIn, OTEL_SDK_DISABLED: "true" }));
  });
});
