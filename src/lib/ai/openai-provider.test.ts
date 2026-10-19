// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";
import { AIBudget } from "./budget";
import { EMPTY_INTENT } from "./fixture-provider";
import { OpenAIIntentProvider, OPENAI_MODEL, MAX_OUTPUT_TOKENS } from "./openai-provider";

const input = { message: "Find quiet cafes with Wi-Fi in BKK1", history: [], preferences: DEFAULT_PREFERENCES };
export const envelope = (text = JSON.stringify(EMPTY_INTENT)) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 800, output_tokens: 150 } });
const make = (fetcher: typeof fetch, budget = new AIBudget(1_000_000)) => new OpenAIIntentProvider({ apiKey: "private-test-canary", budget, fetch: fetcher });

describe("OpenAI Responses boundary", () => {
  it("bounds serialized input bytes before charging a reservation or fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const budget = new AIBudget(20_000);
    await expect(make(fetcher, budget).parse({ ...input, message: "é".repeat(20000) })).rejects.toMatchObject({ reason: "invalid_response" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(budget.reservedMicroUsd).toBe(0);
  });
  it("accepts a non-tool reasoning envelope without exposing it to callers", async () => {
    const body = envelope();
    const response = { ...body, output: [{ type: "reasoning", summary: [] }, ...body.output] };
    expect(await make(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).parse(input)).toEqual(EMPTY_INTENT);
  });
  it("uses a fixed HTTPS endpoint, strict JSON schema, no storage/tools and a bounded output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await make(fetcher).parse(input)).toEqual(EMPTY_INTENT);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer private-test-canary" });
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({ model: OPENAI_MODEL, store: false, reasoning: { effort: "none" }, max_output_tokens: MAX_OUTPUT_TOKENS, text: { format: { strict: true, type: "json_schema", schema: { additionalProperties: false } } } });
    expect(payload).not.toHaveProperty("tools");
    expect(String(options?.body)).not.toMatch(/private-test-canary|latitude|longitude|googleRating/);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/private-test-canary|Find quiet cafes/);
    expect(info.mock.calls.flat().join(" ")).toContain("estimatedMicroUsd");
  });
  it.each([401, 403, 429, 500, 503])("handles HTTP %s without retries or leaking vendor content", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ secret: "private-test-canary" }, { status }));
    await expect(make(fetcher).parse(input)).rejects.toThrow("AI search is temporarily unavailable.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...envelope(), status: "incomplete" },
    envelope("not JSON"), envelope(JSON.stringify({ ...EMPTY_INTENT, cafeName: "Fabricated" })),
    envelope(JSON.stringify({ ...EMPTY_INTENT, radiusMeters: 999999 })),
    { ...envelope(), output: [{ type: "message", content: [{ type: "refusal", text: "No" }] }] },
    { ...envelope(), output: [{ type: "function_call", content: [] }] },
    { ...envelope(), output: [] },
  ])("rejects unsafe/unusable responses %j", async (response) => {
    await expect(make(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).parse(input)).rejects.toThrow("AI search is temporarily unavailable.");
  });
  it("does not call OpenAI after the daily budget is reserved", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
    const provider = make(fetcher, new AIBudget(20_000));
    await provider.parse(input);
    await expect(provider.parse(input)).rejects.toMatchObject({ reason: "budget" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts hung HTTP requests and clears timers", async () => {
    const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const provider = new OpenAIIntentProvider({ apiKey: "test", budget: new AIBudget(20_000), fetch: fetcher, timeoutMs: 5 });
    await expect(provider.parse(input)).rejects.toMatchObject({ reason: "timeout" });
  });
});
