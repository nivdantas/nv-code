/**
 * NV-CODE: product analytics and relay tracing are opt-in. Upstream turns them on outside CI;
 * here nothing is sent unless `T3CODE_TELEMETRY_ENABLED=true`.
 */
export const NV_TELEMETRY_ON_BY_DEFAULT: boolean = false;
