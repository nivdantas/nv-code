import { msg } from "gt-react";

export const OP_SESSION_SETTINGS_PATH = "/settings/one-password";

export const OP_SESSION_SETTINGS_ITEM = {
  id: "op-session",
  title: msg("1Password sessions"),
  to: OP_SESSION_SETTINGS_PATH,
  searchTerms: [msg("op-session secrets CLI integration agent skill")],
} as const;
