import type { Metadata, Viewport } from "next";
import { Geist, Roboto } from "next/font/google";

import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import { AuthProvider } from "@/features/auth/auth-provider";
import { SavedPlacesProvider } from "@/features/favorites/saved-places-provider";
import { getServerEnv } from "@/lib/config/server-env";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

/** Google Maps attribution text must be set in Roboto 400. */
const roboto = Roboto({
  variable: "--font-roboto",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cafe Finder — find the best cafe for you, right now",
    template: "%s · Cafe Finder",
  },
  description:
    "Personalized, location-aware cafe discovery. Starting in Phnom Penh.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f8f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { PLACES_PROVIDER, ENABLE_AI } = getServerEnv();

  return (
    <html lang="en" className={`${geistSans.variable} ${roboto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <SavedPlacesProvider>
            <AppHeader enableAI={ENABLE_AI} />
            <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
              {children}
            </main>
            <AppFooter placesProvider={PLACES_PROVIDER} />
          </SavedPlacesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
