import { apiPost, apiUpload } from "@/lib/api";
import {
  createSubmissionQueue,
  flushQueue,
  type FlushApi,
  type SubmissionQueue,
} from "@/lib/offline-queue";
import type { Incident, IncidentCreate, UploadResponse } from "@/lib/contract";
import { getSessionToken } from "@/lib/session";

export function makeFlushApi(token: string | null): FlushApi {
  return {
    upload: (req, t) =>
      apiPost<UploadResponse>("/upload", req, { token: t ?? token }),
    putBlob: (upload, blob) => apiUpload(upload.upload_url, upload.headers, blob),
    createIncident: (incident: IncidentCreate, t) =>
      apiPost<Incident>("/incident", incident, { token: t ?? token }),
  };
}

const RETRY_MS = 30_000;

/**
 * Flush the IndexedDB submission queue whenever the app is foregrounded or
 * the connection returns. Rows that fail with retryable errors stay queued
 * and a backoff pass is scheduled.
 */
export function initQueueFlushDriver(): () => void {
  const queue: SubmissionQueue = createSubmissionQueue();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void attempt();
    }, ms);
  };

  const attempt = async () => {
    if (stopped) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const token = getSessionToken();
    if (!token) return;
    try {
      const result = await flushQueue(queue, makeFlushApi(token), token);
      if (result.retried.length > 0) schedule(RETRY_MS);
    } catch {
      schedule(RETRY_MS);
    }
  };

  const onShow = () => void attempt();
  const onVisibility = () => {
    if (document.visibilityState === "visible") void attempt();
  };
  const onOnline = () => void attempt();

  window.addEventListener("pageshow", onShow);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  void attempt();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener("pageshow", onShow);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
  };
}