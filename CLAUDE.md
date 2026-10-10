# Working rules for this repo

These rules apply to anyone, human or AI, changing code here. AI output is treated as a draft: it is reviewed, run and tested before it is committed. Notable corrections go in `docs/AI_LOG.md`.

## Layout
- `app/`: Part A, React 19 + Vite + TypeScript (strict). Run `npm run api` in the repo root first.
- `perf-clinic/`: Part B, plain HTML/CSS/JS. Keep it framework-free.
- `docs/`: API_NOTES (observed API behaviour), DESIGN (tokens and layout decisions), AI_LOG.

## TypeScript
- `strict` and `noUncheckedIndexedAccess` are on. No `any`, no non-null `!` except on `document.getElementById('root')`.
- API data is `unknown` until a guard in `api/guards.ts` narrows it. Arbitrary JSON (`args`, `result`) stays `unknown` and is only rendered through `JsonView`.
- Types live next to their owner: API shapes in `api/types.ts`, component props in the component file.

## Architecture
- **The URL is the single source of truth** for search, filters and the open event. Read and write it only through `hooks/useExplorerUrlState.ts`. Never mirror it into `useState`. The one exception is the search box's in-progress text.
- **All network calls go through `api/client.ts`** (`apiGet`), which handles timeouts, aborts, typed `ApiError` and response guards. Components never call `fetch`.
- **Server state lives in TanStack Query**, never in component state or context. Query keys come from `api/queryKeys.ts`.
- Retry policy is set once in `lib/queryClient.ts`: retry network, timeout and 5xx errors twice with backoff; never retry 4xx.
- Pure logic (formatting, URL parse/serialize, virtualisation maths) lives in `lib/` as plain functions with unit tests.
- Components are presentational where possible: data hooks are called in `pages/ExplorerPage.tsx` or in a container component, then passed down as props.

## Components and styling
- One component per file, PascalCase, in `components/<Area>/`.
- **Styling is Tailwind v4 utilities.** `styles/tokens.css` *is* the Tailwind theme: the default palette, type scale, radii and shadows are removed, so only token utilities exist (`bg-surface`, `text-muted`, `border-control`, `text-data`, `rounded-md`, `shadow-panel`). Never use arbitrary colour values (`bg-[#fff]`) or inline colour styles.
- Dark mode needs no `dark:` variants: the same CSS variables are redefined under `prefers-color-scheme: dark`.
- Spacing uses Tailwind's 4px scale (`p-2` = 8px, `gap-3` = 12px). Arbitrary pixel values only for layout sizes that come from a token (`h-(--row-height)`, `w-(--panel-width)`).
- Long class lists are a sign to extract a small component (`Button`, `FilterButton`, `StatusBadge`), not to add a CSS file. Plain CSS only for what utilities can't express (`@utility skeleton`, keyframes) in `styles/global.css`.
- Status is always colour + icon + word (`StatusBadge`), never colour alone.

## UX contract (every data view)
- **Loading:** skeleton or inline spinner, never a blank area. Keep previous rows visible (dimmed) while new filters load.
- **Slow:** after 2.5 s still loading, show `SlowNotice` with retry.
- **Empty:** explain which filters produced nothing and offer to clear them.
- **Error:** human message, error detail in mono, a retry action. Never discard rows or filters that are already loaded.

## Accessibility
- Semantic elements first (`button`, `input`, `label`, `fieldset`). ARIA only where HTML has no equivalent (grid, dialog).
- Every interactive element is keyboard reachable with a visible `:focus-visible` outline (`--focus-ring`).
- Async status changes are announced via a polite live region.
- Respect `prefers-reduced-motion` (global rule in `styles/global.css`; use `motion-safe:` for decorative motion) and `prefers-color-scheme`.
- Text contrast ≥ 4.5:1 and control borders ≥ 3:1 (ratios are documented in `styles/tokens.css` and `docs/DESIGN.md`). Control outlines use `border-control`; `border-border` is for decorative dividers only.

## Before committing
- `npm run typecheck && npm run lint && npm test` in `app/` must pass.
- Small commits with a conventional prefix (`feat:`, `fix:`, `test:`, `perf(clinic):`, `docs:`, `chore:`). No squashing.
