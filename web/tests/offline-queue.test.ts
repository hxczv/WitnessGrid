import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { flushQueue, type FlushApi, type QueuedSubmission, type SubmissionQueue } from "@/lib/offline-queue";

function fakeQueue(): SubmissionQueue {
  const items: QueuedSubmission[] = [];
  return {
    enqueue: vi.fn(async (item) => {
      items.push(item);
    }),
    getAll: vi.fn(async () => [...items]),
    remove: vi.fn(async (clientId) => {
      const idx = items.findIndex((x) => x.client_id === clientId);
      if (idx >= 0) items.splice(idx, 1);
    }),
    count: vi.fn(async () => items.length),
  };
}

function sampleSubmission(clientId: string): QueuedSubmission {
  return {
    client_id: clientId,
    incident: {
      incident_type: "stop_and_search",
      police_force: "metropolitan",
      timestamp: "2026-08-03T14:32:07.000Z",
      location: { lon: -0.1278, lat: 51.5074 },
      location_accuracy_m: 5,
      description: "e2e fixture",
    },
    media: [
      {
        blob: new Blob(["fake-bytes"], { type: "image/jpeg" }),
        type: "image/jpeg",
        hash: "b".repeat(64),
        thumbnail_blob: null,
      },
    ],
    created_at: Date.now(),
  };
}

function fakeApi(overrides: Partial<FlushApi> = {}): FlushApi {
  return {
    upload: vi.fn(async (req) => ({
      key: `media/bb/${req.filename}`,
      upload_url: "http://media.test/upload",
      headers: { "content-type": req.contentType },
    })),
    putBlob: vi.fn(async () => undefined),
    createIncident: vi.fn(async () => ({ id: "incident-id" }) as never),
    ...overrides,
  };
}

describe("flushQueue", () => {
  it("uploads media then creates the incident, in FIFO order", async () => {
    const queue = fakeQueue();
    await queue.enqueue(sampleSubmission("11111111-1111-4111-8111-111111111111"));
    await queue.enqueue(sampleSubmission("22222222-2222-4222-8222-222222222222"));
    const api = fakeApi();

    const result = await flushQueue(queue, api, "token");

    expect(result.submitted).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
    expect(result.retried).toHaveLength(0);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.createIncident).toHaveBeenCalledTimes(2);
    const first = (api.createIncident as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(first.client_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(first.media[0]).toMatchObject({
      type: "image/jpeg",
      hash: "b".repeat(64),
    });
    expect(await queue.count()).toBe(0);
  });

  it("drops rows the server already holds (conflict)", async () => {
    const queue = fakeQueue();
    const clientId = "33333333-3333-4333-8333-333333333333";
    await queue.enqueue(sampleSubmission(clientId));
    const api = fakeApi({
      createIncident: vi.fn(async () => Promise.reject(new ApiClientError(409, "conflict", "duplicate"))),
    });

    const result = await flushQueue(queue, api, "token");

    expect(result.dropped).toEqual([clientId]);
    expect(await queue.count()).toBe(0);
  });

  it("keeps rows that hit network errors for retry", async () => {
    const queue = fakeQueue();
    const clientId = "44444444-4444-4444-8444-444444444444";
    await queue.enqueue(sampleSubmission(clientId));
    const api = fakeApi({
      upload: vi.fn(async () => Promise.reject(new ApiClientError(0, "network_error", "offline"))),
    });

    const result = await flushQueue(queue, api, "token");

    expect(result.retried).toEqual([clientId]);
    expect(result.submitted).toHaveLength(0);
    expect(await queue.count()).toBe(1);
  });

  it("keeps rows on auth failure so they flush after sign-in", async () => {
    const queue = fakeQueue();
    const clientId = "55555555-5555-4555-8555-555555555555";
    await queue.enqueue(sampleSubmission(clientId));
    const api = fakeApi({
      upload: vi.fn(async () => Promise.reject(new ApiClientError(401, "unauthorized", "sign in again"))),
    });

    const result = await flushQueue(queue, api, "token");

    // Not dropped: anonymous drafts wait in the queue until a session exists.
    expect(result.retried).toEqual([clientId]);
    expect(await queue.count()).toBe(1);
  });
});