// Guards the two properties of the copied contract that a reader cannot verify
// by looking at it.
//
// Neither test can tell you the types still MATCH the backend — only a re-diff
// against the recorded SHA does that, and it is a human checklist item. What
// these do is keep the mitigation itself from rotting: a SHA that quietly
// disappears, or a wire type that grows a second home.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the project root rather than `import.meta.url`: under the jsdom
// environment the module URL is an http:// one, and `fileURLToPath` throws on it.
const SRC = join(process.cwd(), "src");
const CONTRACT = join(SRC, "api", "contract.ts");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the copied contract's header", () => {
  const header = readFileSync(CONTRACT, "utf8").slice(0, 4000);

  it("records the backend commit the types were copied from", () => {
    // A 40-hex SHA, not a branch name or "latest" — those move, which is exactly
    // what makes them useless as a drift baseline.
    expect(header).toMatch(/^\/\/ Commit: [0-9a-f]{40}\b/m);
  });

  it("names the backend repo and every source file the types came from", () => {
    expect(header).toContain("AmelBecic/spendless-ai-be");
    for (const file of [
      "src/domain/types.ts",
      "src/http/errors.ts",
      "src/routes/categories.ts",
      "src/routes/stats.ts",
      "src/routes/profile.ts",
      "src/routes/suggestions.ts",
      "src/routes/transactions.ts",
      "src/routes/fixed-expenses.ts",
    ]) {
      expect(header).toContain(file);
    }
  });
});

describe("wire types are declared nowhere else", () => {
  // Client invariant 4. The failure this prevents is quiet: a component that
  // declares its own `StatsResponse` compiles, renders, and drifts from the
  // backend independently of the SHA above — so the one mitigation we have
  // stops covering it without anything going red.
  it("declares no response/request body type outside contract.ts", () => {
    const offenders = walk(SRC)
      .filter((path) => path !== CONTRACT && !/\.(test|spec)\.tsx?$/.test(path))
      .flatMap((path) => {
        const declarations =
          readFileSync(path, "utf8").match(
            /^\s*(?:export\s+)?(?:interface|type)\s+(\w*(?:Response|Body|ErrorBody)\w*)/gm,
          ) ?? [];
        return declarations.map((d) => `${relative(SRC, path)}: ${d.trim()}`);
      });

    expect(offenders).toEqual([]);
  });
});
