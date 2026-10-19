"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Coffee, Sparkles } from "lucide-react";
import { LocationPicker } from "@/features/discovery/components/location-picker";
import { ResultsPanel } from "@/features/discovery/components/results-panel";
import { applyRelaxation, areaLocation, type LocationChoice } from "@/features/discovery/form-state";
import { formValuesToSearchParams } from "@/features/discovery/url-state";
import { getPublicEnv } from "@/lib/config/public-env";
import { purposeOption, budgetLabel } from "@/lib/discovery/options";
import { requestApi } from "@/lib/http/request-api";
import { assistantResponseSchema, MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, type AssistantResponse, type AssistantLocation } from "@/lib/ai/schemas";
import { findAreaById } from "@/lib/locations/cities";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";

function toLocation(value: LocationChoice | null): AssistantLocation | null {
  return value ? value.kind === "area" ? { kind: "area", areaId: value.areaId } : { kind: "device", latitude: value.latitude, longitude: value.longitude } : null;
}
function fromLocation(value: AssistantLocation | null): LocationChoice | null {
  if (!value) return null;
  if (value.kind === "device") return { ...value, label: "your current location" };
  const area = findAreaById(value.areaId);
  return area ? areaLocation(area) : null;
}

export function SearchAssistant({ maxRadiusMeters, demo, vendor = "OpenAI" }: { maxRadiusMeters: number; demo: boolean; vendor?: "OpenAI" | "NVIDIA" }) {
  const router = useRouter();
  const id = useId();
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [conversation, setConversation] = useState<{ user: string; reply: string }[]>([]);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const publicEnv = getPublicEnv();
  const submit = async (retryMessage?: string) => {
    const text = (retryMessage ?? message).trim();
    if (pending.current || !text) return;
    pending.current = true;
    const version = ++generation.current;
    setBusy(true); setError(null);
    const outcome = await requestApi("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      message: text, history: conversation.slice(-MAX_HISTORY_MESSAGES).map((turn) => turn.user),
      location: toLocation(location), ...(response && { preferences: response.preferences }),
    }) }, assistantResponseSchema);
    if (version !== generation.current) return;
    pending.current = false; setBusy(false);
    if (!outcome.ok) {
      setError(outcome.code === "RATE_LIMITED" ? "AI search has reached its allowance. Please wait or use regular search." : "AI search couldn't complete. Your settings are kept; try again or use regular search.");
      return;
    }
    setResponse(outcome.data);
    setLocation(fromLocation(outcome.data.location));
    setConversation((turns) => [...turns.slice(-(MAX_HISTORY_MESSAGES - 1)), { user: text, reply: outcome.data.message }]);
    setMessage("");
  };
  const filters = response?.filters ?? null;
  const resultLocation = fromLocation(response?.location ?? null);
  const readyValues = response && resultLocation ? { ...response.preferences, minRating: response.preferences.minRating ?? undefined, location: resultLocation } : null;
  const regularQuery = readyValues ? formValuesToSearchParams(readyValues).toString() : "";
  const fallbackPreferences = response?.preferences ?? DEFAULT_PREFERENCES;
  const fallbackQuery = location ? formValuesToSearchParams({
    ...fallbackPreferences, radiusMeters: Math.min(fallbackPreferences.radiusMeters, maxRadiusMeters),
    minRating: fallbackPreferences.minRating ?? undefined, location,
  }).toString() : "";
  return <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
    <section aria-label="Conversation" className="surface flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Sparkles aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold">Let&apos;s find your kind of cafe</h2><p className="text-xs text-muted-foreground">Preferences in. Nearby possibilities out.</p></div></div>
      <p className="text-sm text-muted-foreground">Describe what you need, then refine it in a follow-up. Saved search defaults apply when signed in. Match explanations use actual cafe evidence.</p>
      <p className="text-xs text-muted-foreground">{demo
        ? "This scripted demo does not call OpenAI. Conversation stays in this page's memory."
        : `Your search text and preferences go to ${vendor} when you submit. Selected coordinates and cafe data are not sent. Avoid personal or sensitive details. Conversation stays in this page's memory.`}</p>
      {demo && <p className="rounded-lg border p-3 text-sm">Scripted demo, not live AI. Try “Find a quiet cafe with Wi-Fi under $5 in BKK1.” then “Only open now, within 2 km.” Cafe results are fictional.</p>}
      <div role="log" aria-label="Search conversation" tabIndex={0} className="flex max-h-96 flex-col gap-4 overflow-y-auto overscroll-contain rounded-xl break-words empty:hidden">
        {conversation.map((turn, index) => <div key={index} className="space-y-2 text-sm"><p className="ml-4 rounded-2xl rounded-br-sm bg-secondary p-3"><strong className="mb-1 block text-xs text-primary">You:</strong> {turn.user}</p><p className="mr-4 rounded-2xl rounded-bl-sm border p-3"><strong className="mb-1 block text-xs text-primary">Assistant:</strong> {turn.reply}</p></div>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-3">
        <label htmlFor={`${id}-message`} className="font-medium">What kind of cafe are you looking for?</label>
        <textarea id={`${id}-message`} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={MAX_MESSAGE_LENGTH} required rows={3} disabled={busy}
          className="min-h-28 w-full rounded-xl border bg-background p-3 text-base focus-visible:ring-2 focus-visible:ring-ring" placeholder="Find a quiet cafe with Wi-Fi under $5 near me." />
        <Button type="submit" disabled={busy || !message.trim()} className="min-h-11">{busy ? "Understanding your search…" : "Search with assistant"}</Button>
      </form>
      {conversation.length === 0 && <div className="flex flex-col gap-2"><p className="eyebrow">Try asking</p>{["Find a quiet cafe with Wi-Fi under $5 near me.", "A cafe for meeting friends in Riverside."].map((suggestion) => <button type="button" key={suggestion} disabled={busy} onClick={() => { setMessage(suggestion); document.getElementById(`${id}-message`)?.focus(); }} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">{suggestion}<ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-primary" /></button>)}</div>}
      <details open={response?.status === "clarify" && !response.location} className="rounded-lg border p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">Choose or change location</summary>
        <p className="mb-3 text-xs text-muted-foreground">Choose an area here, mention one in your message, or use your device location for “near me”.</p>
        <fieldset disabled={busy}><legend className="sr-only">Search location</legend><LocationPicker value={location} onChange={setLocation} /></fieldset>
      </details>
      <p role="status" className="text-sm text-primary empty:hidden">{busy ? "Understanding your request and finding cafes…" : ""}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {response && <section aria-label="Interpreted search" className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
        <h2 className="font-medium">Your search settings</h2>
        <p>{purposeOption(response.preferences.purpose).label} · {response.preferences.radiusMeters / 1000} km · {budgetLabel(response.preferences.budget)}</p>
        <p>{response.locationLabel ?? "Location needed"} · {response.preferences.openNowOnly ? "Open now" : "Any opening status"} · Minimum rating: {response.preferences.minRating ?? "Any"}</p>
        <p>Wi-Fi preference: {response.preferences.preferWifi ? "Yes" : "No"} · Quiet preference: {response.preferences.preferQuiet ? "Yes" : "No"}</p>
        {response.notices.map((notice) => <p key={notice} className="mt-2 text-muted-foreground">{notice}</p>)}
      </section>}
      {response?.results && <a href="#assistant-recommendations" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4 lg:hidden">View cafe recommendations <ArrowUpRight aria-hidden="true" className="size-4" /></a>}
      <Link href={`/discover${fallbackQuery ? `?${fallbackQuery}` : ""}`} className="inline-flex min-h-11 items-center text-sm underline">Use regular search filters</Link>
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { generation.current++; setConversation([]); setResponse(null); setMessage(""); setError(null); }}>Start a new conversation</Button>
    </section>
    {response?.results && filters ? <div id="assistant-recommendations" className="min-w-0 scroll-mt-6"><ResultsPanel
      state={{ status: "done", outcome: { ok: true, data: response.results } }} request={filters} locationLabel={response.locationLabel} origin={filters}
      backQuery={regularQuery} maxRadiusMeters={maxRadiusMeters} mapConfig={{ apiKey: publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY, mapId: publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID" }}
      onRetry={() => { const previous = conversation.at(-1); if (previous) void submit(previous.user); }}
      onEditSearch={() => document.getElementById(`${id}-message`)?.focus()}
      onRelax={(change) => { if (readyValues) router.push(`/discover?${formValuesToSearchParams(applyRelaxation(readyValues, change))}`); }}
    /></div> : <section aria-label="Assistant results" className="flex min-h-96 flex-col items-start justify-center rounded-2xl border border-dashed bg-secondary/40 p-6 sm:p-10"><Coffee aria-hidden="true" className="mb-5 size-10 text-primary" /><p className="eyebrow mb-3">Made for your kind of day</p><h2 className="text-2xl font-semibold tracking-tight">Nearby recommendations</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Submit a search to see cafes and evidence-based match explanations. Unknown details stay unverified.</p></section>}
  </div>;
}
