// ESLint flat config (ESLint 9+). Mirrors the backend's: minimal, TypeScript-aware,
// plus Next's own rules and one enforced architectural seam.
import tseslint from "typescript-eslint";
import next from "eslint-config-next/core-web-vitals";

const FETCH_MESSAGE =
  "Do not call fetch directly — go through src/api/client.ts, which attaches the auth token and parses the error envelope.";

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
    // module calling `fetch` itself is a request that silently skips both — an
    // unauthenticated call, or a backend error surfaced as a generic failure.
    //
    // Scoped to all of src/** rather than to the directories that exist today:
    // listing `app`, `components`, `hooks` would leave a later `src/lib` or
    // `src/features` unrestricted by default, so the seam would stop covering
    // new code with nothing going red. Default-deny, exempt the one caller.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: FETCH_MESSAGE,
        },
      ],
      // `no-restricted-globals` only matches the bare identifier, so the member
      // forms below would otherwise sail straight through the rule above.
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: FETCH_MESSAGE },
        { object: "globalThis", property: "fetch", message: FETCH_MESSAGE },
      ],
    },
  },
  {
    // The one place allowed to reach the network. Tests may stub it too — the
    // suite stubs the transport rather than calling a live backend.
    files: ["src/api/**/*.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },
);
