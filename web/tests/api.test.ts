import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  buildQuery,
  isApiError,
  listIncidents,
} from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildQuery", () => {
  it("drops empty values and joins the rest", () => {
    expect(buildQuery({ limit: 25, cursor: "abc", startDate: null, endDate: undefined, type: "" })).toBe(
      "?limit=25&cursor=abc",
    );
  });

  it("returns an empty string when nothing to encode", () => {
    expect(buildQuery({})).toBe("");
  });
});

describe("ApiClientError", () => {
  it("flags retryable outcomes", () => {
    expect(new ApiClientError(0, "network_error", "n").retryable).toBe(true);
    expect(new ApiClientError(500, "storage_error", "n").retryable).toBe(true);
    expect(new ApiClientError(429, "rate_limited", "n").retryable).toBe(true);
    expect(new ApiClientError(401, "unauthorized", "n").retryable).toBe(true);
  });

  it("does not flag terminal outcomes", () => {
    expect(new ApiClientError(400, "validation", "n").retryable).toBe(false);
    expect(new ApiClientError(409, "conflict", "n").retryable).toBe(false);
    expect(new ApiClientError(404, "not_found", "n").retryable).toBe(false);
  });

  it("isApiError narrows correctly", () => {
    expect(isApiError(new ApiClientError(429, "rate_limited", "n"))).toBe(true);
    expect(isApiError(new Error("plain"))).toBe(false);
  });
});

describe("listIncidents", () => {
  it("parses a successful payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], next_cursor: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listIncidents({ limit: 25 });
    expect(result).toEqual({ items: [], next_cursor: null });
    const url = String((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(url).toContain("/incidents?limit=25");
  });

  it("maps an error payload to ApiClientError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { code: "rate_limited", message: "slow down" } }),
      })),
    );

    await expect(listIncidents({})).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });

  it("surfaces network failures as status-0 errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(listIncidents({})).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});