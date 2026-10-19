import "server-only";

import { z } from "zod";
import { logEvent } from "@/lib/observability/log";
import { AIBudget } from "./budget";
import { AIUnavailableError, type IntentInput, type IntentProvider } from "./provider";
import { intentSchema } from "./schemas";
import { INTENT_INSTRUCTIONS } from "./instructions";

export const OPENAI_MODEL = "gpt-5.6-luna";
export const AI_TIMEOUT_MS = 10_000;
export const MAX_OUTPUT_TOKENS = 512;
const MAX_INPUT_BYTES = 20_000;

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});

export class OpenAIIntentProvider implements IntentProvider {
  readonly source = "openai" as const;
  constructor(private readonly options: {
    apiKey: string; budget: AIBudget; fetch?: typeof fetch; timeoutMs?: number;
    /** Dependency injection for local HTTP contract tests only; never read from user input or env. */
    endpoint?: string;
  }) {}

  async parse(input: IntentInput) {
    const payload = {
      model: OPENAI_MODEL, store: false, max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: "none" },
      instructions: INTENT_INSTRUCTIONS,
      input: [{ role: "user", content: JSON.stringify({ previousSearches: input.history, currentPreferences: input.preferences, newestMessage: input.message }) }],
      text: { format: { type: "json_schema", name: "cafe_search_intent", strict: true, schema: z.toJSONSchema(intentSchema) } },
    };
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > MAX_INPUT_BYTES) throw new AIUnavailableError("invalid_response");
    if (!this.options.budget.reserve()) {
      logEvent("warn", "ai_budget_exhausted", { reservedMicroUsd: this.options.budget.reservedMicroUsd });
      throw new AIUnavailableError("budget");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? AI_TIMEOUT_MS);
    const start = Date.now();
    let outcome = "network";
    let httpStatus: number | undefined;
    try {
      const response = await (this.options.fetch ?? fetch)(this.options.endpoint ?? "https://api.openai.com/v1/responses", {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` }, body,
      });
      httpStatus = response.status;
      if (!response.ok) throw new AIUnavailableError(response.status === 429 ? "quota" : response.status === 401 || response.status === 403 ? "auth" : "network");
      // Refusals, truncated output, invalid JSON, tool calls and extra fields fail closed.
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new AIUnavailableError("invalid_response");
      const items = parsed.data.output.flatMap((item) => item.content ?? []);
      if (items.some((item) => item.type === "refusal")) throw new AIUnavailableError("refused");
      if (parsed.data.output.some((item) => item.type !== "message" && item.type !== "reasoning") || items.length !== 1 || items[0].type !== "output_text") throw new AIUnavailableError("invalid_response");
      const intent = intentSchema.safeParse(JSON.parse(items[0].text ?? ""));
      if (!intent.success) throw new AIUnavailableError("invalid_response");
      const usage = parsed.data.usage;
      logEvent("info", "ai_usage", { model: OPENAI_MODEL, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
        estimatedMicroUsd: Math.ceil(usage.input_tokens * 0.25 + usage.output_tokens * 1.2), reservedMicroUsd: this.options.budget.reservedMicroUsd });
      outcome = "ok";
      return intent.data;
    } catch (error) {
      const failure = error instanceof AIUnavailableError ? error : new AIUnavailableError(controller.signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network");
      outcome = failure.reason;
      throw failure;
    } finally {
      clearTimeout(timer);
      logEvent("info", "ai_call", { model: OPENAI_MODEL, outcome, httpStatus, durationMs: Date.now() - start });
    }
  }
}
