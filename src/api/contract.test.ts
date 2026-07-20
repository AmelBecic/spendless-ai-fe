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
const ROOT = process.cwd();
const CONTRACT = join(ROOT, "src", "api", "contract.ts");

const IGNORED_DIRS = new Set([".git", ".next", "node_modules", "coverage", "out", "dist"]);

// Walks the repo root, not just src/: the criterion is "nowhere else in the
// repo", and a wire type in a root-level file (next.config.ts, a future
// middleware.ts, or an app/ directory if this ever moves off src/) is just as
// much a second source of truth as one in a component.
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : walk(join(dir, entry.name));
    }
    return /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

// The domain types contract.ts owns, longest first so alternation cannot match
// `Category` inside `CategoryTotal` and stop there.
const OWNED_TYPES = [
  "ProfileSummaryData",
  "SuggestionStatus",
  "ProfileSummary",
  "CategoryTotal",
  "FixedExpense",
  "Transaction",
  "SpendStats",
  "Suggestion",
  "FieldError",
  "ErrorCode",
  "Category",
  "Cadence",
  "Money",
];

// Matching on the `…Response` / `…Body` / `…Query` suffix alone would let an
// `interface StatsPayload` or a `type ProfileDto` through — the same duplicate
// wearing a different name. Naming the owned types catches the renamed copy too.
const WIRE_TYPE_DECLARATION = new RegExp(
  String.raw`^\s*(?:export\s+)?(?:interface|type)\s+(?:\w*(?:Response|Body|Query)|${OWNED_TYPES.join("|")})\b`,
  "gm",
);

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
  it("declares no wire type outside contract.ts, anywhere in the repo", () => {
    // Test files are deliberately NOT exempt. A fixture typed against a locally
    // declared `StatsResponse` is where a hand-rolled shape appears first, and
    // the production code then gets written to match the fixture — drifting from
    // the backend without the recorded SHA covering any of it. This file is the
    // only exclusion, and it needs no exemption of its own: `OWNED_TYPES` is a
    // `string[]`, not a type declaration, so it never self-triggers.
    const offenders = walk(ROOT)
      .filter((path) => path !== CONTRACT)
      .flatMap((path) => {
        const declarations = readFileSync(path, "utf8").match(WIRE_TYPE_DECLARATION) ?? [];
        return declarations.map((d) => `${relative(ROOT, path)}: ${d.trim()}`);
      });

    expect(offenders).toEqual([]);
  });
});
