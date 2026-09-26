import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

function loadDotEnv(file: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: loadDotEnv(".env.local"),
    testTimeout: 30_000,
  },
});
