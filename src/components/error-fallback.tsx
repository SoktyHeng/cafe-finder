"use client";

import { Button } from "@/components/ui/button";

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
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
