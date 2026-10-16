"use client";

import { useRouter } from "next/navigation";

import { DEFAULT_FORM_VALUES } from "../form-state";
import { formValuesToSearchParams } from "../url-state";
import { DiscoveryForm } from "./discovery-form";

type HomeDiscoveryProps = {
  maxRadiusMeters: number;
};

/** Home page form: submitting opens `/discover` with the chosen settings. */
export function HomeDiscovery({ maxRadiusMeters }: HomeDiscoveryProps) {
  const router = useRouter();

  return (
    <DiscoveryForm
      initialValues={DEFAULT_FORM_VALUES}
      maxRadiusMeters={maxRadiusMeters}
      onSubmit={(values) => {
        router.push(`/discover?${formValuesToSearchParams(values).toString()}`);
      }}
    />
  );
}
