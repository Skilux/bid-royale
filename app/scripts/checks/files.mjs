import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// app/ sits directly under the repo root (AGENTS.md). Not `git rev-parse`: inside a
// hook GIT_DIR is set and makes the work tree resolve to the cwd.
export const ROOT = resolve(APP_DIR, "..");

const MAX_BYTES = 1_000_000;

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

/**
 * Repo-relative paths to check. Default: tracked plus untracked-not-ignored.
 * `staged: true` (pre-commit hook): only files added/changed in the index.
 */
export function listFiles({ staged = false } = {}) {
  const rel = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    : [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard"]))];
  return rel.filter((p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile());
}

/** Tracked files only, for rules about what is committed. */
export function listTracked({ staged = false } = {}) {
  return staged ? listFiles({ staged }) : git(["ls-files", "--cached"]);
}

/** UTF-8 text of a repo-relative path, or null for binary or oversized files. */
export function readText(rel) {
  const abs = join(ROOT, rel);
  if (statSync(abs).size > MAX_BYTES) return null;
  const buf = readFileSync(abs);
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

export const isCode = (p) => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(p);
export const inApp = (p) => p.startsWith("app/");
