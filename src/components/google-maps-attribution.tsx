import type { DataProviderAttribution } from "@/lib/places/schemas";
import { cn } from "@/lib/utils";

type GoogleMapsAttributionProps = {
  /** Third-party data providers Google returned; they must be credited too. */
  providers?: readonly DataProviderAttribution[];
  className?: string;
};

/**
 * Required attribution when Places data is shown without a Google map.
 * Google's policy prefers the logo but accepts the text "Google Maps" where
 * space is limited. Text rules: Roboto 400, 12–16px, #5E5E5E (contrast at
 * least 4.5:1), never translated, never wrapped.
 */
export function GoogleMapsAttribution({ providers = [], className }: GoogleMapsAttributionProps) {
  return (
    <p
      data-testid="google-maps-attribution"
      className={cn("font-roboto text-xs font-normal text-[#5E5E5E]", className)}
    >
      <span translate="no" className="whitespace-nowrap">
        Google Maps
      </span>
      {providers.length > 0 && (
        <>
          {" · Data: "}
          {providers.map((attribution, index) => (
            <span key={attribution.provider}>
              {index > 0 && ", "}
              {attribution.providerUri ? (
                <a
                  href={attribution.providerUri}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-2"
                >
                  {attribution.provider}
                </a>
              ) : (
                attribution.provider
              )}
            </span>
          ))}
        </>
      )}
    </p>
  );
}
