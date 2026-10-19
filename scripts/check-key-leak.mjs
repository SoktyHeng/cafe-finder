// Builds the app in live-provider mode with canary secrets and fails if any
// canary appears in the build output (client bundles, prerendered HTML, RSC
// payloads or server chunks). Secrets must only ever be read at runtime.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CANARIES = {
  OPENAI_API_KEY: "canary-openai-key-41fbd8",
  NVIDIA_API_KEY: "canary-nvidia-key-271d8a",
  GOOGLE_PLACES_SERVER_API_KEY: "canary-places-key-7f3a9c",
  GOOGLE_ROUTES_SERVER_API_KEY: "canary-routes-key-2b8e1d",
  SUPABASE_SERVICE_ROLE_KEY: "canary-service-role-5c4f0a",
};
const SKIP_DIRS = new Set(["cache", "dev"]);

// A single command string (no args array) avoids the DEP0190 shell warning on Windows.
const build = spawnSync("pnpm build", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PLACES_PROVIDER: "google", ENABLE_AI: "true", AI_PROVIDER: "openai", ...CANARIES },
});
if (build.status !== 0) {
  console.error("Build failed; key leak check not completed.");
  process.exit(build.status ?? 1);
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* files(path);
    } else {
      yield path;
    }
  }
}

const leaks = [];
let scanned = 0;
for (const file of files(".next")) {
  scanned += 1;
  const content = readFileSync(file, "latin1");
  for (const [name, canary] of Object.entries(CANARIES)) {
    if (content.includes(canary)) leaks.push(`${name} found in ${file}`);
  }
}

if (leaks.length > 0) {
  console.error(`Secret leak check FAILED:\n${leaks.join("\n")}`);
  process.exit(1);
}
console.log(`Secret leak check passed: ${scanned} build files scanned, no server secrets found.`);
