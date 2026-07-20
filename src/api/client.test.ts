// The API client, driven against a stubbed transport.
//
// Nothing here touches a live Supabase or a live backend: `createApiClient`
// takes its transport and its token provider as dependencies precisely so the
// suite can exercise the real request path offline.

import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  CLIENT_MALFORMED,
  CLIENT_NETWORK,
  CLIENT_TIMEOUT,
  createApiClient,
  formatDuration,
  parseRetryAfter,
  type ApiClientDeps,
} from "./client";

const BASE_URL = "https://api.test.invalid";

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}) {
  return new Response(payload === undefined ? null : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A client whose seams are all stubbed; override only what a test cares about. */
function makeClient(overrides: Partial<ApiClientDeps> = {}) {
  // A fresh Response per call — a body can only be read once, so a shared
  // instance breaks the moment a test makes two requests.
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(200, { ok: true }));
  const onUnauthorized = vi.fn();
  const deps: ApiClientDeps = {
    baseUrl: BASE_URL,
    transport,
    getAccessToken: async () => "test-access-token",
    onUnauthorized,
    timeoutMs: 5_000,
    ...overrides,
  };
  return { api: createApiClient(deps), transport: deps.transport as typeof transport, onUnauthorized };
}

function callOf(transport: ReturnType<typeof makeClient>["transport"], index = 0) {
  const call = transport.mock.calls[index];
  if (!call) throw new Error(`the transport was never called a ${index + 1}th time`);
  return call;
}

/** The URL the stubbed transport was called with. */
function urlOf(transport: ReturnType<typeof makeClient>["transport"], call = 0): string {
  return callOf(transport, call)[0] as string;
}

/** The `RequestInit` the stubbed transport was called with. */
function initOf(transport: ReturnType<typeof makeClient>["transport"], call = 0): RequestInit {
  return callOf(transport, call)[1] as RequestInit;
}

function headersOf(transport: ReturnType<typeof makeClient>["transport"], call = 0) {
  return initOf(transport, call).headers as Record<string, string>;
}

describe("the access token", () => {
  it("is attached to every request", async () => {
    const { api, transport } = makeClient();

    await api.getCategories();

    expect(headersOf(transport).Authorization).toBe("Bearer test-access-token");
  });

  // Anonymous is a real state — /health takes no auth, and a signed-out user
  // must get a clean 401 from the backend rather than `Bearer null`.
  it("is omitted entirely when there is no session", async () => {
    const { api, transport } = makeClient({ getAccessToken: async () => null });

    await api.health();

    expect(headersOf(transport)).not.toHaveProperty("Authorization");
  });

  it("is re-read per request, so a refreshed token is picked up", async () => {
    const tokens = ["first-token", "second-token"];
    const { api, transport } = makeClient({ getAccessToken: async () => tokens.shift() ?? null });

    await api.getCategories();
    await api.getCategories();

    expect(headersOf(transport, 0).Authorization).toBe("Bearer first-token");
    expect(headersOf(transport, 1).Authorization).toBe("Bearer second-token");
  });
});

describe("request shaping", () => {
  it("drops undefined query params rather than sending the string 'undefined'", async () => {
    const { api, transport } = makeClient();

    await api.getStats({ from: "2026-07-01", to: undefined });

    expect(urlOf(transport)).toBe(`${BASE_URL}/stats?from=2026-07-01`);
  });

  it("sends no query string when every param is absent", async () => {
    const { api, transport } = makeClient();

    await api.getStats();

    expect(urlOf(transport)).toBe(`${BASE_URL}/stats`);
  });

  it("percent-encodes path parameters", async () => {
    const { api, transport } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { suggestion: {} })),
    });

    await api.updateSuggestion("id/with slash", { status: "dismissed" });

    expect(urlOf(transport)).toBe(`${BASE_URL}/suggestions/id%2Fwith%20slash`);
  });

  it("serialises a JSON body and sets Content-Type only when there is one", async () => {
    const { api, transport } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { transaction: {} })),
    });

    await api.createTransaction({ amountCents: 1250, currency: "EUR", categoryId: "cat-1" });

    expect(initOf(transport).body).toBe(
      JSON.stringify({ amountCents: 1250, currency: "EUR", categoryId: "cat-1" }),
    );
    expect(headersOf(transport)["Content-Type"]).toBe("application/json");
  });

  it("sets no Content-Type on a request with no body", async () => {
    const { api, transport } = makeClient();

    await api.getCategories();

    expect(headersOf(transport)).not.toHaveProperty("Content-Type");
  });
});

describe("the error envelope", () => {
  it("becomes a typed ApiError carrying the backend's code", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(409, { error: { code: "MIXED_CURRENCY", message: "Ledger mixes EUR and USD" } }),
        ),
    });

    const error = await api.getStats().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "MIXED_CURRENCY",
      message: "Ledger mixes EUR and USD",
    });
  });

  // The backend sends `details` so a form can render against the offending
  // field; collapsing them into one banner throws that away.
  it("preserves field-level validation details", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid request",
            details: [{ path: "amountCents", message: "Must be an integer" }],
          },
        }),
      ),
    });

    const error = (await api
      .createTransaction({ amountCents: 1, currency: "EUR", categoryId: "c" })
      .catch((e: unknown) => e)) as ApiError;

    expect(error.details).toEqual([{ path: "amountCents", message: "Must be an integer" }]);
  });

  // A proxy's HTML error page is not the backend's envelope, but its status is
  // still worth reporting rather than surfacing as a parse crash.
  it("still reports the status when the failing body is not the envelope", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("HTTP_502");
  });

  // `message` on an envelope-less failure is a synthesised internal
  // ("GET /categories failed with 502"). Showing it to a user puts a method and
  // a path where advice belongs.
  it("never puts the synthesised internal message in front of a user", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error.message).toContain("/categories");
    expect(error.userMessage).not.toContain("/categories");
    expect(error.userMessage).toBe("Something went wrong on our end. Please try again.");
  });

  it("shows the backend's own message when there is an envelope", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(409, { error: { code: "MIXED_CURRENCY", message: "Ledger mixes EUR and USD" } }),
        ),
    });

    const error = (await api.getStats().catch((e: unknown) => e)) as ApiError;

    expect(error.userMessage).toBe("Ledger mixes EUR and USD");
  });
});

describe("a 401", () => {
  it("clears the session and still rejects the caller", async () => {
    const { api, onUnauthorized } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "No token" } })),
    });

    const error = await api.getProfile().catch((e: unknown) => e);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("does not run the session teardown on other failures", async () => {
    const { api, onUnauthorized } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(404, { error: { code: "NOT_FOUND", message: "No profile" } })),
    });

    await api.getProfile().catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("surfaces the 401 even if clearing the session throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "No token" } })),
      onUnauthorized: () => {
        throw new Error("signOut failed");
      },
    });

    const error = (await api.getProfile().catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(401);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("a 429 from the LLM-backed refresh routes", () => {
  // Both refresh routes share one per-user budget. "Something went wrong" tells
  // the user to retry immediately, which is the one thing that cannot work.
  it("parses Retry-After and names the wait in the user-facing message", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          429,
          { error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } },
          { "Retry-After": "120" },
        ),
      ),
    });

    const error = (await api.refreshProfile().catch((e: unknown) => e)) as ApiError;

    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.userMessage).toContain("2 minutes");
    expect(error.userMessage).not.toBe("Rate limit exceeded");
  });

  it("applies the same handling to the suggestions refresh", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          429,
          { error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } },
          { "Retry-After": "45" },
        ),
      ),
    });

    const error = (await api.refreshSuggestions().catch((e: unknown) => e)) as ApiError;

    expect(error.retryAfterSeconds).toBe(45);
    expect(error.userMessage).toContain("45 seconds");
  });

  // A gateway's 429 never carries the backend's RATE_LIMITED envelope, but it
  // is still a rate limit and the user still needs the wait.
  it("is recognised by status even when the body is not the backend envelope", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("<html>429 Too Many Requests</html>", {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
        ),
    });

    const error = (await api.refreshProfile().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("HTTP_429");
    expect(error.isRateLimited).toBe(true);
    expect(error.userMessage).toContain("1 minute");
    expect(error.userMessage).not.toContain("/profile/refresh");
  });

  it("still gives an actionable message when Retry-After is missing", async () => {
    const { api } = makeClient({
      transport: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(429, { error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } }),
        ),
    });

    const error = (await api.refreshProfile().catch((e: unknown) => e)) as ApiError;

    expect(error.retryAfterSeconds).toBeUndefined();
    expect(error.userMessage).toContain("Try again");
  });
});

describe("parseRetryAfter", () => {
  it("reads the delta-seconds form", () => {
    expect(parseRetryAfter("30")).toBe(30);
  });

  // RFC 9110 allows an HTTP-date, and it does turn up in the wild — assuming the
  // numeric form would silently drop the wait and produce a vague message.
  it("reads the HTTP-date form relative to now", () => {
    const now = Date.parse("2026-07-20T12:00:00Z");
    expect(parseRetryAfter("Mon, 20 Jul 2026 12:01:30 GMT", now)).toBe(90);
  });

  it("clamps a date already in the past to zero", () => {
    const now = Date.parse("2026-07-20T12:00:00Z");
    expect(parseRetryAfter("Mon, 20 Jul 2026 11:59:00 GMT", now)).toBe(0);
  });

  it("returns undefined for an absent or unparseable header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("uses whole units and singular forms", () => {
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(45)).toBe("45 seconds");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(90)).toBe("2 minutes");
    expect(formatDuration(3600)).toBe("1 hour");
  });
});

describe("transport failures", () => {
  it("reports a timeout as a timeout, not as a generic network error", async () => {
    const hanging = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const { api } = makeClient({ transport: hanging, timeoutMs: 10 });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe(CLIENT_TIMEOUT);
    expect(error.userMessage).toContain("took too long");
  });

  it("reports an unreachable API as a network error", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe(CLIENT_NETWORK);
    expect(error.status).toBeNull();
  });

  // An unmounted component cancelling its own request is not a failure to
  // report, so it must not be dressed up as one.
  it("rethrows a caller-initiated abort as itself", async () => {
    const controller = new AbortController();
    const hanging = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted by caller")));
        }),
    );
    const { api } = makeClient({ transport: hanging });

    const pending = api.getCategories(controller.signal).catch((e: unknown) => e);
    // Let the request reach the transport before cancelling it.
    await Promise.resolve();
    controller.abort();
    const error = await pending;

    expect(error).not.toBeInstanceOf(ApiError);
  });

  // Resolving the access token is itself an await, so a caller that aborts in
  // that window would previously find nothing listening: the request went out
  // anyway and only the timeout could end it.
  it("never reaches the transport when the caller aborts while the token resolves", async () => {
    const controller = new AbortController();
    const transport = vi.fn<typeof fetch>();
    const { api } = makeClient({
      transport,
      getAccessToken: async () => {
        controller.abort();
        return "test-access-token";
      },
    });

    const error = await api.getCategories(controller.signal).catch((e: unknown) => e);

    expect(transport).not.toHaveBeenCalled();
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("reports a timeout that fires while the token resolves", async () => {
    const transport = vi.fn<typeof fetch>();
    const { api } = makeClient({
      transport,
      timeoutMs: 5,
      getAccessToken: () => new Promise((resolve) => setTimeout(() => resolve("late"), 30)),
    });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(transport).not.toHaveBeenCalled();
    expect(error.code).toBe(CLIENT_TIMEOUT);
  });

  // `fetch` resolves as soon as the headers arrive. A server that then stalls
  // the body used to hang the caller forever: the timer had already been
  // cleared by the time `response.text()` was awaited.
  it("times out a response whose headers arrive but whose body never completes", async () => {
    // Headers resolve immediately; the body never completes. Wired to the
    // request signal the way a real `fetch` body is, so that aborting the
    // controller is what ends it — which is the behaviour under test.
    const stalling = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const { api } = makeClient({ transport: stalling, timeoutMs: 20 });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(CLIENT_TIMEOUT);
  });

  it("rejects an OK response whose body is not JSON", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 })),
    });

    const error = (await api.getCategories().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe(CLIENT_MALFORMED);
  });
});

describe("an unreadable session", () => {
  // "Could not read the session" is not "there is no session". Downgrading it
  // to an anonymous request earns a 401, and the 401 path would then sign out a
  // user whose session was merely unreadable for a moment.
  it("fails the request instead of going out anonymously", async () => {
    const transport = vi.fn<typeof fetch>();
    const { api, onUnauthorized } = makeClient({
      transport,
      getAccessToken: async () => {
        throw new ApiError({
          status: null,
          code: "CLIENT_NO_SESSION",
          message: "Could not read the current session",
        });
      },
    });

    const error = (await api.getProfile().catch((e: unknown) => e)) as ApiError;

    expect(transport).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(error.code).toBe("CLIENT_NO_SESSION");
    expect(error.userMessage).toContain("could not confirm your session");
  });
});

describe("empty responses", () => {
  it("resolves a 204 rather than failing to parse an empty body", async () => {
    const { api } = makeClient({
      transport: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })),
    });

    await expect(api.deleteTransaction("txn-1")).resolves.toBeUndefined();
  });
});
