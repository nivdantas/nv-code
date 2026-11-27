---
name: op-session
description: Run scripts and commands with secrets from a 1Password Environment, with one 1Password approval per session and no .env files. Use when a task needs an API token or other secret kept in 1Password, when the user names a 1Password Environment, when repeated 1Password prompts are a problem, or when the user wants to install or set up the monday.com or n8n MCP server in Cursor or Claude Code with secrets from 1Password. Not for calling a service whose MCP tools are available in this chat (for example monday.com or n8n MCP tools): use those tools instead.
---

# op-session: 1Password secrets with one approval

Secrets from a 1Password Environment are held **in memory only** by a small background process after **one** 1Password approval (Touch ID or similar). Commands run through it get the secrets as environment variables with **no further prompts** until the session expires (30 minutes by default). Nothing is written to disk, no `.env` file is created, and secret values are masked in command output.

## The tool

NV-CODE installs this skill on the environment host in your provider’s user skills directory, for example `~/.claude/skills/op-session/` or `~/.agents/skills/op-session/`. The CLI is `scripts/op-session` next to this file. Resolve it from this file’s location and call it by its full path. If it fails with "permission denied", run it as `bash <full path>`. Below it is written as `op-session`.

| Command | What it does |
|---|---|
| `op-session job <env> <script> [args...]` | Tests the script with `--dry-run` (no secrets), then runs it with the secrets. Starts a session if needed. **Use this for scripts.** |
| `op-session run <env> -- <command> [args...]` | Runs a one-off command with the secrets. Starts a session if needed. |
| `op-session mcp-install <monday\|n8n> <env> [...]` | Installs an MCP server in Cursor or Claude Code in the tested structure. **The only way to set up an MCP server** (see step 6). |
| `op-session status <env>` | `running` or `not running`. Never prompts. |
| `op-session vars <env>` | Lists the secret variable **names** (never values). |
| `op-session stop <env>` | Ends the session. Only when the user asks. |
| `op-session list` | Registered environment names. |
| `op-session add <name> <ID>` | Registers an Environment ID under a name. |

`<env>` is a registered name or a 1Password Environment ID.

## MCP tools come first

Before using `op-session` to call a service's API, check whether that service's **MCP tools are available in this chat** (for example monday.com tools such as `get_board_items_page`, `create_item`, `change_item_column_values`, or n8n tools). **If they are, use the MCP tools and do not use `op-session`**: no script, no `curl`, no GraphQL call with the token. This holds even when the user mentions the token or the Environment.

Use `op-session` for that service only when:
- the MCP tools cannot do the task (an API the tools do not cover, a file upload, a bulk change over many items that is far better as one script);
- the user explicitly asks for a script or a direct API call; or
- the MCP tools fail or are not connected (say so in one line first).

When you fall back to `op-session` for a service that has MCP tools, tell the user in one line why the tools were not enough.

## Hard rules

1. **Never print, log, echo, or write a secret value.** Never create a `.env` file, and never put a secret in code, config, chat, or a commit.
2. **Never run** `env`, `printenv`, `set`, `echo $SECRET`, `op read`, or anything with `--reveal`. To see what is available, use `op-session vars <env>`.
3. **Never call `op` directly** (`op run`, `op whoami`, `op account list`, and so on). Every direct call can cost the user another 1Password prompt. Use `op-session` only.
4. **Never loop on failures.** If `op-session` prints `STOP`, or exits with code 5, do not retry and do not try variations. Show the user the message and wait.
5. **One approval per session.** `job` and `run` start a session by themselves when none is open. Do not start sessions in other ways, and do not start one "to check". **Never stop a session on your own**; every stop costs the user a new prompt later.
6. If a secret value ever appears in output, tell the user right away and recommend rotating it.

## Workflow

### 1. Find the environment
Run `op-session list`. If the name the user gave is listed, use it.

If it is not listed, ask the user **once** for the Environment ID (1Password app: Developer > View Environments > View environment > Manage environment > Copy environment ID), then register it:

```bash
op-session add <name> <ENVIRONMENT_ID>
```

The ID is not a secret. A project can also share names in a `.op-environments` file (`name=ID` per line) at its root.

### 2. Write the script with a `--dry-run` mode
`op-session job` refuses scripts without one. With `--dry-run` the script must:
- do everything it can without secrets: parse inputs, build requests, check its own logic on sample data;
- make **no** real network calls or writes, and need **no** secrets;
- print what it would do, and exit non-zero if something is wrong.

Read secrets from environment variables (check the names with `op-session vars <env>`, which may trigger the one approval). Test freely with:

```bash
op-session job --dry-only <env> <script> [args...]
```

This never touches 1Password.

### 3. Run it
```bash
op-session job <env> <script> [args...]
```

What happens:
1. The dry run executes without secrets. If it fails (exit code 4), fix the script and run again. 1Password was not used.
2. If no session is open, one is started. **Before running the command**, tell the user in one short line that a 1Password approval is about to appear and must be approved within 120 seconds. If it times out (exit code 5), do not retry by yourself: ask the user to say when they are ready, then run it once more.
3. The script runs with the secrets. Its exit code is returned.

If the real run fails because of a bug, fix it and confirm with `--dry-only` before running again. The session stays open, so the next real run does not prompt.

### 4. One-off commands
```bash
op-session run <env> -- sh -c 'curl -s -H "Authorization: Bearer $API_TOKEN" https://api.example.com/me'
```

Use **single quotes** so the variable is expanded inside the session, not in your own shell (where it is empty).

### 5. Finish: leave the session open
**Do not run `op-session stop` when a task is done.** The user often asks for another task that needs the same secrets, and a stopped session means another 1Password prompt. The session ends by itself after 30 minutes. Stop it only when the user asks you to (for example "end the session" or "lock it").

### 6. MCP servers (when the user asks to install or set one up)
**Always install with `op-session mcp-install`. Never write or edit the MCP config by hand, and never use `op run` in it.** The command writes the one structure that is tested to work, starts the server once, and saves only if it answers:

```bash
op-session mcp-install monday <env>                                          # monday.com
op-session mcp-install n8n <env> --url https://<host>/mcp-server/http        # n8n instance
```

| Option | Meaning |
|---|---|
| `--editor cursor` (default) / `claude` | Cursor: `~/.cursor/mcp.json`. Claude Code: user scope via `claude mcp add-json`. |
| `--project` | Cursor only: write `./.cursor/mcp.json` in the current project instead. |
| `--secret VAR` | Environment variable holding the token. Defaults: monday `MONDAY_API_TOKEN`, n8n `N8N_MCP_TOKEN`. |
| `--name NAME` | Server name in the config (default: the preset name). |
| `--force` | Replace an existing entry with that name (a backup of the file is kept). |
| `--print` | Show the entry without testing or writing. |

What it guarantees:
- The entry is `/bin/bash <this skill>/scripts/op-session run --stdin <env> -- /bin/sh -c '...'` with full paths, so it works when the editor is started from the Dock (nvm's `node` is not on `PATH` there).
- monday: the official `@mondaydotcomorg/monday-api-mcp`, with the token mapped to `MONDAY_TOKEN` (the name the server really reads).
- n8n: the instance's MCP endpoint bridged with a pinned `mcp-remote`, token sent as `Authorization: Bearer`, and kept out of process arguments.
- The token is checked first. A missing variable or a rejected token stops with a clear message and **nothing is written**.

Before running it, tell the user in one line that a 1Password approval may appear (if no session is open). If it fails:
- missing variable: show the names it lists and ask the user which one holds the token, or to add it in 1Password;
- n8n rejected the token (401): the variable must hold the **MCP access token** from n8n (Settings > Instance-level MCP > Connect > API key tab), not a public API key. Ask the user to add it to the Environment, then run the command again.

After installing, tell the user to reload MCP servers in the editor. If a session is open the server starts with no prompt; otherwise it starts one, shared with the agent's commands for 30 minutes. A running server keeps working after the session expires; only a restart after that needs a new approval.

## Exit codes
| Code | Meaning | What to do |
|---|---|---|
| 0 | Success | |
| 2 | Usage error, unknown environment, or script refused (no `--dry-run`) | Fix the call or the script |
| 3 | No session, or it expired during the command | Run the `job`/`run` command again once |
| 4 | Dry run failed | Fix the script; 1Password was not used |
| 5 | Session could not start (1Password locked, not reachable, not approved) | **Stop.** Report the message to the user |
| other | The command's own exit code | |

## Limits to tell the user when relevant
- While a session is open, any process running as the user can run commands with the secrets, without a prompt, until it expires or is stopped.
- Output masking is best effort. It hides exact secret values of 8 or more characters; it cannot hide encoded or transformed values (for example base64), or values a script writes to a file.
- Commands get no keyboard input (stdin is closed), except with `run --stdin`, which only forwards piped input (for MCP servers), not a terminal.
- A dry run only finds bugs it can reach without live data.
- macOS and Linux only. Needs Node.js 18+, the 1Password CLI with Environments support, and the 1Password desktop app with Settings > Developer > "Integrate with 1Password CLI" turned on.
