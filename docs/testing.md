# Testing

## Layers

| Layer | Tool | Location | Command |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` next to the code | `pnpm test` |
| Component | Vitest + React Testing Library + jest-dom (jsdom) | `src/**/*.test.tsx` | `pnpm test` |
| End-to-end | Playwright (desktop Chrome and Pixel 7 projects) | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |

## Conventions

- Prefer accessible queries (`getByRole`, `getByLabelText`). Use `data-testid` only for elements without a natural role.
- Vitest aliases `server-only` to [src/test/server-only-stub.ts](../src/test/server-only-stub.ts), so server modules can be unit tested.
- Test environment parsing through the pure `parseServerEnv` and `parsePublicEnv` functions with explicit inputs. Never mutate `process.env` in tests.
- E2E runs a **production build** in fixture mode on port 3100 (`reuseExistingServer` outside CI). E2E must never call Google or Supabase. Upstream APIs are mocked from M2 onward.
- Default CI must never call Google APIs.

## First-time setup

```bash
pnpm exec playwright install chromium
```

## Quality gates (CLAUDE.md §13.4)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```
