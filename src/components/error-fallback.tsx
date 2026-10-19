"use client";

import { Button } from "@/components/ui/button";
import { Coffee } from "lucide-react";

type ErrorFallbackProps = {
  title?: string;
  onRetry: () => void;
};

/** Shared, safe error UI: never renders raw error messages to users. */
export function ErrorFallback({
  title = "Something went wrong",
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="page-shell flex max-w-2xl flex-col items-start gap-5 py-16 sm:py-24"
    >
      <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary"><Coffee aria-hidden="true" className="size-7 text-primary" /></span>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">
        An unexpected error occurred. Please try again. If it keeps happening,
        reload the page.
      </p>
      <Button size="lg" className="min-h-11 px-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
