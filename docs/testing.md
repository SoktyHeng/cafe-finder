# Testing

## Layers

| Layer | Tool | Location | Command |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` next to the code | `pnpm test` |
| Component | Vitest + React Testing Library + jest-dom (jsdom) | `src/**/*.test.tsx` | `pnpm test` |
| Route integration | Vitest, handler with injected env and provider | `src/app/api/**/handler.test.ts` | `pnpm test` |
| End-to-end | Playwright (desktop Chrome and Pixel 7 projects) | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |
| Accessibility | `@axe-core/playwright`, WCAG 2.0, 2.1 and 2.2 A/AA rules | `tests/e2e/accessibility.spec.ts` | `pnpm test:e2e` |

## Conventions

- Prefer accessible queries (`getByRole`, `getByLabelText`). Use `data-testid` only for elements without a natural role.
- Vitest aliases `server-only` to [src/test/server-only-stub.ts](../src/test/server-only-stub.ts), so server modules can be unit tested.
- Test environment parsing through the pure `parseServerEnv` and `parsePublicEnv` functions with explicit inputs. Never mutate `process.env` in tests.
- E2E runs a **production build** in fixture mode on port 3100 (`reuseExistingServer` outside CI). E2E must never call Google or Supabase. Upstream APIs are mocked from M2 onward.
- Default CI must never call Google APIs.

## E2E coverage (M1)

| Spec | Covers |
|---|---|
| `smoke.spec.ts` | Shell, responsive layout, skip link, security headers, 404 |
| `discovery.spec.ts` | Location denied → manual area → results. Location granted with rounded coordinates. No search while editing, exactly one per submit. Unknown values labelled. Empty state explanation. 503 error and retry. 429 message. Invalid link never searches. Keyboard-only flow. Mobile settings toggle |
| `accessibility.spec.ts` | axe scans of home and discover (idle, results, empty) on both viewports |

- Upstream failures are simulated with `page.route()` on `/api/places/nearby`. Fixture mode needs no network access.
- Geolocation uses Playwright's `grantPermissions`, `setGeolocation` and `clearPermissions`. No real position is used.

## First-time setup

```bash
pnpm exec playwright install chromium
```

## Quality gates (CLAUDE.md §13.4)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```
