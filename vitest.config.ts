import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./__tests__/globalSetup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/**/*.ts", "components/**/*.tsx", "app/**/*.tsx", "server/**/*.ts"],
      exclude: [
        "__tests__/**",
        "node_modules/**",
        "*.config.*",
        "constants/**",
        "lib/sentry.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
    testTimeout: 10000,
    // Force Vite to NOT use node_modules for these — always resolve via alias
    server: {
      deps: {
        inline: ["bcrypt", "helmet", "express-rate-limit"],
      },
    },
  },
  resolve: {
    alias: {
      // Mock native modules that can't run in Node.js test env
      bcrypt: new URL("./__tests__/__mocks__/bcrypt.ts", import.meta.url).pathname,
      helmet: new URL("./__tests__/__mocks__/helmet.ts", import.meta.url).pathname,
      "express-rate-limit": new URL("./__tests__/__mocks__/rate-limit.ts", import.meta.url).pathname,
      "expo-modules-core": new URL("./__tests__/__mocks__/expo-modules-core.ts", import.meta.url).pathname,
    },
  },
});