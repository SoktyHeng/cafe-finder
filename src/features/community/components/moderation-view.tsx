"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyedRequest } from "@/hooks/use-keyed-request";
import { AMENITY_OPTIONS, amenityValueOption, isCommunityAmenity } from "@/lib/community/schemas";

import { communityErrorText, decideModeration, fetchModerationQueue, type ModerationQueueItem } from "../community-client";

/** Pending and hidden member content, oldest first, with approve/reject. */
export function ModerationView() {
  const [version, setVersion] = useState(0);
  const { state } = useKeyedRequest(`moderation:${version}`, fetchModerationQueue);
  const [message, setMessage] = useState("");

  const decide = async (item: ModerationQueueItem, decision: "approved" | "rejected") => {
    const outcome = await decideModeration({ targetType: item.targetType, targetId: item.targetId, decision });
    setMessage(outcome.ok ? `Marked as ${decision}.` : communityErrorText(outcome.code));
    if (outcome.ok) setVersion((value) => value + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
      <p role="status" className="text-sm">
        {message}
      </p>
      {state.status !== "done" && <Skeleton className="h-24 w-full" />}
      {state.status === "done" && !state.outcome.ok && (
        <p role="alert" className="text-destructive">
          {communityErrorText(state.outcome.code)}
        </p>
      )}
      {state.status === "done" && state.outcome.ok && state.outcome.data.items.length === 0 && (
        <p className="text-muted-foreground">Nothing to review.</p>
      )}
      {state.status === "done" && state.outcome.ok && state.outcome.data.items.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Moderation queue">
          {state.outcome.data.items.map((item) => (
            <li key={item.targetId} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={item.status === "hidden" ? "destructive" : "secondary"}>{item.status}</Badge>
                <span>{item.targetType === "review" ? "Review" : "Amenity report"}</span>
                {item.flagCount > 0 && (
                  <span className="text-muted-foreground">
                    {item.flagCount} {item.flagCount === 1 ? "report" : "reports"}: {item.flagReasons.join(", ")}
                  </span>
                )}
                <Link href={`/cafes/${encodeURIComponent(item.placeId)}`} className="text-primary underline-offset-2 hover:underline">
                  View cafe
                </Link>
              </div>
              {item.targetType === "review" ? (
                <p className="text-sm whitespace-pre-line">
                  <span className="font-medium">{item.rating}/5:</span> {item.body}
                </p>
              ) : (
                <p className="text-sm">
                  {isCommunityAmenity(item.amenity)
                    ? `${AMENITY_OPTIONS[item.amenity].label}: ${amenityValueOption(item.amenity, item.value ?? "")?.label ?? item.value}`
                    : `${item.amenity}: ${item.value}`}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="lg" className="min-h-11 px-4" onClick={() => decide(item, "approved")}>
                  Approve
                </Button>
                <Button size="lg" variant="destructive" className="min-h-11 px-4" onClick={() => decide(item, "rejected")}>
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
