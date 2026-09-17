#!/usr/bin/env node
/**
 * Refuses a tree that would publish a credential. Runs as part of `pnpm lint`
 * (so on every Vercel build) and can be run alone: `pnpm secrets:check`.
 *
 * Two checks over TRACKED files only (git ls-files):
 *   1. no env file other than .env.example is tracked;
 *   2. no line matches a known credential shape (Anthropic, Inngest, Vercel
 *      Blob, Neon passwords, or a password inside a connection string).
 * Test fixtures and the redaction module itself are skipped — they contain
 * deliberately fake keys.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{8,}/],
  ["Inngest signing key", /signkey-(?:prod|test)-[A-Za-z0-9]{8,}/],
  ["Inngest event key", /\bINNGEST_EVENT_KEY=\S{8,}/],
  ["Vercel Blob token", /vercel_blob_rw_[A-Za-z0-9_]{8,}/],
  ["Neon password", /\bnpg_[A-Za-z0-9]{8,}/],
  ["password in a connection string", /[a-z]+:\/\/[^:/\s@"'`]+:[^@\s"'`]{4,}@[^\s"'`]+/],
];

const SKIP = (file) =>
  /\.test\.(ts|tsx|mjs)$/.test(file) ||
  file === "src/lib/redact.ts" ||
  file === "scripts/secrets-check.mjs" ||
  file === "pnpm-lock.yaml" ||
  /\.(png|jpg|jpeg|gif|ico|svg|woff2?|ttf|pdf|xlsx|docx|pptx|zip)$/i.test(file);

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

const problems = [];

for (const file of files) {
  if (/(^|\/)\.env(\..+)?$/.test(file) && file !== ".env.example") problems.push(`${file}: env file is tracked`);
}

for (const file of files) {
  if (SKIP(file)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [label, re] of PATTERNS) {
      if (re.test(line)) problems.push(`${file}:${i + 1}: looks like a ${label}`);
    }
  });
}

if (problems.length) {
  console.error("[secrets] refusing — fix these before committing:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`[secrets] ok — ${files.length} tracked files, nothing credential-shaped`);
