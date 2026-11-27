#!/usr/bin/env node
// op-session: approve 1Password ONCE, then reuse a 1Password Environment's
// secrets from memory for a limited time. No .env files, nothing on disk.
//
// A small background process is started through `op run --environment <ID>`.
// It holds the secrets in its own memory and runs commands on request over a
// user-only Unix socket. Commands get the secrets as environment variables;
// secret values are masked in their output.
//
// No dependencies beyond Node.js 18+ and the 1Password CLI. macOS and Linux.

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '1.1.0';
const SELF = fileURLToPath(import.meta.url);
const HOME_DIR = process.env.OP_SESSION_HOME || path.join(os.homedir(), '.op-session');
const RUN_DIR = path.join(HOME_DIR, 'run');
const USER_ENVS = path.join(HOME_DIR, 'environments');
const PROJECT_ENVS = '.op-environments';
const ID_RE = /^[a-z0-9]{26}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MASK = '<concealed by op-session>';
const MIN_MASK_LEN = 8;
const EXIT = { ERROR: 1, USAGE: 2, NOT_RUNNING: 3, DRY_RUN_FAILED: 4, START_FAILED: 5 };

const HOW_TO_GET_ID =
  '1Password app > Developer > View Environments > View environment > Manage environment > Copy environment ID';
const STOP_HELP = [
  'STOP: 1Password could not be reached or the request was not approved. Do NOT retry in a loop.',
  '  1. Unlock the 1Password desktop app and sign in to the right account.',
  '  2. Turn on Settings > Developer > "Integrate with 1Password CLI".',
  '  3. Try once more. If it still fails, run the same command in your own terminal',
  '     (some agent sandboxes cannot reach the 1Password app).',
].join('\n');

// ---------------------------------------------------------------- utilities --

const say = (m) => process.stderr.write(`op-session: ${m}\n`);
function die(msg, code = EXIT.USAGE) { say(msg); process.exit(code); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fingerprint = (v) => sha(v).slice(0, 12);
function seconds(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}
function which(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, bin);
    try { fs.accessSync(p, fs.constants.X_OK); if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

let heldLock = null;
process.on('exit', () => { if (heldLock) { try { fs.unlinkSync(heldLock); } catch {} } });

// ------------------------------------------------------ environment registry --

function parseEnvFile(file) {
  const map = new Map();
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return map; }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([^\s=]+)\s*(?:=|\s)\s*(\S+)$/);
    if (m && NAME_RE.test(m[1]) && ID_RE.test(m[2])) map.set(m[1], m[2]);
  }
  return map;
}

function findProjectFile() {
  let dir = process.cwd();
  for (;;) {
    const f = path.join(dir, PROJECT_ENVS);
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Project file first, then the user's own file overrides it (so each person
// can point a shared name at their own Environment).
function knownEnvs() {
  const out = new Map();
  const pf = findProjectFile();
  if (pf) for (const [k, v] of parseEnvFile(pf)) out.set(k, { id: v, source: pf });
  for (const [k, v] of parseEnvFile(USER_ENVS)) out.set(k, { id: v, source: USER_ENVS });
  return out;
}

function resolveEnv(arg) {
  if (!arg) die('missing <environment>. Run "op-session help".');
  if (ID_RE.test(arg)) return { name: arg, id: arg };
  const hit = knownEnvs().get(arg);
  if (hit) return { name: arg, id: hit.id };
  die(
    `unknown environment "${arg}".\n` +
    `  Ask the user for the Environment ID (${HOW_TO_GET_ID}),\n` +
    `  then register it once:  op-session add ${NAME_RE.test(arg) ? arg : '<name>'} <ENVIRONMENT_ID>\n` +
    '  (The ID is not a secret.)',
  );
}

function writeUserEnvs(map) {
  ensureDirs();
  const lines = ['# op-session environments: name=ENVIRONMENT_ID (IDs are not secrets)'];
  for (const k of [...map.keys()].sort()) lines.push(`${k}=${map.get(k)}`);
  fs.writeFileSync(USER_ENVS, lines.join('\n') + '\n', { mode: 0o600 });
}

// -------------------------------------------------------------------- paths --

function ensureDirs() {
  fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(HOME_DIR, 0o700);
  fs.chmodSync(RUN_DIR, 0o700);
}

function paths(id) {
  const base = path.join(RUN_DIR, sha(id).slice(0, 16));
  const sock = base + '.sock';
  if (Buffer.byteLength(sock) > 100) {
    die(`socket path is too long (${sock}). Set OP_SESSION_HOME to a shorter folder.`);
  }
  return { sock, log: base + '.log', lock: base + '.lock' };
}

// ------------------------------------------------------------------- client --

// Sends one request. `onFrame` is called for each reply frame; the first value
// it returns (other than undefined) resolves the promise.
// `onConnect(conn)` runs after the request line is sent (used to stream stdin).
function request(sock, req, { onFrame, timeoutMs, onConnect } = {}) {
  return new Promise((resolve, reject) => {
    const conn = net.connect(sock);
    conn.setEncoding('utf8');
    let buf = '';
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; fn(v); } };
    if (timeoutMs) conn.setTimeout(timeoutMs, () => { conn.destroy(); finish(reject, new Error('timeout')); });
    conn.on('error', (e) => finish(reject, e));
    conn.on('connect', () => {
      conn.write(JSON.stringify(req) + '\n');
      if (onConnect) onConnect(conn);
    });
    conn.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const r = onFrame ? onFrame(msg) : msg;
        if (r !== undefined) { finish(resolve, r); conn.end(); return; }
      }
    });
    conn.on('close', () => finish(reject, new Error('connection closed')));
  });
}

async function ping(sock) {
  try {
    const r = await request(sock, { op: 'ping' }, { timeoutMs: 2000 });
    return r && r.s === 'pong' ? r : null;
  } catch { return null; }
}

function describe(info) {
  const now = Date.now();
  const idleLeft = info.active ? Infinity : info.lastActivity + info.idleMs - now;
  const left = Math.max(0, Math.min(info.deadline - now, idleLeft));
  return `expires in about ${Math.max(1, Math.ceil(left / 60000))} min`;
}

// Forwards our stdin to the command as {s:'i'} frames, then {s:'ie'} at end of input.
function pipeStdin(conn) {
  const send = (obj) => { if (!conn.destroyed) conn.write(JSON.stringify(obj) + '\n'); };
  process.stdin.on('data', (d) => send({ s: 'i', d: d.toString('base64') }));
  process.stdin.on('end', () => send({ s: 'ie' }));
  process.stdin.on('error', () => send({ s: 'ie' }));
}

async function runThrough(env, argv, { stdin = false } = {}) {
  const { sock } = paths(env.id);
  try {
    return await request(sock, { op: 'run', cwd: process.cwd(), argv, env: process.env, stdin }, {
      onConnect: stdin ? pipeStdin : undefined,
      onFrame: (m) => {
        if (m.s === 'o') process.stdout.write(Buffer.from(m.d, 'base64'));
        else if (m.s === 'e') process.stderr.write(Buffer.from(m.d, 'base64'));
        else if (m.s === 'x') return m.c;
        return undefined;
      },
    });
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ECONNREFUSED') die(`no session for "${env.name}".`, EXIT.NOT_RUNNING);
    die(`the session ended before the command finished (${e.message}).`, EXIT.ERROR);
  }
}

// -------------------------------------------------------------------- start --

function findOp() {
  const candidates = [
    process.env.OP_SESSION_OP_BIN, which('op'),
    '/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op',
  ];
  for (const c of candidates) {
    if (!c) continue;
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  die('1Password CLI ("op") not found. Install it: https://developer.1password.com/docs/cli/get-started/ ' +
      '(macOS: brew install 1password-cli), or set OP_SESSION_OP_BIN.', EXIT.START_FAILED);
}

function checkOp(op) {
  const r = spawnSync(op, ['run', '--help'], { encoding: 'utf8' });
  if (!`${r.stdout}${r.stderr}`.includes('--environment')) {
    die('this 1Password CLI does not support Environments ("op run --environment"). ' +
        'Update it (macOS: brew upgrade 1password-cli).', EXIT.START_FAILED);
  }
}

async function acquireLock(lock, sock, waitMs) {
  const end = Date.now() + waitMs;
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx', 0o600)); heldLock = lock; return true; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    if (await ping(sock)) return false; // another start finished meanwhile
    let age;
    try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
    if (age > waitMs + 5000) { try { fs.unlinkSync(lock); } catch {} continue; }
    if (Date.now() > end) die('another "op-session start" is still waiting for approval.', EXIT.START_FAILED);
    await sleep(500);
  }
}

function releaseLock() {
  if (heldLock) { try { fs.unlinkSync(heldLock); } catch {} heldLock = null; }
}

// Makes sure a session is running. Returns its info. One 1Password prompt at most.
async function ensureSession(env) {
  ensureDirs();
  const p = paths(env.id);
  let info = await ping(p.sock);
  if (info) return info;

  const timeoutS = seconds('OP_SESSION_START_TIMEOUT', 120);
  if (!(await acquireLock(p.lock, p.sock, timeoutS * 1000))) return ping(p.sock);

  try {
    const idle = seconds('OP_SESSION_IDLE', 1800);
    const max = seconds('OP_SESSION_MAX', 1800);
    let cmd;
    if (process.env.OP_SESSION_TEST_RUNNER) {
      cmd = JSON.parse(process.env.OP_SESSION_TEST_RUNNER); // tests only: replaces `op run`
    } else {
      const op = findOp();
      checkOp(op);
      cmd = [op, 'run', '--environment', env.id, '--'];
    }
    cmd.push(process.execPath, SELF, 'serve', p.sock, String(idle), String(max));

    // The server works out which variables are secrets by comparing its
    // environment with this fingerprint of ours (names + short hashes only).
    const baseline = {};
    for (const [k, v] of Object.entries(process.env)) baseline[k] = fingerprint(v);

    try { fs.unlinkSync(p.sock); } catch {}
    const logFd = fs.openSync(p.log, 'w', 0o600);
    // detached = own session and process group, so the server survives when
    // the command that started it (for example an agent's tool call) ends.
    const child = spawn(cmd[0], cmd.slice(1), {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: os.homedir(),
      env: { ...process.env, OP_SESSION_BASELINE: JSON.stringify(baseline) },
    });
    fs.closeSync(logFd);
    let exited = false;
    child.on('exit', () => { exited = true; });
    child.on('error', () => { exited = true; });
    child.unref();

    say(`waiting for the 1Password approval for "${env.name}" (one prompt, up to ${timeoutS}s)...`);
    const end = Date.now() + timeoutS * 1000;
    while (Date.now() < end) {
      info = await ping(p.sock);
      if (info) {
        say(`session ready for "${env.name}" (${describe(info)}). Secrets are in memory only.`);
        return info;
      }
      if (exited) break;
      await sleep(400);
    }
    if (!exited) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }

    let tail = '';
    try { tail = fs.readFileSync(p.log, 'utf8').trim().split('\n').slice(-8).join('\n'); } catch {}
    say(exited ? 'the session could not start.' : `no approval within ${timeoutS}s.`);
    if (tail) process.stderr.write(tail.replace(/^/gm, '  | ') + '\n');
    process.stderr.write(STOP_HELP + '\n');
    process.exit(EXIT.START_FAILED);
  } finally {
    releaseLock();
  }
}

// ------------------------------------------------------------------- server --

function makeMasker(secrets) {
  if (!secrets.length) return { push: (b) => b, end: () => Buffer.alloc(0) };
  const maxLen = secrets[0].length; // sorted longest first
  let carry = '';
  return {
    push(buf) {
      let s = carry + buf.toString('latin1');
      for (const x of secrets) if (s.includes(x)) s = s.split(x).join(MASK);
      // Hold back a tail that could be the start of a secret split across chunks.
      let hold = 0;
      for (let k = Math.min(maxLen - 1, s.length); k > 0; k--) {
        const tail = s.slice(-k);
        if (secrets.some((x) => x.startsWith(tail))) { hold = k; break; }
      }
      carry = hold ? s.slice(-hold) : '';
      return Buffer.from(hold ? s.slice(0, -hold) : s, 'latin1');
    },
    end() { const b = Buffer.from(carry, 'latin1'); carry = ''; return b; },
  };
}

function serve([sock, idleArg, maxArg]) {
  const log = (m) => process.stderr.write(`op-session[server]: ${m}\n`);
  if (!sock || !process.env.OP_SESSION_BASELINE) {
    die('"serve" is internal. Use "op-session start <environment>".');
  }
  const baseline = JSON.parse(process.env.OP_SESSION_BASELINE);
  delete process.env.OP_SESSION_BASELINE;

  // Secrets = variables that 1Password added or changed.
  const secretVars = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (baseline[k] !== fingerprint(v)) secretVars[k] = v;
  }
  const maskList = [...new Set(Object.values(secretVars))]
    .filter((v) => v.length >= MIN_MASK_LEN)
    .map((v) => Buffer.from(v, 'utf8').toString('latin1'))
    .sort((a, b) => b.length - a.length);

  const idleMs = Number(idleArg) * 1000;
  const startedAt = Date.now();
  const deadline = startedAt + Number(maxArg) * 1000;
  let lastActivity = startedAt;
  let active = 0;
  let closing = false;

  const removeSocket = () => { try { fs.unlinkSync(sock); } catch {} };
  const exitNow = () => { removeSocket(); process.exit(0); };
  const send = (conn, obj) => { if (!conn.destroyed) conn.write(JSON.stringify(obj) + '\n'); };

  // Returns a handler for later frames on this connection ({s:'i'} stdin data, {s:'ie'} end).
  function runJob(conn, req) {
    active++;
    lastActivity = Date.now();
    let finished = false;
    const out = makeMasker(maskList);
    const err = makeMasker(maskList);
    const frame = (s, b) => { if (b.length) send(conn, { s, d: b.toString('base64') }); };
    const finish = (code) => {
      if (finished) return;
      finished = true;
      frame('o', out.end());
      frame('e', err.end());
      if (!conn.destroyed) conn.end(JSON.stringify({ s: 'x', c: code }) + '\n');
      active--;
      lastActivity = Date.now();
      if (closing && active === 0) exitNow();
    };
    const clientEnv = req.env && typeof req.env === 'object' ? req.env : process.env;
    let cwd = typeof req.cwd === 'string' && fs.existsSync(req.cwd) ? req.cwd : os.homedir();
    let child;
    try {
      child = spawn(req.argv[0], req.argv.slice(1), {
        cwd,
        env: { ...clientEnv, ...secretVars }, // caller's environment + the secrets
        stdio: [req.stdin === true ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: true, // own process group, so a cancelled job can be killed with its children
      });
    } catch (e) {
      frame('e', Buffer.from(`op-session: cannot run ${req.argv[0]}: ${e.message}\n`));
      finish(127);
      return () => {};
    }
    if (child.stdin) child.stdin.on('error', () => {}); // the command may exit without reading it all
    child.stdout.on('data', (d) => frame('o', out.push(d)));
    child.stderr.on('data', (d) => frame('e', err.push(d)));
    child.on('error', (e) => {
      frame('e', Buffer.from(`op-session: cannot run ${req.argv[0]}: ${e.message}\n`));
      finish(127);
    });
    child.on('close', (code, sig) => finish(code ?? 128 + (os.constants.signals[sig] || 0)));
    conn.on('close', () => {
      if (!finished && child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    });
    return (msg) => {
      if (!child.stdin || child.stdin.destroyed) return;
      lastActivity = Date.now();
      if (msg.s === 'i' && typeof msg.d === 'string') child.stdin.write(Buffer.from(msg.d, 'base64'));
      else if (msg.s === 'ie') child.stdin.end();
    };
  }

  const server = net.createServer((conn) => {
    conn.setEncoding('utf8');
    conn.on('error', () => {});
    let buf = '';
    let handled = false;
    let onInput = null; // set for a "run" with stdin: receives the frames after the request
    const drainInput = () => {
      let j;
      while (onInput && (j = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, j);
        buf = buf.slice(j + 1);
        try { onInput(JSON.parse(line)); } catch {}
      }
    };
    conn.on('data', (chunk) => {
      if (handled) {
        if (onInput) { buf += chunk; drainInput(); }
        return;
      }
      buf += chunk;
      const i = buf.indexOf('\n');
      if (i < 0) { if (buf.length > 8e6) conn.destroy(); return; }
      handled = true;
      let req;
      try { req = JSON.parse(buf.slice(0, i)); } catch { conn.destroy(); return; }
      buf = buf.slice(i + 1); // stdin frames may already follow the request
      if (req.op === 'ping') {
        conn.end(JSON.stringify({
          s: 'pong', version: VERSION, pid: process.pid, startedAt, deadline, idleMs, lastActivity, active,
        }) + '\n');
      } else if (req.op === 'vars') {
        lastActivity = Date.now();
        conn.end(JSON.stringify({ s: 'vars', names: Object.keys(secretVars).sort() }) + '\n');
      } else if (req.op === 'stop') {
        conn.end(JSON.stringify({ s: 'x', c: 0 }) + '\n', () => { log('shutting down (stop requested)'); exitNow(); });
      } else if (req.op === 'run' && Array.isArray(req.argv) && req.argv.length &&
                 req.argv.every((a) => typeof a === 'string')) {
        if (closing) {
          send(conn, { s: 'e', d: Buffer.from('op-session: this session has expired.\n').toString('base64') });
          conn.end(JSON.stringify({ s: 'x', c: EXIT.NOT_RUNNING }) + '\n');
        } else {
          const handler = runJob(conn, req);
          if (req.stdin === true) { onInput = handler; drainInput(); } else buf = '';
        }
      } else conn.destroy();
    });
  });

  function beginShutdown(why) {
    if (closing) return;
    closing = true;
    log(`shutting down (${why})`);
    server.close();
    removeSocket();
    if (active === 0) exitNow();
    else log(`waiting for ${active} running command(s) to finish`);
  }

  // Wall-clock checks, so the limits also hold across system sleep.
  setInterval(() => {
    const now = Date.now();
    if (now >= deadline) beginShutdown('time limit reached');
    else if (active === 0 && now - lastActivity >= idleMs) beginShutdown('idle timeout');
  }, 1000);

  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => { log(`shutting down (${sig})`); exitNow(); });
  }

  removeSocket();
  server.on('error', (e) => { log(`cannot listen: ${e.message}`); process.exit(1); });
  server.listen(sock, () => {
    fs.chmodSync(sock, 0o600);
    log(`ready (${Object.keys(secretVars).length} secret variable(s), idle ${idleMs / 1000}s, max ${maxArg}s)`);
  });
}

// ---------------------------------------------------------------- job logic --

function runnerFor(script) {
  const ext = path.extname(script).toLowerCase();
  const need = (bin, hint) => which(bin) || die(`${bin} not found on PATH${hint ? ` (${hint})` : ''}.`);
  if (['.mjs', '.js', '.cjs'].includes(ext)) return [process.execPath];
  if (['.ts', '.mts'].includes(ext)) return [need('tsx', 'needed to run TypeScript; npm i -g tsx')];
  if (ext === '.py') return [which('python3') || need('python')];
  if (['.sh', '.bash'].includes(ext)) return [which('bash') || '/bin/bash'];
  if (ext === '.zsh') return [need('zsh')];
  if (ext === '.rb') return [need('ruby')];
  try { fs.accessSync(script, fs.constants.X_OK); return []; } catch {}
  die(`don't know how to run ${script}. Use .js/.mjs/.ts/.py/.sh/.rb, or make it executable with a shebang.`);
}

async function cmdJob(args) {
  let dryOnly = false;
  while (args[0] && args[0].startsWith('--')) {
    const flag = args.shift();
    if (flag === '--dry-only') dryOnly = true;
    else die(`unknown option ${flag}`);
  }
  const [envArg, scriptArg, ...rest] = args;
  if (!envArg || !scriptArg) die('usage: op-session job [--dry-only] <environment> <script> [args...]');
  const env = dryOnly && !ID_RE.test(envArg) && !knownEnvs().has(envArg) ? null : resolveEnv(envArg);
  const script = path.resolve(scriptArg);
  if (!fs.existsSync(script) || !fs.statSync(script).isFile()) die(`script not found: ${scriptArg}`);
  const runner = runnerFor(script);

  if (!fs.readFileSync(script, 'utf8').includes('--dry-run')) {
    die(
      `${scriptArg} has no --dry-run mode, so it was not run.\n` +
      '  Add one: when called with --dry-run it must do everything except real network calls and writes,\n' +
      '  need no secrets, and exit non-zero on problems. This finds bugs before 1Password is asked.',
    );
  }

  say('dry run (no secrets, no 1Password)...');
  const dry = spawnSync(runner[0] || script, [...runner.slice(1), ...(runner.length ? [script] : []), '--dry-run', ...rest],
    { stdio: 'inherit' });
  if (dry.status !== 0) {
    die('dry run FAILED. Fix the script and run again. 1Password was not used.', EXIT.DRY_RUN_FAILED);
  }
  if (dryOnly) { say('dry run OK.'); return 0; }

  await ensureSession(env);
  say('dry run OK. Running with secrets...');
  return runThrough(env, [...runner, script, ...rest]);
}

// ----------------------------------------------------------------- commands --

async function cmdStatus([arg]) {
  const env = resolveEnv(arg);
  const info = await ping(paths(env.id).sock);
  if (!info) { console.log('not running'); return 1; }
  console.log(`running (${describe(info)})`);
  return 0;
}

async function cmdStop([arg]) {
  ensureDirs();
  const socks = arg === '--all'
    ? fs.readdirSync(RUN_DIR).filter((f) => f.endsWith('.sock')).map((f) => path.join(RUN_DIR, f))
    : [paths(resolveEnv(arg).id).sock];
  let stopped = 0;
  for (const sock of socks) {
    try { await request(sock, { op: 'stop' }, { timeoutMs: 3000 }); stopped++; } catch {
      try { fs.unlinkSync(sock); } catch {} // stale socket of a dead session
    }
  }
  console.log(stopped ? `stopped ${stopped} session(s)` : 'not running');
  return 0;
}

async function cmdList() {
  ensureDirs();
  const envs = knownEnvs();
  if (!envs.size) {
    console.log(`No environments registered. Add one:  op-session add <name> <ENVIRONMENT_ID>\n(ID: ${HOW_TO_GET_ID})`);
    return 0;
  }
  for (const [name, { id, source }] of [...envs].sort()) {
    const info = await ping(paths(id).sock);
    console.log(`${name}\t${id}\t${info ? `running, ${describe(info)}` : 'not running'}\t${source}`);
  }
  return 0;
}

function cmdAdd([name, id]) {
  if (!name || !id) die('usage: op-session add <name> <ENVIRONMENT_ID>');
  if (!NAME_RE.test(name)) die('the name may only use letters, digits, ".", "_" and "-".');
  if (!ID_RE.test(id)) die(`"${id}" is not an Environment ID (26 lowercase letters and digits). Get it from: ${HOW_TO_GET_ID}`);
  const map = parseEnvFile(USER_ENVS);
  map.set(name, id);
  writeUserEnvs(map);
  console.log(`added "${name}" (saved in ${USER_ENVS})`);
  return 0;
}

function cmdRemove([name]) {
  const map = parseEnvFile(USER_ENVS);
  if (!map.delete(name)) die(`"${name}" is not in ${USER_ENVS}.`);
  writeUserEnvs(map);
  console.log(`removed "${name}"`);
  return 0;
}

async function cmdVars([arg]) {
  const env = resolveEnv(arg);
  await ensureSession(env);
  const r = await request(paths(env.id).sock, { op: 'vars' }, { timeoutMs: 3000 });
  console.log(r.names.join('\n'));
  return 0;
}

async function cmdRun(args) {
  let stdin = false;
  while (args[0] && args[0].startsWith('--') && args[0] !== '--') {
    const flag = args.shift();
    if (flag === '--stdin') stdin = true;
    else die(`unknown option ${flag}`);
  }
  const env = resolveEnv(args.shift());
  if (args[0] === '--') args.shift();
  if (!args.length) die('usage: op-session run [--stdin] <environment> -- <command> [args...]');
  await ensureSession(env);
  const code = await runThrough(env, args, { stdin });
  if (stdin) process.stdin.destroy(); // let the process exit even if our stdin is still open
  return code;
}

// -------------------------------------------------------------- mcp-install --
// Writes an editor MCP entry in the one structure that is known to work:
//   /bin/bash <this launcher> run --stdin <env> -- /bin/sh -c '<PATH fix>; <map secret>; exec <server>'
// then starts it once and checks the MCP handshake before saving anything.

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const MCP_PRESETS = {
  monday: {
    about: 'monday.com official MCP server (local, via npx)',
    secret: 'MONDAY_API_TOKEN',
    shell: (o) => `MONDAY_TOKEN="$${o.secret}"; export MONDAY_TOKEN; ` +
      'exec npx -y @mondaydotcomorg/monday-api-mcp@latest',
    env: { NODE_OPTIONS: '--no-node-snapshot' },
  },
  n8n: {
    about: "an n8n instance's MCP server (remote URL, bridged to stdio with mcp-remote)",
    secret: 'N8N_MCP_TOKEN',
    needsUrl: true,
    bearerCheck: true, // mcp-remote falls back to browser OAuth on a bad token, so check it first
    // mcp-remote expands ${AUTH_HEADER} itself, so the token never appears in process arguments.
    shell: (o) => `AUTH_HEADER="Bearer $${o.secret}"; export AUTH_HEADER; ` +
      `exec npx -y mcp-remote@0.16.6 ${shq(o.url)} --header 'Authorization:\${AUTH_HEADER}'`,
  },
};

function buildMcpEntry(preset, o) {
  const p = MCP_PRESETS[preset];
  let nodeBin = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(nodeBin, 'npx'))) {
    const npx = which('npx');
    if (!npx) die('npx not found next to node or on PATH. Install Node.js with npm.');
    nodeBin = path.dirname(npx);
  }
  const launcher = path.join(path.dirname(SELF), 'op-session');
  const shell = `export PATH=${shq(nodeBin)}:"$PATH"; ${p.shell(o)}`;
  const entry = {
    command: '/bin/bash',
    args: [launcher, 'run', '--stdin', o.env, '--', '/bin/sh', '-c', shell],
  };
  if (p.env) entry.env = { ...p.env };
  return entry;
}

// Starts the server like an editor would and checks initialize + tools/list.
function testMcpEntry(entry, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(entry.command, entry.args, {
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(entry.env || {}) },
    });
    let out = ''; let errTail = []; let settled = false;
    const done = (r) => {
      if (settled) return; settled = true; clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 3000).unref();
      resolve({ ...r, stderr: errTail.slice(-8).join('\n') });
    };
    const timer = setTimeout(() => done({ ok: false, why: `no answer within ${timeoutMs / 1000}s` }), timeoutMs);
    const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
    child.stdin.on('error', () => {});
    child.on('error', (e) => done({ ok: false, why: e.message }));
    child.on('exit', (c) => done({ ok: false, why: `server exited (code ${c})` }));
    child.stderr.on('data', (d) => {
      for (const l of d.toString().split('\n')) if (l.trim() && !/npm (warn|notice)/.test(l)) errTail.push(l);
      // While waiting for the 1Password approval, show the user what is happening.
      if (/1Password approval|session ready/.test(d.toString())) process.stderr.write(d);
    });
    child.stdout.on('data', (d) => {
      out += d;
      let i;
      while ((i = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, i); out = out.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) {
          if (m.error) return done({ ok: false, why: `initialize failed: ${JSON.stringify(m.error).slice(0, 200)}` });
          send({ method: 'notifications/initialized' });
          send({ id: 2, method: 'tools/list', params: {} });
        } else if (m.id === 2) {
          if (m.error) return done({ ok: false, why: `tools/list failed: ${JSON.stringify(m.error).slice(0, 200)}` });
          return done({ ok: true, tools: (m.result?.tools || []).length });
        }
      }
    });
    send({ id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'op-session-mcp-install', version: VERSION },
    } });
  });
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    die(`${file} is not valid JSON (${e.message}). Fix it first; nothing was changed.`);
  }
}

async function cmdMcpInstall(args) {
  const o = { editor: 'cursor', project: false, force: false, test: true, print: false };
  const pos = [];
  while (args.length) {
    const a = args.shift();
    const val = () => args.shift() || die(`${a} needs a value`);
    if (a === '--editor') o.editor = val();
    else if (a === '--url') o.url = val();
    else if (a === '--secret') o.secret = val();
    else if (a === '--name') o.name = val();
    else if (a === '--project') o.project = true;
    else if (a === '--force') o.force = true;
    else if (a === '--no-test') o.test = false;
    else if (a === '--print') o.print = true;
    else if (a.startsWith('--')) die(`unknown option ${a}`);
    else pos.push(a);
  }
  const [preset, envArg] = pos;
  const usage = `usage: op-session mcp-install <${Object.keys(MCP_PRESETS).join('|')}> <env> [--url URL] [--secret VAR] ` +
    '[--name NAME] [--editor cursor|claude] [--project] [--force] [--no-test] [--print]';
  if (!preset || !envArg || pos.length > 2) die(usage);
  const p = MCP_PRESETS[preset];
  if (!p) die(`unknown server "${preset}". Known: ${Object.keys(MCP_PRESETS).join(', ')}.`);
  if (!['cursor', 'claude'].includes(o.editor)) die('--editor must be cursor or claude.');
  if (p.needsUrl && !/^https?:\/\/\S+$/.test(o.url || '')) {
    die(`${preset} needs --url with the MCP endpoint (for n8n: https://<host>/mcp-server/http).`);
  }
  if (o.secret && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(o.secret)) die('--secret must be a variable name.');
  o.secret = o.secret || p.secret;
  o.name = o.name || preset;
  if (!NAME_RE.test(o.name)) die('--name may only use letters, digits, ".", "_" and "-".');
  const env = resolveEnv(envArg);
  o.env = envArg;

  const entry = buildMcpEntry(preset, o);
  if (o.print) { console.log(JSON.stringify({ [o.name]: entry }, null, 2)); return 0; }

  // Where it goes, and refuse to replace an existing entry by accident.
  let file = null; let config = null;
  if (o.editor === 'cursor') {
    file = o.project ? path.resolve('.cursor', 'mcp.json') : path.join(os.homedir(), '.cursor', 'mcp.json');
    config = readJson(file);
    if (config.mcpServers && config.mcpServers[o.name] && !o.force) {
      die(`"${o.name}" already exists in ${file}. Use --force to replace it, or --name for another name.`);
    }
  } else {
    if (!which('claude')) die('the "claude" CLI was not found on PATH.');
    if (o.project) die('--project is only for Cursor; Claude Code entries are added for your user.');
    const exists = spawnSync('claude', ['mcp', 'get', o.name], { encoding: 'utf8' }).status === 0;
    if (exists && !o.force) die(`"${o.name}" already exists in Claude Code. Use --force to replace it, or --name.`);
  }

  if (o.test) {
    await ensureSession(env); // the one approval, shared with the test start below
    const r = await request(paths(env.id).sock, { op: 'vars' }, { timeoutMs: 3000 });
    if (!r.names.includes(o.secret)) {
      die(`"${o.secret}" is not in the "${env.name}" Environment. It has: ${r.names.join(', ') || '(nothing)'}.\n` +
        '  Add it in 1Password, or pass --secret <one of those names>. Nothing was changed.');
    }
    if (p.bearerCheck) {
      // Inside the session: POST initialize with the token; print only the HTTP status.
      const probe = `const r=await fetch(process.argv[1],{method:'POST',headers:{'Content-Type':'application/json',` +
        `Accept:'application/json, text/event-stream',Authorization:'Bearer '+(process.env[process.argv[2]]||'')},` +
        `body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',` +
        `capabilities:{},clientInfo:{name:'probe',version:'1'}}})}).catch(e=>({status:'network error: '+e.message}));` +
        `console.log(r.status);process.exit(r.status>=200&&r.status<300?0:1)`;
      const saved = process.stdout.write.bind(process.stdout);
      let status = '';
      process.stdout.write = (c) => { status += c; return true; };
      const code = await runThrough(env, [process.execPath, '--input-type=module', '-e', probe, o.url, o.secret]);
      process.stdout.write = saved;
      if (code !== 0) {
        die(`${o.url} rejected the token in "${o.secret}" (HTTP ${status.trim()}). Nothing was changed.\n` +
          `  For n8n, "${o.secret}" must be the instance's MCP access token (n8n: Settings > Instance-level MCP > Connect > API key tab),\n` +
          '  not a public API key.', EXIT.ERROR);
      }
    }
    say(`testing the ${preset} MCP server...`);
    const t = await testMcpEntry(entry, 90000);
    if (!t.ok) {
      say(`the server did not work (${t.why}). Nothing was changed.`);
      if (t.stderr) process.stderr.write(t.stderr.replace(/^/gm, '  | ') + '\n');
      if (preset === 'n8n') {
        process.stderr.write(`  For n8n, "${o.secret}" must be the instance's MCP access token ` +
          '(n8n: Settings > Instance-level MCP > Connect > API key tab), not a public API key.\n');
      }
      return EXIT.ERROR;
    }
    say(`server works: ${t.tools} tools.`);
  }

  if (o.editor === 'cursor') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
    config.mcpServers = { ...(config.mcpServers || {}), [o.name]: entry };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log(`installed "${o.name}" in ${file} (backup saved next to it). Reload MCP servers in Cursor.`);
  } else {
    if (o.force) spawnSync('claude', ['mcp', 'remove', '-s', 'user', o.name], { stdio: 'ignore' });
    const r = spawnSync('claude', ['mcp', 'add-json', '-s', 'user', o.name, JSON.stringify({ type: 'stdio', ...entry })],
      { encoding: 'utf8' });
    if (r.status !== 0) die(`claude mcp add-json failed: ${(r.stderr || r.stdout || '').trim()}`, EXIT.ERROR);
    console.log(`installed "${o.name}" in Claude Code (user scope). Start a new session to load it.`);
  }
  return 0;
}

const HELP = `op-session ${VERSION}: approve 1Password once, reuse an Environment's secrets from memory.

Usage:
  op-session job [--dry-only] <env> <script> [args...]
                                  Test the script with --dry-run (no secrets), then run it with the
                                  secrets. Starts a session if needed (one 1Password prompt).
  op-session run [--stdin] <env> -- <command> [args...]
                                  Run any command with the secrets. Starts a session if needed.
                                  --stdin forwards this process's input to the command, for
                                  long-running stdio servers such as MCP servers. A running
                                  command keeps working after the session expires.
  op-session mcp-install <monday|n8n> <env> [--url URL] [--secret VAR] [--name NAME]
                     [--editor cursor|claude] [--project] [--force] [--no-test] [--print]
                                  Add an MCP server to Cursor (~/.cursor/mcp.json) or Claude Code
                                  in the tested structure, using this session for its secret.
                                  Starts the server once and saves only if it answers.
                                  n8n needs --url https://<host>/mcp-server/http and an MCP
                                  access token (default variable N8N_MCP_TOKEN).
  op-session start <env>          Start a session now (one 1Password prompt).
  op-session status <env>         "running" (exit 0) or "not running" (exit 1). Never prompts.
  op-session vars <env>           List the secret variable NAMES (never values).
  op-session stop <env> | --all   End a session; the secrets leave memory.
  op-session add <name> <ID>      Register an Environment ID under a name (IDs are not secrets).
  op-session remove <name>
  op-session list                 Registered environments and their status.

<env> is a registered name or an Environment ID.
  ID: ${HOW_TO_GET_ID}
  Names come from ${USER_ENVS}
  and from a "${PROJECT_ENVS}" file (name=ID per line) in the project or a parent folder.

Settings (environment variables):
  OP_SESSION_IDLE=1800            End the session after this many idle seconds.
  OP_SESSION_MAX=1800             End the session this many seconds after it started.
  OP_SESSION_START_TIMEOUT=120    How long to wait for the 1Password approval.
  OP_SESSION_HOME=~/.op-session   Where the name list, sockets and logs live.
  OP_SESSION_OP_BIN               Path to the "op" binary, if it is not on PATH.

Exit codes: the command's own code, or 2 usage/refused, 3 no session, 4 dry run failed, 5 could not start.
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (process.platform === 'win32') die('Windows is not supported (macOS and Linux only).');
  if (Number(process.versions.node.split('.')[0]) < 18) die('Node.js 18 or newer is required.');
  switch (cmd) {
    case 'serve': serve(args); return undefined; // stays alive
    case 'job': return cmdJob(args);
    case 'run': return cmdRun(args);
    case 'mcp-install': return cmdMcpInstall(args);
    case 'start': await ensureSession(resolveEnv(args[0])); return 0;
    case 'status': return cmdStatus(args);
    case 'vars': return cmdVars(args);
    case 'stop': return cmdStop(args);
    case 'add': return cmdAdd(args);
    case 'remove': return cmdRemove(args);
    case 'list': return cmdList();
    case 'version': case '--version': console.log(VERSION); return 0;
    case undefined: case 'help': case '--help': case '-h': process.stdout.write(HELP); return 0;
    default: die(`unknown command "${cmd}". Run "op-session help".`);
  }
  return 0;
}

main().then(
  (code) => { if (code !== undefined) process.exitCode = code; },
  (e) => { say(e && e.message ? e.message : String(e)); process.exitCode = EXIT.ERROR; },
);
