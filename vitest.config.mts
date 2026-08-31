import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./*" path alias.
      "@": path.resolve(dirname, "."),
    },
  },
});
