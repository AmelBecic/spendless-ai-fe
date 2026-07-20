// The one place in this client that reaches the network.
//
// Client invariant 3 (CLAUDE.md): no component calls `fetch`. Everything goes
// through here, because this is where three things happen that a bare `fetch`
// at a call site would silently skip:
//
//   1. the Supabase access token is attached,
//   2. the backend's `{ error: { code, message } }` envelope becomes a typed
//      `ApiError` that components branch on by `code`, never by message text,
//   3. a 401 clears the session and sends the user to /login.
//
// Every response type is imported from `contract.ts` — invariant 4 puts the
// wire types there and nowhere else, so none are declared in this file.

import type {
  CategoriesResponse,
  CreateFixedExpenseBody,
  CreateTransactionBody,
  FieldError,
  FixedExpenseResponse,
  FixedExpensesResponse,
  ListFixedExpensesQuery,
  ListSuggestionsQuery,
  ListTransactionsQuery,
  ProfileResponse,
  StatsQuery,
  StatsResponse,
  SuggestionResponse,
  SuggestionsResponse,
  TransactionResponse,
  TransactionsResponse,
  UpdateFixedExpenseBody,
  UpdateSuggestionBody,
  UpdateTransactionBody,
} from "./contract";
import { getSupabase } from "../auth/supabase";

/** Where /login lives. Exported so the auth layer cannot drift from the redirect below. */
export const LOGIN_PATH = "/login";

/** No request may hang the UI forever. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Codes this client originates itself, for failures that never produced a
 * backend envelope. `ErrorCode` in `contract.ts` documents the server's set as
 * open, so components branch across both the same way — on `code`.
 */
export const CLIENT_TIMEOUT = "CLIENT_TIMEOUT";
export const CLIENT_NETWORK = "CLIENT_NETWORK";
export const CLIENT_MALFORMED = "CLIENT_MALFORMED_RESPONSE";

/**
 * A failed request, with the backend envelope already parsed.
 *
 * `message` stays the backend's own text. `userMessage` is what a component
 * should render — for a 429 it names the actual wait, which is the whole point
 * of the rate-limit path: "something went wrong" tells the user to retry now,
 * which is the one thing that cannot work.
 */
export class ApiError extends Error {
  /** HTTP status, or `null` when no response was ever received. */
  readonly status: number | null;
  readonly code: string;
  /** Present on `VALIDATION_FAILED` — one entry per offending field. */
  readonly details?: FieldError[];
  /** Seconds to wait, parsed from `Retry-After` on a 429. */
  readonly retryAfterSeconds?: number;
  readonly userMessage: string;

  constructor(init: {
    status: number | null;
    code: string;
    message: string;
    details?: FieldError[];
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.userMessage = buildUserMessage(init.code, init.message, init.retryAfterSeconds);
  }

  /** True when the failure is the shared per-user LLM refresh budget. */
  get isRateLimited(): boolean {
    return this.status === 429 || this.code === "RATE_LIMITED";
  }
}

function buildUserMessage(code: string, message: string, retryAfterSeconds?: number): string {
  if (code === "RATE_LIMITED") {
    // Both refresh routes are LLM-backed and share one per-user budget, so the
    // wait is the actionable part — surface it rather than a generic failure.
    const wait =
      retryAfterSeconds === undefined
        ? "in a little while"
        : `in ${formatDuration(retryAfterSeconds)}`;
    return `You have used up your refresh budget. Try again ${wait}.`;
  }
  if (code === CLIENT_TIMEOUT) return "The request took too long. Check your connection and retry.";
  if (code === CLIENT_NETWORK) return "Could not reach SpendLess. Check your connection and retry.";
  return message;
}

/** "45 seconds", "2 minutes", "1 hour" — whole units, for a wait the user reads. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  if (safe < 60) return `${safe} second${safe === 1 ? "" : "s"}`;
  const minutes = Math.ceil(safe / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). Both appear
 * in the wild, so handle both rather than assuming the numeric form.
 */
export function parseRetryAfter(raw: string | null, now: number = Date.now()): number | undefined {
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** Narrow an unknown JSON body to the backend's error envelope. */
function readErrorEnvelope(
  body: unknown,
): { code: string; message: string; details?: FieldError[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const { error } = body as { error?: unknown };
  if (typeof error !== "object" || error === null) return null;

  const { code, message, details } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  if (typeof code !== "string" || typeof message !== "string") return null;

  return {
    code,
    message,
    details: Array.isArray(details) ? (details as FieldError[]) : undefined,
  };
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  /** Undefined entries are dropped rather than sent as the string "undefined". */
  params?: Record<string, QueryValue>;
  json?: unknown;
  /** Caller-side cancellation, combined with this client's own timeout. */
  signal?: AbortSignal;
}

/**
 * The seams the test suite replaces. Nothing here touches a live Supabase or a
 * live backend when they are stubbed, which is what lets the suite run offline.
 */
export interface ApiClientDeps {
  baseUrl: string;
  transport: typeof fetch;
  /** Resolves the current access token, refreshing it if needed. */
  getAccessToken: () => Promise<string | null>;
  /** Runs on a 401 — clears the session and sends the user to login. */
  onUnauthorized: () => void | Promise<void>;
  timeoutMs: number;
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, QueryValue>): string {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Builds the API surface over a set of injectable dependencies.
 *
 * Exported (rather than only the singleton below) so tests can drive the exact
 * same code path with a stubbed transport.
 */
export function createApiClient(deps: ApiClientDeps) {
  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    // Own timeout, plus the caller's cancellation if there is one. Tracked
    // separately from the caller's signal so a timeout can be reported as a
    // timeout rather than as an anonymous abort.
    //
    // Wired up BEFORE the token is awaited: resolving the token is itself an
    // await, so attaching the listener afterwards would miss a caller that
    // aborted in the meantime and leave the request running with nothing left
    // to cancel it but the timeout.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deps.timeoutMs);
    const forwardAbort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", forwardAbort, { once: true });

    const timeoutError = (cause?: unknown) =>
      new ApiError({
        status: null,
        code: CLIENT_TIMEOUT,
        message: `${method} ${path} timed out after ${deps.timeoutMs}ms`,
        cause,
      });

    let response: Response;
    try {
      const token = await deps.getAccessToken();

      // Cancelled while the token was resolving — don't put the request on the
      // wire at all.
      if (controller.signal.aborted) {
        throw timedOut ? timeoutError() : (options.signal?.reason ?? new Error("Request aborted"));
      }

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (options.json !== undefined) headers["Content-Type"] = "application/json";

      response = await deps.transport(buildUrl(deps.baseUrl, path, options.params), {
        method,
        headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json),
        signal: controller.signal,
      });
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (timedOut) throw timeoutError(cause);
      // A caller-initiated abort is not a failure to report — let it through as
      // itself so an unmounted component's cancelled request stays quiet.
      if (options.signal?.aborted) throw cause;
      throw new ApiError({
        status: null,
        code: CLIENT_NETWORK,
        message: `${method} ${path} could not reach the API`,
        cause,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", forwardAbort);
    }

    // 204, and any empty body, carry nothing to parse.
    const text = await response.text();
    let payload: unknown = undefined;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        if (response.ok) {
          throw new ApiError({
            status: response.status,
            code: CLIENT_MALFORMED,
            message: `${method} ${path} returned a non-JSON body`,
            cause,
          });
        }
        // A failing response with an unparseable body (a proxy's HTML error
        // page, say) still has a status worth reporting.
        payload = undefined;
      }
    }

    if (response.ok) return payload as T;

    if (response.status === 401) {
      try {
        await deps.onUnauthorized();
      } catch (cause) {
        // Never swallow it — the session teardown failing is worth seeing, but
        // it must not replace the 401 the caller is waiting on.
        console.error("Failed to clear the session after a 401", cause);
      }
    }

    const envelope = readErrorEnvelope(payload);
    const retryAfterSeconds =
      response.status === 429 ? parseRetryAfter(response.headers.get("Retry-After")) : undefined;

    throw new ApiError({
      status: response.status,
      code: envelope?.code ?? `HTTP_${response.status}`,
      message: envelope?.message ?? `${method} ${path} failed with ${response.status}`,
      details: envelope?.details,
      retryAfterSeconds,
    });
  }

  return {
    request,

    health: () => request<{ status: string }>("GET", "/health"),

    getCategories: (signal?: AbortSignal) =>
      request<CategoriesResponse>("GET", "/categories", { signal }),

    getStats: (params: StatsQuery = {}, signal?: AbortSignal) =>
      request<StatsResponse>("GET", "/stats", { params: { ...params }, signal }),

    getProfile: (signal?: AbortSignal) => request<ProfileResponse>("GET", "/profile", { signal }),

    /** LLM-backed — shares the per-user rate budget with `refreshSuggestions`. */
    refreshProfile: (signal?: AbortSignal) =>
      request<ProfileResponse>("POST", "/profile/refresh", { signal }),

    getSuggestions: (params: ListSuggestionsQuery = {}, signal?: AbortSignal) =>
      request<SuggestionsResponse>("GET", "/suggestions", { params: { ...params }, signal }),

    updateSuggestion: (id: string, body: UpdateSuggestionBody, signal?: AbortSignal) =>
      request<SuggestionResponse>("PATCH", `/suggestions/${encodeURIComponent(id)}`, {
        json: body,
        signal,
      }),

    /** LLM-backed — shares the per-user rate budget with `refreshProfile`. */
    refreshSuggestions: (signal?: AbortSignal) =>
      request<SuggestionsResponse>("POST", "/suggestions/refresh", { signal }),

    listTransactions: (params: ListTransactionsQuery = {}, signal?: AbortSignal) =>
      request<TransactionsResponse>("GET", "/transactions", { params: { ...params }, signal }),

    createTransaction: (body: CreateTransactionBody, signal?: AbortSignal) =>
      request<TransactionResponse>("POST", "/transactions", { json: body, signal }),

    updateTransaction: (id: string, body: UpdateTransactionBody, signal?: AbortSignal) =>
      request<TransactionResponse>("PATCH", `/transactions/${encodeURIComponent(id)}`, {
        json: body,
        signal,
      }),

    deleteTransaction: (id: string, signal?: AbortSignal) =>
      request<void>("DELETE", `/transactions/${encodeURIComponent(id)}`, { signal }),

    listFixedExpenses: (params: ListFixedExpensesQuery = {}, signal?: AbortSignal) =>
      request<FixedExpensesResponse>("GET", "/fixed-expenses", { params: { ...params }, signal }),

    createFixedExpense: (body: CreateFixedExpenseBody, signal?: AbortSignal) =>
      request<FixedExpenseResponse>("POST", "/fixed-expenses", { json: body, signal }),

    updateFixedExpense: (id: string, body: UpdateFixedExpenseBody, signal?: AbortSignal) =>
      request<FixedExpenseResponse>("PATCH", `/fixed-expenses/${encodeURIComponent(id)}`, {
        json: body,
        signal,
      }),

    /** Soft deactivate — the backend returns the updated row, not a 204. */
    deleteFixedExpense: (id: string, signal?: AbortSignal) =>
      request<FixedExpenseResponse>("DELETE", `/fixed-expenses/${encodeURIComponent(id)}`, {
        signal,
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Token refresh lives here rather than at each call site: `getSession()` returns
 * the current session and refreshes it when it has expired, so a caller never
 * has to think about token lifetime.
 */
async function getAccessTokenFromSupabase(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    console.error("Could not read the Supabase session", error);
    return null;
  }
  return data.session?.access_token ?? null;
}

async function clearSessionAndRedirect(): Promise<void> {
  // `local` scope: the token the backend just rejected is not worth spending a
  // round trip to revoke globally, and the user needs to be at /login either way.
  await getSupabase().auth.signOut({ scope: "local" });

  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH);
  }
}

/** The app-wide client. Components import this; they never construct their own. */
export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
  transport: (...args) => fetch(...args),
  getAccessToken: getAccessTokenFromSupabase,
  onUnauthorized: clearSessionAndRedirect,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});
