import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping so unit tests
  // can import modules that use the `@/` alias (e.g. schemas.ts pulling in
  // the i18n dictionary for translation keys) without rewriting every
  // import to a relative path.
  // `server-only` is a build-time guard: its whole job is to throw when a
  // client bundle imports it, and vitest is neither. Stubbing it lets modules
  // that legitimately carry the marker — the onMeeting client handles a
  // password, so it must — still be unit-tested, instead of forcing the choice
  // between "testable" and "can't be imported into a client component".
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    // Unit tests only — e2e/ belongs to Playwright, and tests/integration/
    // needs a live database, so it has its own config and script
    // (`npm run test:isolation`). Excluding it keeps `npm test` runnable with
    // nothing but the repo checked out.
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
  },
});
