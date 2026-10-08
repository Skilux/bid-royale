#!/usr/bin/env node
// Pre-commit checks. Run from app/: `npm run check` (or `check:full`).
// Flags: --full (also next build), --hook (pre-commit mode: staged files only,
// per-step timeout, never blocks on a crash, timeout or missing tool).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR, inApp, isCode, listFiles } from "./checks/files.mjs";

const args = new Set(process.argv.slice(2));
const full = args.has("--full");
const hook = args.has("--hook");
const staged = hook;
const STEP_TIMEOUT_MS = hook ? 20_000 : undefined;

// Distinct exit code so the hook can tell a failed check from a crashed runner.
const CHECK_FAILED = 10;
const nodeBin = process.execPath;

function exec(cmd, argv, { env = {}, timeout = STEP_TIMEOUT_MS } = {}) {
  const r = spawnSync(cmd, argv, {
    cwd: APP_DIR,
    stdio: "inherit",
    timeout,
    env: { ...process.env, ...env },
  });
  if (r.error || r.signal) return { ok: false, infra: true, why: r.error?.code ?? r.signal };
  return { ok: r.status === 0, infra: false };
}

function findTests() {
  return listFiles({ staged: false })
    .filter((p) => inApp(p) && p.startsWith("app/lib/") && p.endsWith(".test.js"))
    .map((p) => p.slice("app/".length));
}

function tests() {
  const files = findTests();
  if (files.length === 0) return { ok: true, note: "no test files" };
  return exec(nodeBin, ["--test", "--test-timeout=30000", ...files], { env: { NODE_NO_WARNINGS: "1" } });
}

function scan(name) {
  return async () => {
    const { run } = await import(`./checks/${name}.mjs`);
    const problems = run({ staged });
    for (const p of problems) console.error(`  ${p}`);
    return { ok: problems.length === 0 };
  };
}

function lint() {
  const eslint = join(APP_DIR, "node_modules/eslint/bin/eslint.js");
  if (!existsSync(eslint)) {
    if (hook) return { ok: true, note: "eslint not installed in this worktree (run npm ci in app/), lint skipped" };
    return { ok: false, message: "eslint is not installed. Run `npm ci` in app/." };
  }
  let targets = ["."];
  if (staged) {
    targets = listFiles({ staged })
      .filter((p) => inApp(p) && isCode(p))
      .map((p) => p.slice("app/".length));
    if (targets.length === 0) return { ok: true, note: "no staged JS files" };
  }
  return exec(nodeBin, [eslint, "--no-warn-ignored", ...targets]);
}

function build() {
  return exec("npm", ["run", "build"], {
    env: { SIMULATE_PAYMENTS: "true", DEMO_MODE: "canned" },
    timeout: undefined,
  });
}

const steps = [
  ["tests", tests],
  ["secrets", scan("secrets")],
  ["layout", scan("layout")],
  ["badges", scan("badges")],
  ["lint", lint],
];
if (full) steps.push(["build", build]);

const t0 = Date.now();
for (const [name, fn] of steps) {
  const s = Date.now();
  console.log(`\n── ${name} ──`);
  let result;
  try {
    result = await fn();
  } catch (err) {
    result = { ok: false, infra: true, why: err.message };
  }
  const secs = ((Date.now() - s) / 1000).toFixed(1);
  if (result.ok) {
    console.log(`ok  ${name} (${secs}s)${result.note ? `: ${result.note}` : ""}`);
    continue;
  }
  if (hook && result.infra) {
    console.warn(`warn ${name} did not finish (${result.why}), not blocking the commit`);
    continue;
  }
  if (result.message) console.error(result.message);
  console.error(`\nFAILED: ${name} (${secs}s). Fix it, then rerun \`npm run check\` in app/.`);
  process.exit(CHECK_FAILED);
}
console.log(`\nAll checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
