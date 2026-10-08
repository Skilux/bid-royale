import { basename } from "node:path";
import { listFiles, listTracked, readText } from "./files.mjs";

const PATTERNS = [
  ["private key block", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["OpenAI-style key (sk-)", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["Groq key (gsk_)", /\bgsk_[A-Za-z0-9]{20,}/],
  ["Google API key (AIza)", /\bAIza[0-9A-Za-z_-]{35}/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["hex value assigned to a *_KEY name", /\b[A-Za-z0-9_]*_KEY["']?\s*[:=]\s*["']?[0-9a-fA-F]{32,}\b/],
];

const SECRET_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD)$/;
const PLACEHOLDER = /^(?:<[^>]*>|your[-_ ].*|changeme|xxx+|\.\.\.)$/i;

const isEnvFile = (p) => /^\.env(?:\..+)?$/.test(basename(p));
const isEnvExample = (p) => basename(p) === ".env.example";

export function run({ staged = false } = {}) {
  const problems = [];

  for (const p of listTracked({ staged })) {
    if (isEnvFile(p) && !isEnvExample(p)) {
      problems.push(`${p}: env file is tracked. Only .env.example may be committed.`);
    }
  }

  for (const p of listFiles({ staged })) {
    const text = readText(p);
    if (text === null) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const [label, re] of PATTERNS) {
        if (re.test(line)) problems.push(`${p}:${i + 1}: ${label}`);
      }
      if (isEnvExample(p)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
        if (m && SECRET_NAME.test(m[1])) {
          const value = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
          if (value && !PLACEHOLDER.test(value)) {
            problems.push(`${p}:${i + 1}: ${m[1]} has a value. .env.example must be empty or a <placeholder>.`);
          }
        }
      }
    });
  }

  return problems;
}
