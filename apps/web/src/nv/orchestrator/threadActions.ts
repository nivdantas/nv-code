const HIDDEN_ORCHESTRATOR_ACTIONS = new Set([
  "archive",
  "delete",
  "settle",
  "snooze",
  "auto-settle",
  "turn-into-project",
]);

export function showOrchestratorThreadAction(isBot: boolean, action: string): boolean {
  return !isBot || !HIDDEN_ORCHESTRATOR_ACTIONS.has(action);
}
