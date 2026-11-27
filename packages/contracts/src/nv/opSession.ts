import * as Schema from "effect/Schema";

export const OpSessionStatus = Schema.Struct({
  supported: Schema.Boolean,
  enabled: Schema.Boolean,
  cliFound: Schema.Boolean,
  cliVersion: Schema.NullOr(Schema.String),
  environmentsSupported: Schema.Boolean,
  desktopInstalled: Schema.Boolean,
  nodeVersion: Schema.NullOr(Schema.String),
  skills: Schema.Array(
    Schema.Struct({
      provider: Schema.String,
      state: Schema.Literals(["missing", "current", "outdated", "unmanaged"]),
    }),
  ),
});
export type OpSessionStatus = typeof OpSessionStatus.Type;

export class OpSessionError extends Schema.TaggedError<OpSessionError>()("OpSessionError", {
  reason: Schema.Literals(["unsupported", "filesystem"]),
}) {}
