// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";
import { EMPTY_INTENT } from "./fixture-provider";
import { NvidiaIntentProvider, NVIDIA_MODEL, NVIDIA_MAX_OUTPUT_TOKENS } from "./nvidia-provider";

const input = { message: "Find quiet cafes in BKK1", history: [], preferences: DEFAULT_PREFERENCES };
const envelope = (content = JSON.stringify(EMPTY_INTENT)) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content, reasoning_content: "private reasoning never returned" } }], usage: { prompt_tokens: 600, completion_tokens: 200 } });
const create = (fetcher: typeof fetch, reserve = () => true) => new NvidiaIntentProvider({ apiKey: "nvapi-private-test-canary", reserve, fetch: fetcher });

describe("NVIDIA NIM intent adapter", () => {
  it("uses the NVIDIA endpoint/key, structured schema and token cap without tools or selected coordinates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await create(fetcher).parse(input)).toEqual(EMPTY_INTENT);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer nvapi-private-test-canary" });
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({ model: NVIDIA_MODEL, stream: false, max_tokens: NVIDIA_MAX_OUTPUT_TOKENS, response_format: { type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false } } } });
    expect(payload).not.toHaveProperty("tools");
    expect(String(options?.body)).not.toMatch(/nvapi-private-test-canary|latitude|longitude/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/nvapi-private-test-canary|private reasoning|Find quiet cafes/);
  });
  it.each([202, 401, 403, 422, 429, 500, 503])("handles HTTP %s safely without retries", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "private-test-canary" }, { status }));
    await expect(create(fetcher).parse(input)).rejects.toThrow("AI search is temporarily unavailable.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    envelope("invalid JSON"),
    envelope(JSON.stringify({ ...EMPTY_INTENT, cafeName: "Invented" })),
    { ...envelope(), choices: [{ finish_reason: "length", message: { role: "assistant", content: "{}" } }] },
    { ...envelope(), choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{}", tool_calls: [{}] } }] },
    { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
  ])("rejects malformed, truncated or unauthorized model output", async (response) => {
    await expect(create(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).parse(input)).rejects.toThrow("AI search is temporarily unavailable.");
  });
  it("does not fetch when the daily allowance is exhausted", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(fetcher, () => false).parse(input)).rejects.toMatchObject({ reason: "budget" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts a hung request", async () => {
    const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("abort"))));
    await expect(new NvidiaIntentProvider({ apiKey: "test", reserve: () => true, fetch: fetcher, timeoutMs: 5 }).parse(input)).rejects.toMatchObject({ reason: "timeout" });
  });
});
