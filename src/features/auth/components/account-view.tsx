"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { FilterControls } from "@/features/discovery/components/filter-controls";
import { PreferenceControls } from "@/features/discovery/components/preference-controls";
import { PurposePicker } from "@/features/discovery/components/purpose-picker";
import { formValuesToPreferences, preferencesToFormValues, type DiscoveryFormValues } from "@/features/discovery/form-state";
import { deleteAccount, savePreferences, updateProfile } from "@/features/favorites/saved-places-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  MAX_DISPLAY_NAME_LENGTH,
  type Preferences,
  type Profile,
} from "@/lib/user-data/schemas";

type AccountViewProps = { profile: Profile; preferences: Preferences; maxRadiusMeters: number };

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section id={title === "Profile" ? "profile" : title === "Search defaults" ? "search-defaults" : "account-deletion"} aria-labelledby={id} className="surface flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Signs out in the browser so the local session and UI update immediately. */
async function signOutLocally() {
  await getSupabaseBrowserClient()?.auth.signOut();
}

export function AccountView({ profile, preferences, maxRadiusMeters }: AccountViewProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading eyebrow="Make it yours" title="Your account" description="A few personal touches for your next cafe search." />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 px-4"
          onClick={async () => {
            await signOutLocally();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Account sections" className="flex flex-wrap gap-1 rounded-xl border bg-card p-2 text-sm md:sticky md:top-6 md:flex-col"><a href="#profile" className="min-h-11 rounded-lg px-3 py-3 hover:bg-secondary">Profile</a><a href="#search-defaults" className="min-h-11 rounded-lg px-3 py-3 hover:bg-secondary">Search defaults</a><a href="#account-deletion" className="min-h-11 rounded-lg px-3 py-3 text-destructive hover:bg-muted">Delete account</a></nav>
        <div className="flex min-w-0 flex-col gap-6"><ProfileSection profile={profile} />
        <PreferencesSection preferences={preferences} maxRadiusMeters={maxRadiusMeters} />
        <DeleteAccountSection /></div>
      </div>
    </div>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const id = useId();
  const [name, setName] = useState(profile.displayName ?? "");
  const [status, setStatus] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("Saving…");
    const outcome = await updateProfile(name.trim() === "" ? null : name.trim());
    setStatus(outcome.ok ? "Profile saved." : "Couldn't save your profile. Please try again.");
  };

  return (
    <Section title="Profile">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <span className="text-sm text-muted-foreground">{profile.email ?? "Not available"}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Display name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" className="min-h-11 px-4">
            Save profile
          </Button>
          <span role="status" className="text-sm text-muted-foreground">
            {status}
          </span>
        </div>
      </form>
    </Section>
  );
}

function PreferencesSection({ preferences, maxRadiusMeters }: { preferences: Preferences; maxRadiusMeters: number }) {
  const [values, setValues] = useState<DiscoveryFormValues>(() => preferencesToFormValues(preferences));
  const [status, setStatus] = useState("");
  const update = <K extends keyof DiscoveryFormValues>(key: K, value: DiscoveryFormValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("Saving…");
    const outcome = await savePreferences(formValuesToPreferences(values));
    setStatus(outcome.ok ? "Search defaults saved." : "Couldn't save your defaults. Please try again.");
  };

  return (
    <Section title="Search defaults" description="Pre-filled on the home page when you're signed in. Location is always chosen per search.">
      <form onSubmit={submit} className="flex flex-col gap-6" aria-label="Search defaults">
        <PurposePicker value={values.purpose} onChange={(purpose) => update("purpose", purpose)} />
        <FilterControls
          radiusMeters={values.radiusMeters}
          maxRadiusMeters={maxRadiusMeters}
          minRating={values.minRating}
          openNowOnly={values.openNowOnly}
          onRadiusChange={(meters) => update("radiusMeters", meters)}
          onMinRatingChange={(rating) => update("minRating", rating)}
          onOpenNowChange={(openNowOnly) => update("openNowOnly", openNowOnly)}
        />
        <PreferenceControls
          budget={values.budget}
          preferQuiet={values.preferQuiet}
          preferWifi={values.preferWifi}
          onBudgetChange={(budget) => update("budget", budget)}
          onQuietChange={(preferQuiet) => update("preferQuiet", preferQuiet)}
          onWifiChange={(preferWifi) => update("preferWifi", preferWifi)}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" className="min-h-11 px-4">
            Save defaults
          </Button>
          <span role="status" className="text-sm text-muted-foreground">
            {status}
          </span>
        </div>
      </form>
    </Section>
  );
}

function DeleteAccountSection() {
  const id = useId();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    const outcome = await deleteAccount(confirm.trim().toLowerCase());
    if (outcome.ok) {
      await signOutLocally();
      router.push("/");
      router.refresh();
      return;
    }
    setPending(false);
    setStatus("Couldn't delete your account. Please try again.");
  };

  return (
    <Section
      title="Delete account"
      description="Permanently deletes your account, favorites, visited places, notes and saved defaults. This can't be undone."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={`${id}-confirm`} className="text-sm">
          Type <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong> to confirm
        </label>
        <input
          id={`${id}-confirm`}
          value={confirm}
          autoComplete="off"
          onChange={(event) => setConfirm(event.target.value)}
          className={INPUT_CLASS}
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            variant="destructive"
            className="min-h-11 px-4"
            disabled={pending || confirm.trim().toLowerCase() !== ACCOUNT_DELETION_CONFIRMATION}
          >
            Delete my account
          </Button>
          <span role="status" className="text-sm text-destructive">
            {status}
          </span>
        </div>
      </form>
    </Section>
  );
}
