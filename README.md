# vitals-panel

A drop-in overlay for performance debugging. It shows the Core Web Vitals for the current page view with their attribution, a second live reading that you can reset, and a button that copies everything as text.

Plain JavaScript, shipped as an ES module: one import, no framework, and no stylesheet to add. It works the same in a React app, a Next.js app or a static page.

Built on Google's [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library, attribution build.

Everything it shows is a lab reading: one page view, on this device. It is not field data.

## The two readings

| Section | Source | What it shows | When it restarts |
|---|---|---|---|
| Page view | `web-vitals`, except a value marked `(panel)` | TTFB, FCP, LCP, INP, CLS, as Chrome defines them, with the LCP and INP parts | On a page load, a back-forward cache restore, or a client-side route change (Chromium 151 and later) |
| Since reset | The panel's own observers | The last interaction and the script behind it, the worst interaction, the worst long animation frame, and the layout shift in the window | When you press Reset |

Why two: INP and CLS are the worst value seen so far in the page view. A fast interaction after a slow one does not change INP, so `web-vitals` reports nothing, even with `reportAllChanges`. The library has no reset. "Since reset" reads the same browser entries (Event Timing, layout-shift and long-animation-frame) over a window you control, so you can click, change code, press Reset and click again without a reload.

The numbers in "Since reset" are the panel's, not Google's. On the demo page a 300 ms click handler read 312 ms on one run and 320 ms on another, the same value in both sections each time.

Every row and both section headings have an info button, marked `i`, that opens a short description of what the metric is and what counts as good. Escape or a click elsewhere closes it.

## Which script was slow

A [long animation frame](https://developer.chrome.com/docs/web-platform/long-animation-frames) is a frame that takes more than 50 ms from its first task to the end of its rendering. The browser reports each one with the scripts in it that ran for more than 5 ms. The panel shows them in three places:

| Row | Lines | What they say |
|---|---|---|
| Page view, INP | `longest script`, `script time`, `style and layout` | From `web-vitals`: the script that ran longest during the INP interaction, and the totals for it. Marked `(panel)` when the panel filled them in |
| Since reset, last interaction | `longest script`, `its invoker`, `script time`, `forced style and layout` | The same for the last interaction, worked out by the panel. Script time leaves out the style and layout that the scripts forced, as `web-vitals` does |
| Since reset, worst frame | `blocking duration`, `longest script`, `its invoker` | The longest frame in the window, whether or not an interaction caused it. Blocking duration is the part of each task past 50 ms, after the frame's rendering time is added to its longest task |

A script reads `main.ts@988 save (http://localhost:5173/demo/main.ts)`: the file, a character offset into it (not a line number), the function's name when it has one, and the full URL. The invoker is how the browser entered the script, for example `BUTTON#slow.onclick` or `Window.requestAnimationFrame`. The panel cuts a long value off, so hover over it or press Copy to read it in full.

The browser does not say which interaction a frame belongs to. The panel matches them by time, with the rule `web-vitals` uses: a frame belongs to an interaction when it overlaps or touches the time from the interaction's start to the end of its event handlers.

`web-vitals` reports INP once per value, and in Chromium 152 the browser can deliver the interaction's frame a few milliseconds later (4 ms, when measured on the demo page). The library then has no frame to read, and it does not report the same value twice. When that happens the panel works the three INP lines out from its own frames, with the same rule, and marks each value: `script time: 300 ms (panel)`. A value without the mark is what `web-vitals` wrote. Nothing else in "Page view" comes from the panel.

On the demo page the 300 ms click read `main.ts@1004`, invoked by `BUTTON#slow.onclick`, with 300 ms of script time, in a 300 ms frame that blocked for 250 ms.

## Use it

```js
import { mountVitalsPanel } from "@defaultdave/vitals-panel";

const unmount = mountVitalsPanel();
```

That is the whole setup. Call `unmount()` to take the panel off the page. Mount one panel per page.

To keep it out of a production bundle, load it only in development:

```js
if (import.meta.env.DEV) {
  const { mountVitalsPanel } = await import("@defaultdave/vitals-panel");
  mountVitalsPanel();
}
```

In React, mount it from an effect. In the Next.js App Router this is a Client Component that the root layout renders:

```tsx
"use client";

import { useEffect } from "react";
import { mountVitalsPanel } from "@defaultdave/vitals-panel";

export function Vitals() {
  useEffect(() => mountVitalsPanel(), []);
  return null;
}
```

The effect's cleanup is the function `mountVitalsPanel` returns, so Strict Mode's second mount leaves one panel. Importing the package on a server is safe: `mountVitalsPanel` does nothing where there is no `document`.

| Option | Default | What it does |
|---|---|---|
| `open` | `true` | Whether the panel starts expanded |
| `log` | `false` | Logs every `web-vitals` metric and its full attribution object to the console |

Other exports:

| Export | What it is for |
|---|---|
| `subscribeVitals(listener)` and `getVitals()` | The same data without the panel, to build your own display |
| `getServerVitals()` | The empty readings. With the two above it completes React's `useSyncExternalStore(subscribeVitals, getVitals, getServerVitals)` |
| `onVitalsMetric(listener)` | Every raw `web-vitals` metric as it is reported. Returns an unsubscribe function. This is where a beacon to an analytics endpoint would attach |
| `resetLive()` | What the Reset button calls |
| `toReportText(snapshot, env)` | What the Copy button copies |

The types come with the package: `VitalsPanelOptions` for the options above, `VitalsSnapshot` for what `getVitals()` returns (a `PageReading` of `Row`s, each with a `Rating`, and a `LiveReading` of `Interaction`s and `FrameEntry`s), `VitalsMetric` for what `onVitalsMetric` passes, and `ReportEnv` for the second argument of `toReportText`.

## What it adds to the page

| Item | Detail |
|---|---|
| Elements | One `<vitals-panel>` element at the end of `<body>`. Everything else is in its shadow root |
| Styles | Bundled in the JavaScript and given to the shadow root as a constructed stylesheet. The page's CSS does not reach the panel and the panel's does not reach the page. No `<style>` element and no `style` attributes, so a Content Security Policy without `unsafe-inline` allows it |
| Size | `dist/index.js` is 22.1 kB, 7.8 kB gzipped, stylesheet included (0.2.0 with the long animation frame rows and the descriptions) |
| Dependencies | `web-vitals` 6, attribution build (5.6 kB gzipped). It stays an import, so an app that already uses `web-vitals` loads one copy |
| Observers | One set per page, started by the first mount or subscription. They keep running after `unmount()`, because `web-vitals` has no unsubscribe |
| Work | An update changes the text of the cells whose value changed. A collapsed panel does none and catches up when it opens |

## Coming from 0.1

| 0.1 | 0.2 |
|---|---|
| `<VitalsPanel />` and `import "@defaultdave/vitals-panel/styles.css"` | `mountVitalsPanel()` |
| `defaultOpen` prop | `open` option |
| `useVitals()` | `useSyncExternalStore(subscribeVitals, getVitals, getServerVitals)` |
| `react` peer dependency | None |

## Install it in another app

The package is not published to npm. Build a tarball and install that:

```bash
npm pack
```

```bash
npm install ../vitals-panel/defaultdave-vitals-panel-0.2.0.tgz
```

`npm pack` runs the build first. `web-vitals` 6 is installed with the package, and there are no peer dependencies.

## Develop

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies |
| `npm run dev` | Serves the demo page: a fast button, a slow one, a late layout shift and a route change |
| `npm test` | Runs the tests once |
| `npm run typecheck` | Type-checks |
| `npm run lint` | Lints |
| `npm run build` | Builds `dist/` |

## Limits

- Tried in Chromium 152 only. Per the `web-vitals` README, CLS is Chromium only, and so is the live layout shift. Rows a browser cannot fill stay empty.
- Long animation frames are Chromium 123 and later. Elsewhere the script lines read `n/a` and "worst frame" stays empty.
- The browser does not report a frame under 50 ms or a script under 5 ms. An interaction faster than that names no script, and "worst frame" has no rating because no Core Web Vitals threshold applies to a frame.
- A script's source is where the browser entered it, not the slowest function it called. This has not been tried in a React app, where one listener on the root handles every event, so expect that listener to be the one named.
- A `(panel)` value in the INP row can differ a little from what `web-vitals` would have written. The panel counts no style and layout for a frame that rendered nothing, where the library subtracts from the frame's end regardless. On the demo page both read 300 ms and 0 ms, on separate runs.
- A frame that begins with a click or key press on the panel is left out of "worst frame", matched by the time of the first event in the frame. A frame that begins with the pointer moving and then takes a click on the panel is not.
- The panel is taller than 80% of a window under about 1040 px high, and scrolls there.
- The info buttons need the Popover API, which browsers have had since 2024. Before that the button does nothing. A description opens beside its row, to the left of the panel, where the browser has CSS anchor positioning with `anchor-scope` (Chromium 131 and later). Elsewhere the browser centers it in the window. Only Chromium 152 was tried.
- The browser does not report an interaction shorter than 16 ms, so "last interaction" keeps its previous value after one. The count does not move either.
- `web-vitals` only observes interactions of 40 ms or more for INP, and falls back to the first input below that.
- Clicks and key presses on the panel itself are left out of "Since reset". They still count toward the page view's INP, because `web-vitals` cannot tell them apart. The browser names the panel's host element, not the button inside its shadow root, so a panel interaction shows there with `html>body>vitals-panel` as its target.
- A page script that stops a click or key event in the capture phase, before it reaches the panel, hides that event from the panel too. The interaction then counts in "Since reset".
- The copy fallback for pages without the Clipboard API has not been tried on iOS Safari.
- A page loaded in a background tab reports no FCP or LCP. That is `web-vitals` behaving as designed.
- Route changes restart the page view only where the browser detects a soft navigation: a user interaction, a URL change and a paint.
- Resizing the window moves the panel, because it is anchored to the bottom right, and the browser counts that as a layout shift. So does hiding or showing the panel, but the browser marks that shift as a response to input and neither reading counts it.
- A browser without constructed stylesheets (Safari before 16.4) gets the styles in a `<style>` element inside the shadow root, which a strict Content Security Policy refuses.
- The React snippet above was run in one app: Next.js 16.4 with React 19.3, dev server, Strict Mode on. One panel mounted, with no hydration warning. A production build has not been tried.

## The panel must not move its own numbers

Values are left-aligned in a fixed column on purpose. In the first version they were right-aligned, and every time a value arrived its left edge moved. Chrome counted that as a layout shift and the page's CLS read 0.003 with the panel's own `span` as the largest shift. Fixed-width cells were not enough: Chrome reports the text node too.

The panel builds every row once and afterwards only changes the text inside nodes that already exist. Checked on 0.2.0 (Chromium 152, dev build, this machine): a reload, a run of clicks and key presses, two copies, a reset and a route change produced no layout-shift entry from the panel. The only entries were the demo's own banner and the ones from hiding and showing the panel.

## License

MIT. See `LICENSE`.
