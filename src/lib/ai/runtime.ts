import "server-only";
import { getServerEnv } from "@/lib/config/server-env";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";
import { createRequestGuard } from "@/lib/security/request-guard";
import { AIBudget } from "./budget";
import { FixtureIntentProvider } from "./fixture-provider";
import { OpenAIIntentProvider } from "./openai-provider";
import { NvidiaIntentProvider } from "./nvidia-provider";

let runtime: ReturnType<typeof createRuntime> | undefined;
function createRuntime() {
  const env = getServerEnv();
  const budget = new AIBudget(env.AI_DAILY_BUDGET_MICRO_USD);
  const daily = new FixedWindowRateLimiter({ limit: env.AI_DAILY_REQUEST_LIMIT, windowMs: 86_400_000, maxKeys: 1 });
  return {
    provider: env.AI_PROVIDER === "fixture" ? new FixtureIntentProvider() : env.AI_PROVIDER === "nvidia"
      ? new NvidiaIntentProvider({ apiKey: env.NVIDIA_API_KEY ?? env.OPENAI_API_KEY ?? "", reserve: () => daily.consume("nvidia").allowed })
      : new OpenAIIntentProvider({ apiKey: env.OPENAI_API_KEY ?? "", budget }),
    guard: createRequestGuard({ name: "assistant", perClientLimit: env.AI_RATE_LIMIT_PER_MINUTE,
      globalLimiter: new FixedWindowRateLimiter({ limit: env.AI_GLOBAL_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 }), trustProxy: env.TRUST_PROXY }),
  };
}
export function getAIRuntime() { return runtime ??= createRuntime(); }
