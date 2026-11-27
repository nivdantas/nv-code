#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot fork tool; synchronous Node APIs keep it small.
// Lists the upstream files NV-CODE changes and fails when one is missing from FORK.md, so
// every touch point stays documented and a rebase knows where conflicts can come from.
//
//   node scripts/nv-touchpoints.ts [upstream-ref]   (default: upstream/main)
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const root = NodePath.resolve(import.meta.dirname, "..");
const upstream = process.argv[2] ?? "upstream/main";
const git = (...args: string[]) =>
  NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" });

let upstreamCommit: string;
try {
  upstreamCommit = git(
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${upstream}^{commit}`,
  ).trim();
} catch {
  console.error(
    `Cannot resolve ${upstream}. Fetch the upstream branch or pass a local upstream tag or ref.`,
  );
  process.exit(1);
}

const base = git("merge-base", "HEAD", upstreamCommit).trim();
const changed = new Set(
  [
    ...git("diff", "--name-only", "--no-renames", "-z", base).split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ].filter(Boolean),
);

// Fork-owned paths need no entry: they never conflict with upstream.
const OWNED = [
  /\/nv\//,
  /^scripts\/nv-/,
  /^FORK\.md$/,
  /^README\.md$/,
  /^apps\/web\/src\/i18n\/translations\//,
];
const forkDoc = NodeFS.readFileSync(NodePath.join(root, "FORK.md"), "utf8");
const documented = (file: string) =>
  forkDoc.includes(`\`${file}\``) || forkDoc.includes(`\`${NodePath.basename(file)}\``);

const touched = [...changed].filter((file) => !OWNED.some((owned) => owned.test(file))).toSorted();
const missing = touched.filter((file) => !documented(file));
console.log(`${touched.length} upstream files changed since ${base.slice(0, 10)} (${upstream}).`);
if (missing.length > 0) {
  console.error(`Not listed in FORK.md:\n${missing.map((file) => `  ${file}`).join("\n")}`);
  process.exit(1);
}
console.log("Every touch point is listed in FORK.md.");
