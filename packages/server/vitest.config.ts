import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The Interhuman API key is now a hard requirement at server startup
    // (index.ts refuses to run without one -- see interhuman.ts's doc
    // comment), and clipUpload.test.ts imports that module directly. A
    // placeholder here keeps the suite hermetic -- it never makes it to a
    // real network call (interhuman.test.ts and clipUpload.test.ts both
    // mock fetch themselves), it just needs to be truthy so the startup
    // check doesn't fail on a fresh clone/CI with no packages/server/.env.
    env: {
      INTERHUMAN_API_KEY: "vitest-placeholder-key",
    },
  },
});
