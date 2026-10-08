import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { APP_DIR, ROOT, inApp, isCode, listFiles, readText } from "./files.mjs";

const FORBIDDEN_ROOT_DIRS = ["lib", "src", "data"];

const IMPORT_RES = [
  /\bfrom\s*["']([^"']+)["']/g,
  /(?<![.\w])import\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const leavesApp = (abs) => {
  const rel = relative(APP_DIR, abs);
  return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
};

/** Returns a reason string when the specifier leaves app/, else null. */
function escapes(fromRel, spec) {
  const fromAbs = join(ROOT, fromRel);
  if (spec.startsWith("@/")) {
    return leavesApp(resolve(APP_DIR, spec.slice(2))) ? "@/ alias climbs out of app/" : null;
  }
  if (spec.startsWith(".")) {
    return leavesApp(resolve(dirname(fromAbs), spec)) ? "relative import leaves app/" : null;
  }
  if (isAbsolute(spec) || spec.startsWith("file:")) {
    return leavesApp(resolve(spec.replace(/^file:\/*/, "/"))) ? "absolute import leaves app/" : null;
  }
  return null;
}

export function run({ staged = false } = {}) {
  const problems = [];

  for (const d of FORBIDDEN_ROOT_DIRS) {
    if (existsSync(join(ROOT, d))) {
      problems.push(`${d}/ exists at the repo root. Code goes under app/${d}/ (AGENTS.md, Code layout).`);
    }
  }

  for (const p of listFiles({ staged })) {
    if (!inApp(p) || !isCode(p)) continue;
    const text = readText(p);
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      for (const re of IMPORT_RES) {
        for (const m of line.matchAll(re)) {
          const why = escapes(p, m[1]);
          if (why) problems.push(`${p}:${i + 1}: "${m[1]}": ${why}`);
        }
      }
    });
  }

  return problems;
}
