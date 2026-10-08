import { isCode, listFiles, readText } from "./files.mjs";

// Grep-level guard, not a proof. It flags a line under app/app/ that renders a
// money amount when no REAL / SIMULATED / PRE-RECORDED word (or a Badge
// identifier) appears within WINDOW lines of it.
const WINDOW = 6;
const CURRENCY = String.raw`(?:t?USDM|t?ADA|USDC|lovelace)`;
const LITERAL_AMOUNT = new RegExp(
  String.raw`(?:[$€₳]\s?\d|\b\d[\d.,]*\s?${CURRENCY}\b|\b${CURRENCY}\s?\d)`,
);
const MONEY_NAME = /\{[^}]*\b(?:amount|award|bond|price|payout|refund|escrow|forfeit\w*|fee|net)\w*[^}]*\}/i;
const JSX_LINE = /<[A-Za-z/][^>]*>|^\s*\{/;
const BADGE = /\b(?:REAL|SIMULATED|PRE-RECORDED)\b|[Bb]adge/;

const isUi = (p) => p.startsWith("app/app/") && isCode(p);

export function run({ staged = false } = {}) {
  const problems = [];
  for (const p of listFiles({ staged })) {
    if (!isUi(p)) continue;
    const text = readText(p);
    if (text === null) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      const money = LITERAL_AMOUNT.test(line) || (JSX_LINE.test(line) && MONEY_NAME.test(line));
      if (!money) return;
      const near = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join("\n");
      if (!BADGE.test(near)) {
        problems.push(`${p}:${i + 1}: money amount without REAL, SIMULATED or PRE-RECORDED within ${WINDOW} lines: ${line.trim()}`);
      }
    });
  }
  return problems;
}
