"use client";

import { Suspense } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";

import { useAuth } from "../auth-provider";

const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** Header links that depend on sign-in state. Hidden entirely in guest-only mode. */
export function AuthNav() {
  const auth = useAuth();
  if (auth.status === "unavailable" || auth.status === "loading") return null;
  if (auth.status === "signed-out") {
    return (
      <Suspense><Link href="/login" className={LINK_CLASS}>
        Sign in
      </Link></Suspense>
    );
  }
  return (
    <Suspense>
      <Link href="/favorites" className={LINK_CLASS}>
        Favorites
      </Link>
      <Link href="/account" className={LINK_CLASS}>
        Account
      </Link>
    </Suspense>
  );
}
