import type { Metadata } from "next";
import Link from "next/link";
import { SearchAssistant } from "@/features/assistant/search-assistant";
import { getServerEnv } from "@/lib/config/server-env";
import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = { title: "Cafe search assistant" };
export default function AssistantPage() {
  const env = getServerEnv();
  return <div className="page-shell">
    <div className="mb-8"><PageHeading eyebrow="A little help finding your place" title="Cafe search assistant" description="Describe your ideal stop. Refine the details. Find a cafe for your day." /></div>
    {env.ENABLE_AI ? <SearchAssistant maxRadiusMeters={env.MAX_SEARCH_RADIUS_METERS} demo={env.AI_PROVIDER === "fixture"} vendor={env.AI_PROVIDER === "nvidia" ? "NVIDIA" : "OpenAI"} />
      : <p className="surface">AI search is turned off. <Link href="/discover" className="underline">Use the regular search filters</Link> to find cafes.</p>}
  </div>;
}
