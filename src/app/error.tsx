"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/error-fallback";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Only the digest is logged; it maps to the server log without exposing details.
    console.error("Route error", error.digest ?? "(client)");
  }, [error]);

  return <ErrorFallback onRetry={retry} />;
}
