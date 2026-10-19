import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginView } from "@/features/auth/components/login-view";
import { CoffeeScene } from "@/components/coffee-scene";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="page-shell grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <section className="hidden lg:block" aria-label="Welcome to Cafe Finder"><p className="eyebrow mb-4">A place to come back to</p><h2 className="text-4xl font-semibold tracking-tight">Keep your favorite<br />corners of the city.</h2><p className="mt-4 max-w-sm text-muted-foreground">Save the spots you love, remember where you&apos;ve been, and make your next search feel more like you.</p><CoffeeScene /></section>
      <div className="mx-auto w-full max-w-md rounded-3xl border bg-card p-5 shadow-xs sm:p-8">
      <Suspense fallback={<div aria-label="Loading sign in"><Skeleton className="h-10 w-2/3" /><Skeleton className="mt-6 h-64 w-full" /></div>}>
        <LoginView />
      </Suspense>
      </div>
    </div>
  );
}
