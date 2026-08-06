import type { MediaType } from "@/lib/contract";

export const MEDIA_TYPES: readonly MediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/webm",
  "video/mp4",
];

export const MAX_THUMBNAIL_DIM = 1280;

export function isVideoType(type: string): boolean {
  return type.startsWith("video/");
}

/** Map a contract media type to its file extension. */
export function extFor(type: MediaType): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/webm":
      return "webm";
    case "video/mp4":
      return "mp4";
    default:
      return "bin";
  }
}

/** Normalize a browser-reported MIME type into a contract media type, or null if not accepted. */
export function normalizeMediaType(type: string): MediaType | null {
  if ((MEDIA_TYPES as readonly string[]).includes(type)) return type as MediaType;
  if (type === "image/jpg") return "image/jpeg";
  return null;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto is not available in this browser");
  }
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      type,
      quality,
    );
  });
}

async function drawSourceToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxDim = MAX_THUMBNAIL_DIM,
): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, maxDim / Math.max(1, Math.max(width, height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = (e: Event) => {
      cleanup();
      reject(new Error(`media event failed: ${event} (${String(e.type)})`));
    };
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

/**
 * Build a JPEG thumbnail from an image or video file, drawing the frame at
 * ~1s into a video (or its first frame when shorter than that).
 */
export async function makeThumbnail(file: File, seekSeconds = 1): Promise<Blob> {
  if (isVideoType(file.type)) {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      await waitForEvent(video, "loadedmetadata");
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0) {
        video.currentTime = Math.min(seekSeconds, Math.max(0, duration - 0.05));
        await waitForEvent(video, "seeked");
      }
      const canvas = await drawSourceToCanvas(video, video.videoWidth || 640, video.videoHeight || 360);
      return canvasToBlob(canvas, "image/jpeg", 0.82);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = await drawSourceToCanvas(bitmap, bitmap.width, bitmap.height);
    return canvasToBlob(canvas, "image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}

/** Capture a single JPEG frame from a live camera preview. */
export async function takePhoto(video: HTMLVideoElement, maxDim = 1920): Promise<Blob> {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = await drawSourceToCanvas(video, width, height, maxDim);
  return canvasToBlob(canvas, "image/jpeg", 0.9);
}

export interface ClipRecorder {
  stop(): Promise<Blob>;
}

/** MediaRecorder over a live camera stream; start/stop controlled by the UI. */
export function startClipRecorder(stream: MediaStream): ClipRecorder {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/mp4;codecs=avc1",
    "video/webm",
  ];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 } : undefined,
  );
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);
  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("MediaRecorder failed"));
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
        if (recorder.state !== "inactive") recorder.stop();
        else resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      }),
  };
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
