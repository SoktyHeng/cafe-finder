// Explicit opt-in, billable parser evaluation. Never prints the key or responses.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
// Same precedence as Next: shell, .env.local, then .env. Load only AI settings.
for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) {
    const values = parseEnv(readFileSync(path, "utf8"));
    for (const name of ["AI_PROVIDER", "OPENAI_API_KEY", "NVIDIA_API_KEY"]) {
      if (!process.env[name] && values[name]) process.env[name] = values[name];
    }
  }
}
const nvidia = process.env.AI_PROVIDER === "nvidia";
const configured = (value) => value && value !== "replace-me" ? value : undefined;
const legacyNvidiaKey = process.env.OPENAI_API_KEY?.startsWith("nvapi-") ? process.env.OPENAI_API_KEY : undefined;
const key = nvidia ? configured(process.env.NVIDIA_API_KEY) ?? legacyNvidiaKey : configured(process.env.OPENAI_API_KEY);
if (!key || key === "replace-me") {
  console.error(`Set ${nvidia ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} locally before running live acceptance.`);
  process.exit(1);
}
if (!nvidia && key.startsWith("nvapi-")) {
  console.error("OPENAI_API_KEY contains an NVIDIA-format credential. Configure an OpenAI project API key for api.openai.com before running live acceptance.");
  process.exit(1);
}
if (nvidia) process.env.NVIDIA_API_KEY = key;
const result = spawnSync("pnpm exec vitest run src/lib/ai/live-eval.test.ts", {
  shell: true, stdio: "inherit", env: { ...process.env, AI_LIVE_EVAL: "1" },
});
process.exit(result.status ?? 1);
