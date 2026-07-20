import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { toFormErrors } from "./fieldErrors";

describe("toFormErrors", () => {
  it("maps VALIDATION_FAILED details to their fields", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fromEnvelope: true,
      details: [
        { path: "amountCents", message: "Must be greater than zero." },
        { path: "currency", message: "Unknown currency." },
      ],
    });

    const { fields, form } = toFormErrors(error);

    expect(fields).toEqual({
      amountCents: "Must be greater than zero.",
      currency: "Unknown currency.",
    });
    expect(form).toBeNull();
  });

  it("sends a detail with an empty path to the form, not to a field", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fromEnvelope: true,
      details: [{ path: "", message: "At least one field is required." }],
    });

    const { fields, form } = toFormErrors(error);

    expect(fields).toEqual({});
    expect(form).toBe("At least one field is required.");
  });

  it("keeps the first message when a field appears twice", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fromEnvelope: true,
      details: [
        { path: "label", message: "Required." },
        { path: "label", message: "Too short." },
      ],
    });

    expect(toFormErrors(error).fields.label).toBe("Required.");
  });

  it("surfaces a detail-free failure (a 429) as the client's user message", () => {
    const error = new ApiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "rate limited",
      retryAfterSeconds: 90,
    });

    const { fields, form } = toFormErrors(error);

    expect(fields).toEqual({});
    // The user-facing rate-limit copy, not the raw envelope message.
    expect(form).toContain("refresh budget");
  });

  it("normalizes a nested `money.` path onto the flat field the form renders", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fromEnvelope: true,
      details: [{ path: "money.currency", message: "Unknown currency." }],
    });

    // Without knownFields the key is still normalized; with them it matches.
    expect(toFormErrors(error).fields).toEqual({ currency: "Unknown currency." });
    expect(toFormErrors(error, ["currency"]).fields).toEqual({ currency: "Unknown currency." });
  });

  it("routes a path the form does not render to the form, never dropping it", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      fromEnvelope: true,
      details: [{ path: "userId", message: "Not permitted." }],
    });

    // `userId` is no rendered field: it must reach the user at form level, not
    // vanish into a `fields` key nothing reads.
    const { fields, form } = toFormErrors(error, ["amountCents", "currency"]);
    expect(fields).toEqual({});
    expect(form).toBe("Not permitted.");
  });

  it("wraps a non-ApiError as a single form-level message", () => {
    expect(toFormErrors(new Error("boom"))).toEqual({ fields: {}, form: "boom" });
    expect(toFormErrors("not even an error")).toEqual({
      fields: {},
      form: "Something went wrong. Please try again.",
    });
  });
});
