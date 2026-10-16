"use client";

import { usePathname } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseBrowserClient, isAuthConfigured } from "@/lib/supabase/browser";

export type AuthState =
  /** Supabase isn't configured: guest-only site, no sign-in UI. */
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: { id: string; email: string | null } };

const AuthContext = createContext<AuthState>({ status: "loading" });

/** Lets tests (and stories) supply a fixed auth state. */
export const AuthStateProvider = AuthContext.Provider;

type Session = { user: { id: string; email?: string } } | null;

const toState = (session: Session): AuthState =>
  session
    ? { status: "signed-in", user: { id: session.user.id, email: session.user.email ?? null } }
    : { status: "signed-out" };

/**
 * Sign-in state for the UI only (which buttons to show). It reads the local
 * session without trusting it for access: every API route and protected page
 * verifies the JWT on the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Only a config check here: this initializer also runs during server rendering.
  const [state, setState] = useState<AuthState>(() =>
    isAuthConfigured() ? { status: "loading" } : { status: "unavailable" },
  );

  const refresh = useCallback(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setState(toState(data.session)));
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState(toState(session)));
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return (
    <AuthContext.Provider value={state}>
      {/* Isolated in Suspense: reading the pathname must not block prerendering. */}
      <Suspense fallback={null}>
        <RefreshOnNavigation refresh={refresh} />
      </Suspense>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Server actions and route handlers (sign-in, OAuth callback) change the
 * session cookies without notifying the browser client, so the session is
 * re-read after each navigation.
 */
function RefreshOnNavigation({ refresh }: { refresh: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    if (isAuthConfigured()) refresh();
  }, [pathname, refresh]);
  return null;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
