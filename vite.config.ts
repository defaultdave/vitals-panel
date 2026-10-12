import { defineConfig } from "vitest/config";

// `vite` serves the demo page (index.html). `vite build` builds the library from src/index.ts.
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rolldownOptions: {
      // Left as an import, so an app that already uses web-vitals loads one copy.
      external: [/^web-vitals/],
    },
    // The stylesheet ships as a string inside the bundle, where the app's own build will not minify it.
    cssMinify: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
  },
});
