// ESLint flat config (ESLint 9+). Mirrors the backend's: minimal, TypeScript-aware,
// plus Next's own rules and one enforced architectural seam.
import tseslint from "typescript-eslint";
import next from "eslint-config-next/core-web-vitals";

export default tseslint.config(
  {
    ignores: [".next/**", "out/**", "node_modules/**", "coverage/**", "next-env.d.ts"],
  },
  ...tseslint.configs.recommended,
  ...next,
  {
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Client invariant 3, enforced rather than merely documented (CLAUDE.md).
    // Every request goes through src/api/client.ts, which attaches the Supabase
    // access token and parses the `{ error: { code, message } }` envelope. A
    // component calling `fetch` itself is a request that silently skips both —
    // an unauthenticated call, or a backend error surfaced as a generic failure.
    //
    // src/api/** is exempt: that is where the one allowed caller lives.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Components must not call fetch directly — go through src/api/client.ts, which attaches the auth token and parses the error envelope.",
        },
      ],
    },
  },
);
