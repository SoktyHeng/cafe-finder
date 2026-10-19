import "server-only";

import { z } from "zod";
import { logEvent } from "@/lib/observability/log";
import { INTENT_INSTRUCTIONS } from "./instructions";
import { AIUnavailableError, type IntentInput, type IntentProvider } from "./provider";
import { intentSchema } from "./schemas";

export const NVIDIA_MODEL = "openai/gpt-oss-20b";
export const NVIDIA_MAX_OUTPUT_TOKENS = 2048;
export const NVIDIA_TIMEOUT_MS = 30_000;

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.literal("stop"),
    message: z.object({ role: z.literal("assistant"), content: z.string(), refusal: z.string().nullish(), tool_calls: z.array(z.unknown()).optional() }),
  })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }),
});

/** Fixed NVIDIA endpoint; only the validated filter JSON is returned, never reasoning text. */
export class NvidiaIntentProvider implements IntentProvider {
  readonly source = "nvidia" as const;
  constructor(private readonly options: { apiKey: string; reserve: () => boolean; fetch?: typeof fetch; timeoutMs?: number; endpoint?: string }) {}

  async parse(input: IntentInput) {
    const payload = {
      model: NVIDIA_MODEL, stream: false, temperature: 0, max_tokens: NVIDIA_MAX_OUTPUT_TOKENS, reasoning_effort: "low",
      messages: [
        { role: "system", content: `${INTENT_INSTRUCTIONS}\nReturn only a JSON object matching the supplied response schema. No Markdown or explanations.` },
        { role: "user", content: JSON.stringify({ previousSearches: input.history, currentPreferences: input.preferences, newestMessage: input.message }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "cafe_search_intent", strict: true, schema: z.toJSONSchema(intentSchema) } },
    };
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > 20_000) throw new AIUnavailableError("invalid_response");
    if (!this.options.reserve()) { logEvent("warn", "ai_daily_limit", { provider: "nvidia" }); throw new AIUnavailableError("budget"); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? NVIDIA_TIMEOUT_MS);
    const start = Date.now();
    let outcome = "network";
    let httpStatus: number | undefined;
    try {
      const response = await (this.options.fetch ?? fetch)(this.options.endpoint ?? "https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, body,
      });
      httpStatus = response.status;
      if (response.status !== 200) throw new AIUnavailableError(response.status === 429 ? "quota" : response.status === 401 || response.status === 403 ? "auth" : "network");
      const parsed = completionSchema.safeParse(await response.json());
      if (!parsed.success) throw new AIUnavailableError("invalid_response");
      const message = parsed.data.choices[0].message;
      if (message.refusal || message.tool_calls?.length) throw new AIUnavailableError("refused");
      const intent = intentSchema.safeParse(JSON.parse(message.content));
      if (!intent.success) throw new AIUnavailableError("invalid_response");
      logEvent("info", "ai_usage", { provider: "nvidia", model: NVIDIA_MODEL, inputTokens: parsed.data.usage.prompt_tokens, outputTokens: parsed.data.usage.completion_tokens });
      outcome = "ok";
      return intent.data;
    } catch (error) {
      const failure = error instanceof AIUnavailableError ? error : new AIUnavailableError(controller.signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network");
      outcome = failure.reason;
      throw failure;
    } finally {
      clearTimeout(timer);
      logEvent("info", "ai_call", { provider: "nvidia", model: NVIDIA_MODEL, outcome, httpStatus, durationMs: Date.now() - start });
    }
  }
}
