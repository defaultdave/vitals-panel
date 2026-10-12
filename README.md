# vitals-panel

A drop-in overlay for performance debugging. It shows the Core Web Vitals for the current page view with their attribution, a second live reading that you can reset, and a button that copies everything as text.

Plain JavaScript, shipped as an ES module: one import, no framework, and no stylesheet to add. It works the same in a React app, a Next.js app or a static page.

Built on Google's [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library, attribution build.

Everything it shows is a lab reading: one page view, on this device. It is not field data.

## The two readings

| Section | Source | What it shows | When it restarts |
|---|---|---|---|
| Page view | `web-vitals` | TTFB, FCP, LCP, INP, CLS, as Chrome defines them, with the LCP and INP parts | On a page load, a back-forward cache restore, or a client-side route change (Chromium 151 and later) |
| Since reset | The panel's own observers | The last interaction, the worst interaction, and the layout shift in the window | When you press Reset |

Why two: INP and CLS are the worst value seen so far in the page view. A fast interaction after a slow one does not change INP, so `web-vitals` reports nothing, even with `reportAllChanges`. The library has no reset. "Since reset" reads the same browser entries (Event Timing and layout-shift) over a window you control, so you can click, change code, press Reset and click again without a reload.

The numbers in "Since reset" are the panel's, not Google's. On the demo page a 300 ms click handler read 312 ms on one run and 320 ms on another, the same value in both sections each time.

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

The types come with the package: `VitalsPanelOptions` for the options above, `VitalsSnapshot` for what `getVitals()` returns (a `PageReading` of `Row`s, each with a `Rating`, and a `LiveReading` of `Interaction`s), `VitalsMetric` for what `onVitalsMetric` passes, and `ReportEnv` for the second argument of `toReportText`.

## What it adds to the page

| Item | Detail |
|---|---|
| Elements | One `<vitals-panel>` element at the end of `<body>`. Everything else is in its shadow root |
| Styles | Bundled in the JavaScript and given to the shadow root as a constructed stylesheet. The page's CSS does not reach the panel and the panel's does not reach the page. No `<style>` element and no `style` attributes, so a Content Security Policy without `unsafe-inline` allows it |
| Size | `dist/index.js` is 14.0 kB, 5.3 kB gzipped, stylesheet included (0.2.0) |
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
