import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fail the production build on a type error rather than shipping past it.
  // (Next's default already does this; stated explicitly so a future `true` is a
  // deliberate, reviewable change rather than a silent one.)
  //
  // There is no `eslint` key here: Next 16 removed the built-in lint step, so
  // linting is CI's `npm run lint` and the pre-commit hook, not `next build`.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
