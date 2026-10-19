# Cafe Finder UI/UX redesign

Reviewed and implemented on 2026-10-19. This is a consumer UI redesign across the completed M0-M7 features, not an M8 launch sign-off.

## Audit and implementation

| Area | Finding | Implemented change |
|---|---|---|
| Shared shell | Plain navigation, no active-route feedback, weak footer hierarchy | Responsive two-row mobile navigation, active links with `aria-current`, clearer brand, consistent container widths and footer navigation |
| Home `/` | Long, single-column settings form competed with the introduction | Editorial hero with original cafe illustration; two-column location/purpose search on larger screens; distance/rating/hours in a disclosure; explicit submit preserved |
| Discovery `/discover` | Filters dominated the width; results and explanation copy lacked hierarchy | Narrower filter panel, clearer result heading, disclosure for ranking methodology, prominent factual source notices, local nearest/rating/match sorting |
| Result cards | Dense, equally weighted facts and controls | Linked cafe titles, original recommendation rank, quieter match badge, grouped factual summary, consistent primary/secondary actions and evidence sections |
| Map/list interaction | Existing useful behavior needed consistent presentation | Preserved lazy Google Maps loading, synchronized card/marker selection, mobile list/map switch, mounted-map reuse, and fallback when Maps is unavailable |
| Details `/cafes/[placeId]` | Long stack of unrelated sections | Wider cafe overview, grouped essentials/actions, photos before secondary information, section navigation, two-column information/hours layout, separate member and Google reviews |
| Favorites `/favorites` | Saved items, notes and visited cafes had little hierarchy | Collection heading, discovery action, responsive saved-card grid, distinct visited section, visible status feedback, private notes retained |
| Sign-in `/login` | Generic form without context or password visibility | Responsive welcome/form layout, clear sign-in/create-account switch, show/hide password, existing accessible field errors and Google sign-in preserved |
| Account `/account` | Profile, preferences and deletion were one long stack | Section navigation, consistent surfaces, clearer defaults explanation, distinct destructive navigation and existing confirmation retained |
| Assistant `/assistant` | Prose-heavy sidebar and undifferentiated conversation | Conversation bubbles, editable starter prompts, clearer composer, vendor disclosure, interpreted-filter summary, mobile jump to recommendations, useful initial state |
| Community | Reports and reviews must remain clearly distinct from Google | Preserved provenance, dates, moderation and uncertainty; shared controls and details surfaces improve consistency; corrected stale preference guidance |
| Guidelines `/community-guidelines` | Unstructured policy text | Readable section cards and a clear introduction, preserving all existing rules |
| Moderation `/moderation` | Queue lacked context and clear empty-state presentation | Consistent heading, guidance, queue surfaces and empty state; authorization and decisions unchanged |
| Errors and missing pages | Bare fallback text | Shared visual language, clear recovery action, existing safe error handling and skeletons preserved |

No standalone modal existed in the reviewed UI. Native disclosures, location selection, member-report forms, review flags, score breakdowns, photo expansion, and confirmation inputs were reviewed as the existing interactive surfaces. Auth callback/confirmation endpoints remain redirects; API routes remain operational endpoints, not new visual pages.

## Design system

- Forest-green actions, warm neutral background, white surfaces and restrained sage secondary surfaces. Tokens live in `src/app/globals.css` and flow through existing Tailwind/shadcn primitives.
- Existing Geist typography, consistent headings, compact uppercase section labels, reusable `PageHeading`, shared page/container/surface patterns, 44-48px primary touch targets and visible keyboard focus.
- One original vector illustration, with no implied cafe identity or fabricated photography. No new dependencies, external image services or additional font requests.
- Responsive layouts at 375, 768, 1024 and 1440px. Reduced-motion preferences remain respected. Long text wraps; overflow is fixed structurally rather than hidden at the page level.

## Behavior preserved

Places, Supabase sessions/RLS, persistence, recommendation scoring, community aggregation, AI adapters, request validation and rate/cost guards are unchanged. Sorting is client-side over the already fetched subset: unknown values sort last, ties preserve recommendation order, original match ranks/best-match badge and map numbers remain consistent. Sorting makes no new API request. Searches still require explicit submission.

Google attribution, photo/review credits, straight-line distance, unknown amenities, advisory price levels, non-exhaustive coverage and scripted-demo labels remain present. Model output still cannot supply cafe facts. Device location still requires explicit browser permission.

## Verification

The reproducible checks are:

- `pnpm check`: lint, TypeScript and the unit/component/handler/database suite.
- `pnpm test:e2e`: existing functional regressions plus 52 explicit route/width combinations in `responsive.spec.ts`, including full mocked Google details. Each checks page rendering, overflow and axe WCAG A/AA rules, and saves a full-page screenshot in `test-results`.
- `pnpm test:e2e:ai`: enabled scripted conversation/refinement/failure flows plus AI results at all four widths. Screenshots go to `test-results-ai`.
- `pnpm test:e2e:auth`: signed-out sign-in/registration UI at all four widths, visibility toggle, invalid-input server validation, overflow and axe checks. Uses an intentionally nonfunctional public Supabase configuration, aborts browser requests to that domain, and never submits valid credentials or creates an account. Screenshots go to `test-results-auth`.
- Production builds run in each browser configuration. These builds share `.next` and must run sequentially.
- Chrome computer-use review supplements automated checks, including the existing signed-in account and favorites views. Final visual evidence is stored in `artifacts/ui-redesign`.

The final local production preview also returned 20 actual Google cafes in BKK1, displayed the Google map, sorted nearest-first locally, and loaded BROWN Roastery's actual details and credited first photo. Existing signed-in account and empty-favorites layouts were checked for overflow at all four widths. The composer was moved above starter suggestions after visual review so the primary assistant action is easier to reach; the enabled-assistant suite passed again after that adjustment. The final production build with the actual local configuration passed.

Final checks passed: lint, TypeScript, **693 unit/component/handler/database tests** (24 opt-in live/simulation skips), **151 standard/responsive E2E tests** (77 configuration/duplicate-viewport skips), **10 enabled-assistant E2E tests** (6 configuration skips), and **4 signed-out-auth E2E tests**. The 52 route/width checks and the 8 enabled-AI/auth width checks reported no horizontal overflow or axe violations. These suites each built production successfully; a final build also verifies the actual local provider configuration.

The header smoke test was updated to scope its brand-link lookup to the banner, because the redesigned footer also links home. The preference-disclaimer assertion now checks the accurate approved-member-evidence guidance. A new sorting interaction test verifies unknowns-last ordering, restoring match order, and keeping the original best-match badge. Existing functional assertions remain in place.

## Limits of verification

Automated browser suites use fixture/mocked Places, scripted AI, and guest or signed-out authentication. They do not prove live OAuth, email delivery, registration, multi-account synchronization, or moderator authorization on the hosted project. Existing component/handler/database tests cover those boundaries; no real account deletion or moderation action is performed for visual QA. A populated live favorites collection and moderator queue require suitable existing data/access.

The earlier M6 international-phone moderation issue remains a separate known business-logic defect. This redesign does not change moderation rules. M8 legal, deployment, operational and launch requirements remain outside this visual delivery. Automated accessibility checks supplement, rather than replace, assistive-technology testing; cross-browser Safari/Firefox testing has not been performed.
