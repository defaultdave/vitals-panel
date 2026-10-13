# vitals-panel

A plain-JavaScript library: a Core Web Vitals debugging overlay built on `web-vitals`. No framework. See `README.md` for what it does and how the two readings differ.

## Tooling

- TypeScript 6, `web-vitals` 6 attribution build. No React and no peer dependencies.
- Vite 8: `npm run dev` serves the demo page (`index.html` and `demo/`), `npm run build` builds the library from `src/index.ts` into `dist/` and `tsc -p tsconfig.build.json` writes the type declarations.
- Vitest 4 with jsdom, `@testing-library/dom` and user-event. ESLint 10 with typescript-eslint.

Gates, in order: `npm run build && npm run lint && npm run typecheck && npm test`.

## Layout

| Path | What lives there |
|---|---|
| `src/lib/rows.ts`, `live.ts`, `frames.ts`, `report.ts`, `view.ts` | Pure functions: every decision, with a test beside each |
| `src/lib/about.ts` | The description behind each info button, keyed by row name |
| `src/lib/store.ts` | The only module that calls `web-vitals` or `PerformanceObserver`. One set of observers per page |
| `src/lib/clipboard.ts` | The only module that touches the clipboard |
| `src/mountVitalsPanel.ts`, `src/mountVitalsPanel.css` | The panel: DOM in a shadow root, and its stylesheet. It draws what `lib/view.ts` returns and holds no measuring logic |
| `demo/`, `index.html` | The demo page. Not shipped |

## Rules that are easy to break

- The "Page view" rows are `web-vitals` output, with one exception: the INP row's three script lines, when `web-vitals` reported without a long animation frame (`fillInpScripts` in `rows.ts`). Each value the panel fills in ends with `(panel)`. Do not mix any other measurement of the panel's into those rows, and never an unmarked one.
- `web-vitals` has no unsubscribe and replays buffered entries on a second subscription. Never call `onINP` and friends outside `store.ts`.
- The panel must not change size as values arrive. Every row is in a fixed layout table (`PAGE_LAYOUT`, `LIVE_LAYOUT`), every element is built once, and an update only sets the `data` of a text node that already exists.
- Styles live in `mountVitalsPanel.css`, which the build inlines as a string (`?inline`) and the shadow root adopts. No `style` attribute and no `<style>` element where a constructed stylesheet works.
- A description is a `popover` element opened by its button's `popovertarget` and placed by CSS anchor positioning. No script opens, closes or positions one, and none sits in the panel's flow.
- Build elements with `createElement`. `innerHTML` throws on a page that enforces Trusted Types, and the values shown are selectors from someone else's page.
- The panel leaves its own clicks and key presses out of "Since reset" by event time (`ignoreInteractionsWith` in `store.ts`), because the browser reports the shadow host as the target, never the element inside. The long animation frames those events start are left out the same way, by `firstUIEventTimestamp`.
- An interaction's frames are matched to it when the rows are built (`scriptsOf` in `live.ts`), never on arrival: the frame's entry and the event's entries come in separate callbacks, in either order.
- The module must be safe to import on a server: nothing at the top level touches `document` or `window`.
