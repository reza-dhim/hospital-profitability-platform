/**
 * Thin typed fetch wrapper (docs/28_OPENAPI_STRATEGY.md §2) — the single
 * place every API call goes through. Request/response types come from
 * `@hpp/contracts`' generated OpenAPI spec, never hand-declared.
 *
 * Auth (docs/05_AUTHENTICATION.md §1): the access token lives in memory,
 * handed to this module by `AuthProvider` (Sprint "Dashboard Executive"
 * sub-task 2) via `configureApiClient()` — this module never touches
 * localStorage/sessionStorage. The refresh token is an httpOnly cookie the
 * browser sends automatically (`credentials: "include"`); this module never
 * reads or stores it directly.
 *
 * Refresh strategy: reactive, not proactive (confirmed design decision) —
 * on a 401, call `POST /auth/refresh` and retry the original request once.
 * Concurrent 401s (e.g. a dashboard firing several widget requests at once)
 * share a single in-flight refresh call instead of each independently
 * hitting `/auth/refresh` — the refresh token rotates on every use, so
 * parallel independent refresh calls would race and spuriously invalidate
 * each other.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_PREFIX = "/api/v1";

export interface ApiErrorBody {
  code: string;
  message: string;
  traceId: string;
}

/** Thrown for any non-2xx response, per the docs/17_ERROR_HANDLING.md §1 envelope. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body.code;
    this.traceId = body.traceId;
  }
}

type AccessTokenGetter = () => string | null;
type AccessTokenSetter = (token: string | null) => void;
type UnauthenticatedHandler = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let setAccessTokenInternal: AccessTokenSetter = () => {};
let onUnauthenticated: UnauthenticatedHandler = () => {};

/** Called once by `AuthProvider` to wire this module to the auth Context's in-memory token store. */
export function configureApiClient(config: {
  getAccessToken: AccessTokenGetter;
  setAccessToken: AccessTokenSetter;
  onUnauthenticated: UnauthenticatedHandler;
}): void {
  getAccessToken = config.getAccessToken;
  setAccessTokenInternal = config.setAccessToken;
  onUnauthenticated = config.onUnauthenticated;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Internal — prevents an infinite retry loop when the retried request itself 401s again. */
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${API_PREFIX}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const parsed = (await response.json()) as { error?: ApiErrorBody };
    if (parsed.error) return parsed.error;
  } catch {
    // Body wasn't the expected JSON envelope — fall through to the generic error below.
  }
  return { code: "UNKNOWN", message: "An unexpected error occurred.", traceId: "" };
}

async function rawRequest(path: string, options: ApiRequestOptions): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  // A FormData body's multipart boundary is set by the browser only if
  // Content-Type is left unset — declaring it here (even to the "right"
  // value) drops the boundary param and breaks server-side multipart parsing.
  if (!isFormData) headers["Content-Type"] = "application/json";
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
  });
}

let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include" });
      if (!response.ok) return false;
      const body = (await response.json()) as { accessToken: string; expiresIn: number };
      setAccessTokenInternal(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function requestWithAuthRetry(path: string, options: ApiRequestOptions): Promise<Response> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await rawRequest(path, { ...options, skipAuthRetry: true });
    }
  }

  if (response.status === 401) {
    onUnauthenticated();
  }

  return response;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await requestWithAuthRetry(path, options);

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiRequestError(response.status, error);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

function fileNameFromContentDisposition(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition");
  const match = disposition ? /filename="?([^";]+)"?/.exec(disposition) : null;
  return match?.[1] ?? fallback;
}

/** For binary responses (e.g. `GET /templates/:type/download`) — same auth/refresh handling as `apiRequest`, but reads the body as a `Blob` instead of JSON. */
export async function apiRequestFile(
  path: string,
  fallbackFileName: string,
  options: ApiRequestOptions = {}
): Promise<DownloadedFile> {
  const response = await requestWithAuthRetry(path, options);

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiRequestError(response.status, error);
  }

  const blob = await response.blob();
  return { blob, fileName: fileNameFromContentDisposition(response, fallbackFileName) };
}
