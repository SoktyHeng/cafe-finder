# Architecture

The target architecture is described in CLAUDE.md §4. This file records **what is actually implemented**.

## Current state (M0)

```text
Browser ──> Next.js App Router (static shell: /, not-found)
              ├─ src/instrumentation.ts  → validates env at server start
              └─ src/lib/config/          → Zod env schemas (server + public)
```

- **Rendering:** Cache Components are enabled. The home page and the not-found page are prerendered as static pages.
- **Configuration:** `getServerEnv()` is only available on the server, guarded by the `server-only` import. `getPublicEnv()` reads only statically referenced `NEXT_PUBLIC_*` variables, so Next.js can inline them.
- **Provider switching:** `PLACES_PROVIDER` (`fixture` | `google`) is validated today. The `PlacesProvider` contract and its implementations arrive in M1 (fixture) and M2 (Google).
- **Error boundaries:** `app/error.tsx` handles route errors. `app/global-error.tsx` handles root layout failures and renders its own `<html>`. Both use the shared `ErrorFallback`, which never shows raw error text.
- **Security headers:** set in `next.config.ts` for all routes.
