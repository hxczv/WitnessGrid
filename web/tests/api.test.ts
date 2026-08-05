import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  apiPatch,
  buildQuery,
  deleteAccount,
  getIncident,
  isApiError,
  listIncidents,
  rateIncident,
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

describe("apiPatch", () => {
  it("issues a PATCH with a JSON body", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPatch("/ratings/abc", { appropriateness: 4 });
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toContain("/ratings/abc");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ appropriateness: 4 });
  });
});

describe("rateIncident", () => {
  it("parses the incident + summary response", async () => {
    const summary = {
      incident_id: "6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f",
      count: 2,
      appropriateness_avg: 4,
      professionalism_avg: 3.5,
      safety_avg: 5,
      my: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ incident: null, summary }),
      })),
    );

    const result = await rateIncident("inc", { appropriateness: 4, professionalism: 3, safety: 5 });
    expect(result.summary.count).toBe(2);
    expect(result.incident).toBeNull();
  });

  it("throws on a malformed summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ incident: null, summary: { nope: true } }),
      })),
    );
    await expect(
      rateIncident("inc", { appropriateness: 4, professionalism: 3, safety: 5 }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe("getIncident", () => {
  const baseIncident = {
    id: "6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f",
    client_id: "6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2e",
    user_id: "6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2a",
    username: "witness",
    incident_type: "stop_and_search",
    police_force: "metropolitan",
    timestamp: "2026-01-02T03:04:05.000Z",
    description: "A stop in the park.",
    officer_count: 1,
    collar_numbers: [],
    created_at: "2026-01-02T03:04:05.000Z",
    view_count: 7,
    moderation_status: "approved",
    longitude: -0.12,
    latitude: 51.5,
    media: [
      {
        key: "media/a.jpeg",
        type: "image/jpeg",
        hash: "a".repeat(64),
        thumbnail_key: "media/a-thumb.jpeg",
      },
    ],
    location_accuracy_m: null,
  };

  it("passes through a rating_summary when present", async () => {
    const summary = {
      incident_id: "6e8f5e69-5a21-4f1e-9a2a-4b2b2c2d2e2f",
      count: 3,
      appropriateness_avg: 4,
      professionalism_avg: 3.5,
      safety_avg: 5,
      my: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...baseIncident, rating_summary: summary }),
      })),
    );

    const result = await getIncident("inc");
    expect(result.rating_summary?.count).toBe(3);
    expect(result.username).toBe("witness");
  });

  it("omits rating_summary when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => baseIncident,
      })),
    );

    const result = await getIncident("inc");
    expect(result.rating_summary).toBeUndefined();
  });
});

describe("deleteAccount", () => {
  it("calls DELETE /auth/me and attaches the token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteAccount({ token: "tok" });
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toContain("/auth/me");
    expect(init.method).toBe("DELETE");
    expect(init.headers.get("Authorization")).toBe("Bearer tok");
  });
});