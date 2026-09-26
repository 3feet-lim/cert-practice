import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Resolve the workspace contracts package from source so dev, tests, and builds never
// run against a stale `dist` (which previously broke mock mode after schema changes).
const contractsSource = fileURLToPath(
  new URL("../../packages/contracts/src/index.ts", import.meta.url),
);

export default defineConfig({
  // CloudFront serves SPA fallbacks for deep links, so production assets must be root-absolute.
  base: "/",
  resolve: {
    alias: [{ find: /^@cert-quiz\/contracts$/, replacement: contractsSource }],
  },
  build: {
    assetsDir: "assets",
  },
  plugins: [tailwindcss(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/test/**",
      ],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
