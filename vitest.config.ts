import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/__test__/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/__test__/setup.ts"],
    // Tests live in a __test__ folder beside the code they cover; shared
    // factories and setup live in src/__test__.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/components/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/__test__/**",
        "**/*.test.*",
        "src/components/ui/**",
        "src/lib/sample.ts",
      ],
    },
  },
});
