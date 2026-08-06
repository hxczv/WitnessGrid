import { openDB } from "idb";
import { isApiError } from "@/lib/api";
import { extFor } from "@/lib/media";
import type {
  Incident,
  IncidentCreate,
  MediaReference,
  MediaType,
  UploadRequest,
  UploadResponse,
} from "@/lib/contract";

/**
 * A full submission waiting to be flushed: incident fields (media refs are
 * produced during the flush) plus the media blobs, hashes and thumbnails.
 * Media blobs are stored in IndexedDB alongside the payload.
 */
export interface QueuedMedia {
  blob: Blob;
  type: MediaType;
  hash: string;
  thumbnail_blob: Blob | null;
}

export interface QueuedSubmission {
  client_id: string;
  incident: Omit<IncidentCreate, "media" | "client_id">;
  media: QueuedMedia[];
  created_at: number;
}

export interface SubmissionQueue {
  enqueue(item: QueuedSubmission): Promise<void>;
  getAll(): Promise<QueuedSubmission[]>;
  remove(clientId: string): Promise<void>;
  count(): Promise<number>;
}

const DB_NAME = "witnessgrid";
const STORE = "submissions";

/** idb-backed submission queue. Blobs are structured-cloneable in IndexedDB. */
export function createSubmissionQueue(): SubmissionQueue {
  const dbp = openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_id" });
      }
    },
  });
  return {
    async enqueue(item) {
      const db = await dbp;
      await db.put(STORE, item);
    },
    async getAll() {
      const db = await dbp;
      const items = await db.getAll(STORE);
      return items.sort((a, b) => a.created_at - b.created_at);
    },
    async remove(clientId) {
      const db = await dbp;
      await db.delete(STORE, clientId);
    },
    async count() {
      const db = await dbp;
      return db.count(STORE);
    },
  };
}

export interface FlushApi {
  upload(req: UploadRequest, token: string | null): Promise<UploadResponse>;
  putBlob(upload: UploadResponse, blob: Blob): Promise<void>;
  createIncident(incident: IncidentCreate, token: string | null): Promise<Incident>;
}

export interface FlushResult {
  /** client_ids submitted and removed from the queue. */
  submitted: string[];
  /** client_ids dropped because the server already holds them (CONFLICT). */
  dropped: string[];
  /** client_ids kept for retry (network/storage/auth issues). */
  retried: string[];
}

type Outcome = "submitted" | "dropped" | "retried";

async function flushOne(
  item: QueuedSubmission,
  api: FlushApi,
  token: string | null,
): Promise<Outcome> {
  try {
    const refs: MediaReference[] = [];
    for (const m of item.media) {
      const upload = await api.upload(
        { filename: `${m.hash}.${extFor(m.type)}`, contentType: m.type },
        token,
      );
      await api.putBlob(upload, m.blob);
      let thumbnail_key: string | null = null;
      if (m.thumbnail_blob) {
        const thumbUpload = await api.upload(
          { filename: `${m.hash}.thumb.jpg`, contentType: "image/jpeg" },
          token,
        );
        await api.putBlob(thumbUpload, m.thumbnail_blob);
        thumbnail_key = thumbUpload.key;
      }
      refs.push({ key: upload.key, type: m.type, hash: m.hash, thumbnail_key });
    }
    await api.createIncident({ ...item.incident, media: refs, client_id: item.client_id }, token);
    return "submitted";
  } catch (err) {
    if (isApiError(err) && err.code === "conflict") return "dropped";
    return "retried";
  }
}

/**
 * Flush the queue in FIFO order: for each item upload its media (original +
 * thumbnail), then create the incident with the client_id idempotency key.
 * Pure of IndexedDB/browser concerns — callers inject the queue + api.
 */
export async function flushQueue(
  queue: SubmissionQueue,
  api: FlushApi,
  token: string | null = null,
): Promise<FlushResult> {
  const items = await queue.getAll();
  const result: FlushResult = { submitted: [], dropped: [], retried: [] };
  for (const item of items) {
    const outcome = await flushOne(item, api, token);
    if (outcome === "submitted") {
      result.submitted.push(item.client_id);
      await queue.remove(item.client_id);
    } else if (outcome === "dropped") {
      result.dropped.push(item.client_id);
      await queue.remove(item.client_id);
    } else {
      result.retried.push(item.client_id);
    }
  }
  return result;
}
