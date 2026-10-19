"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { getPreferences } from "@/features/favorites/saved-places-client";
import type { Preferences } from "@/lib/user-data/schemas";

import { DEFAULT_FORM_VALUES, preferencesToFormValues } from "../form-state";
import { formValuesToSearchParams } from "../url-state";
import { DiscoveryForm } from "./discovery-form";

type HomeDiscoveryProps = {
  maxRadiusMeters: number;
};

/**
 * Home page form: submitting opens `/discover` with the chosen settings.
 * Signed-in users start from their saved search defaults.
 */
export function HomeDiscovery({ maxRadiusMeters }: HomeDiscoveryProps) {
  const router = useRouter();
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const [saved, setSaved] = useState<{ userId: string; preferences: Preferences } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getPreferences().then((outcome) => {
      if (active && outcome.ok) setSaved({ userId, preferences: outcome.data.preferences });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const preferences = saved && saved.userId === userId ? saved.preferences : null;

  return (
    <div className="flex flex-col gap-3">
      {preferences && (
        <p className="text-sm text-muted-foreground" data-testid="saved-defaults-notice">
          Using your saved search defaults.{" "}
          <Link href="/account" className="font-medium text-primary underline-offset-4 hover:underline">
            Change
          </Link>
        </p>
      )}
      <DiscoveryForm
        compact
        // Remount once saved defaults arrive so they become the form's starting values.
        key={preferences ? "saved" : "default"}
        initialValues={preferences ? preferencesToFormValues(preferences) : DEFAULT_FORM_VALUES}
        maxRadiusMeters={maxRadiusMeters}
        onSubmit={(values) => {
          router.push(`/discover?${formValuesToSearchParams(values).toString()}`);
        }}
      />
    </div>
  );
}
