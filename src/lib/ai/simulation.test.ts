// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";
import { AIBudget } from "./budget";
import { OpenAIIntentProvider } from "./openai-provider";
import { NvidiaIntentProvider } from "./nvidia-provider";
import { createAssistantHandler } from "@/app/api/assistant/handler";
import { createNearbySearchHandler } from "@/app/api/places/nearby/handler";
import { FixturePlacesProvider } from "@/lib/places/fixture-provider";
import { parseServerEnv } from "@/lib/config/env-schema";

/** Explicit opt-in: production HTTP client runs over real HTTP to Postman. */
describe.skipIf(!process.env.AI_SIMULATION_URL)("Responses client against Postman simulation", () => {
  const create = () => new OpenAIIntentProvider({ apiKey: "simulation-not-a-real-key", budget: new AIBudget(1_000_000), endpoint: `${process.env.AI_SIMULATION_URL}/openai/v1/responses`, timeoutMs: 150 });
  const input = (message: string) => ({ message, history: [], preferences: DEFAULT_PREFERENCES });
  it("sends the production request shape and parses a strict filter result", async () => {
    expect(await create().parse(input("Find quiet cafes in BKK1"))).toMatchObject({ areaId: "bkk1", preferWifi: true, budget: "under_5" });
  });
  it("runs the actual assistant through HTTP interpretation, Places and ranking", async () => {
    const nearby = createNearbySearchHandler({ getEnv: () => parseServerEnv({}), getProvider: () => new FixturePlacesProvider(), guard: () => () => null });
    const handle = createAssistantHandler({ enabled: () => true, provider: create, guard: () => null, maxRadiusMeters: () => 15000, savedPreferences: async () => null,
      search: (filters) => nearby(new Request("http://localhost/api/places/nearby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) })) });
    const response = await handle(new Request("http://localhost/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ message: "Find cafes in BKK1" }) }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.filters).toMatchObject({ budget: "under_5", preferWifi: true });
    expect(result.results.results.length).toBeGreaterThan(0);
    expect(result.results.results[0].cafe.dataSource).toBe("fixture");
  });
  it.each(["mock:429", "mock:html", "mock:invalid", "mock:timeout"])("handles %s over real HTTP", async (message) => {
    await expect(create().parse(input(message))).rejects.toThrow("AI search is temporarily unavailable.");
  });
  it("handles an unreachable upstream over real HTTP", async () => {
    const provider = new OpenAIIntentProvider({ apiKey: "fake", budget: new AIBudget(20_000), endpoint: "http://127.0.0.1:1/v1/responses", timeoutMs: 150 });
    await expect(provider.parse(input("cafes"))).rejects.toMatchObject({ reason: "network" });
  });
  it("parses an NVIDIA completion over real HTTP", async () => {
    const provider = new NvidiaIntentProvider({ apiKey: "fake-simulation-key", reserve: () => true, endpoint: `${process.env.AI_SIMULATION_URL}/nvidia/v1/chat/completions` });
    expect(await provider.parse(input("Find cafes"))).toMatchObject({ areaId: "bkk1", preferWifi: true });
  });
  it.each(["mock:429", "mock:html", "mock:invalid", "mock:timeout"])("handles NVIDIA %s over real HTTP", async (message) => {
    const provider = new NvidiaIntentProvider({ apiKey: "fake-simulation-key", reserve: () => true, timeoutMs: 150, endpoint: `${process.env.AI_SIMULATION_URL}/nvidia/v1/chat/completions` });
    await expect(provider.parse(input(message))).rejects.toThrow("AI search is temporarily unavailable.");
  });
});
