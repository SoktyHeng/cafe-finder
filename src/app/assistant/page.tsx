import type { Metadata } from "next";
import Link from "next/link";
import { SearchAssistant } from "@/features/assistant/search-assistant";
import { getServerEnv } from "@/lib/config/server-env";

export const metadata: Metadata = { title: "Cafe search assistant" };
export default function AssistantPage() {
  const env = getServerEnv();
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
    <h1 className="mb-3 text-2xl font-semibold">Cafe search assistant</h1>
    {env.ENABLE_AI ? <SearchAssistant maxRadiusMeters={env.MAX_SEARCH_RADIUS_METERS} demo={env.AI_PROVIDER === "fixture"} vendor={env.AI_PROVIDER === "nvidia" ? "NVIDIA" : "OpenAI"} />
      : <p>AI search is turned off. <Link href="/discover" className="underline">Use the regular search filters</Link> to find cafes.</p>}
  </div>;
}
