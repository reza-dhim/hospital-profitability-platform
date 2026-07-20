import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestFile, ApiRequestError, configureApiClient } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("apiRequest", () => {
  let getAccessToken: ReturnType<typeof vi.fn<() => string | null>>;
  let setAccessToken: ReturnType<typeof vi.fn<(token: string | null) => void>>;
  let onUnauthenticated: ReturnType<typeof vi.fn<() => void>>;
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    getAccessToken = vi.fn(() => "access-token-1");
    setAccessToken = vi.fn();
    onUnauthenticated = vi.fn();
    configureApiClient({ getAccessToken, setAccessToken, onUnauthenticated });
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("sends the Bearer token, credentials:include, and JSON body on a successful request", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { id: "run-1" }));

    const result = await apiRequest<{ id: string }>("/allocation-runs", { method: "POST", body: { periodId: "p-1" } });

    expect(result).toEqual({ id: "run-1" });
    const call = mockFetch.mock.calls[0]!;
    const [url, init] = call as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://localhost:3001/api/v1/allocation-runs");
    expect(init.credentials).toBe("include");
    expect(init.headers.Authorization).toBe("Bearer access-token-1");
    expect(init.body).toBe(JSON.stringify({ periodId: "p-1" }));
  });

  it("sends a FormData body as-is, without a Content-Type header, so the browser sets the multipart boundary", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { id: "batch-1" }));
    const form = new FormData();
    form.append("periodId", "p-1");
    form.append("file", new Blob(["data"]), "cost.xlsx");

    await apiRequest("/uploads/cost", { method: "POST", body: form });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.body).toBe(form);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer access-token-1");
  });

  it("serializes query params, omitting undefined values", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [] }));

    await apiRequest("/profitability/profit-centers", { query: { periodId: "p-1", allocationRunId: undefined } });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:3001/api/v1/profitability/profit-centers?periodId=p-1");
  });

  it("returns undefined for a 204 No Content response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiRequest("/auth/logout", { method: "POST" });

    expect(result).toBeUndefined();
  });

  it("throws ApiRequestError with the parsed error envelope on a non-2xx response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(404, { error: { code: "NOT_FOUND", message: "Allocation run not found.", traceId: "trace-1" } })
    );

    const error = await apiRequest("/allocation-runs/missing").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).code).toBe("NOT_FOUND");
    expect((error as ApiRequestError).message).toBe("Allocation run not found.");
  });

  it("falls back to a generic error when the response body isn't the expected envelope", async () => {
    mockFetch.mockResolvedValue(new Response("not json", { status: 500 }));

    const error = await apiRequest("/anything").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("UNKNOWN");
  });

  it("on a 401, refreshes the access token and retries the request once, succeeding", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "AUTH_REQUIRED", message: "Expired.", traceId: "t" } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-token-2", expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "run-1" }));

    const result = await apiRequest<{ id: string }>("/allocation-runs/run-1");

    expect(result).toEqual({ id: "run-1" });
    expect(setAccessToken).toHaveBeenCalledWith("access-token-2");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1]![0]).toBe("http://localhost:3001/api/v1/auth/refresh");
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("calls onUnauthenticated when the refresh itself fails, and surfaces the original 401", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "AUTH_REQUIRED", message: "Expired.", traceId: "t" } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    const error = await apiRequest("/allocation-runs/run-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(401);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(setAccessToken).not.toHaveBeenCalled();
  });

  it("does not retry a second time if the retried request 401s again", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "AUTH_REQUIRED", message: "Expired.", traceId: "t" } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-token-2", expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "AUTH_REQUIRED", message: "Still invalid.", traceId: "t2" } }));

    const error = await apiRequest("/allocation-runs/run-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent refreshes: two simultaneous 401s trigger only one POST /auth/refresh", async () => {
    let currentToken = "access-token-1";
    getAccessToken.mockImplementation(() => currentToken);
    setAccessToken.mockImplementation((token) => {
      currentToken = token ?? "";
    });

    let refreshCallCount = 0;
    mockFetch.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCallCount += 1;
        return Promise.resolve(jsonResponse(200, { accessToken: "access-token-2", expiresIn: 900 }));
      }
      // /a or /b: 401 until the token has actually rotated, then succeed.
      return Promise.resolve(jsonResponse(currentToken === "access-token-2" ? 200 : 401, { data: url }));
    });

    const [resultA, resultB] = await Promise.all([apiRequest("/a"), apiRequest("/b")]);

    expect(refreshCallCount).toBe(1);
    expect(resultA).toBeDefined();
    expect(resultB).toBeDefined();
  });
});

describe("apiRequestFile", () => {
  let getAccessToken: ReturnType<typeof vi.fn<() => string | null>>;
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    getAccessToken = vi.fn(() => "access-token-1");
    configureApiClient({ getAccessToken, setAccessToken: vi.fn(), onUnauthenticated: vi.fn() });
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("returns the response body as a Blob and reads the filename from Content-Disposition", async () => {
    mockFetch.mockResolvedValue(
      new Response("xlsx bytes", {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="cost-template.xlsx"' },
      })
    );

    const result = await apiRequestFile("/templates/cost/download", "fallback.xlsx");

    expect(result.fileName).toBe("cost-template.xlsx");
    expect(await result.blob.text()).toBe("xlsx bytes");
  });

  it("falls back to the given filename when Content-Disposition is missing", async () => {
    mockFetch.mockResolvedValue(new Response(new Blob(["data"]), { status: 200 }));

    const result = await apiRequestFile("/templates/cost/download", "fallback.xlsx");

    expect(result.fileName).toBe("fallback.xlsx");
  });

  it("throws ApiRequestError on a non-2xx response instead of returning a blob", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "No template.", traceId: "t" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    const error = await apiRequestFile("/templates/cost/download", "fallback.xlsx").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("NOT_FOUND");
  });
});
