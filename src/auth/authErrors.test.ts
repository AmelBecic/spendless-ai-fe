import { AuthError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { toUserFacingAuthError } from "./authErrors";

describe("toUserFacingAuthError", () => {
  // What a user actually saw before this existed: the browser's own transport
  // message, rendered as if it were advice.
  it("replaces a transport failure with something actionable", () => {
    const result = toUserFacingAuthError(new AuthError("Failed to fetch", 0));

    expect(result.message).not.toBe("Failed to fetch");
    expect(result.message).toContain("Could not reach");
    expect(result.cause).toBeInstanceOf(AuthError);
  });

  it("recognises the transport failure by message across engines", () => {
    for (const message of ["Load failed", "NetworkError when attempting to fetch resource"]) {
      expect(toUserFacingAuthError(new Error(message)).message).toContain("Could not reach");
    }
  });

  // "Invalid login credentials" is already the right thing to show — rewriting
  // it would tell the user less than Supabase did.
  it("passes a genuine auth message through untouched", () => {
    const original = new AuthError("Invalid login credentials", 400);

    expect(toUserFacingAuthError(original)).toBe(original);
  });

  it("gives a fallback for something that is not an Error at all", () => {
    const result = toUserFacingAuthError("kaboom");

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("Something went wrong");
  });
});
