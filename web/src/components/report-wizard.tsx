"use client";

import { Camera, Check, ImagePlus, LocateFixed, MapPin, RotateCcw, ShieldAlert, Upload, Video, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatForce, INCIDENT_TYPES, POLICE_FORCES, type IncidentType, type MediaType, type PoliceForce } from "@/lib/contract";
import { makeFlushApi } from "@/lib/app-flush";
import { makeThumbnail, normalizeMediaType, sha256Hex, startClipRecorder, stopMediaStream, takePhoto, type ClipRecorder } from "@/lib/media";
import { createSubmissionQueue, flushQueue, type QueuedMedia, type QueuedSubmission } from "@/lib/offline-queue";
import { getSessionToken } from "@/lib/session";
import { typeLabel } from "@/lib/time";
import { useAuthStore } from "@/store/auth";
import { StatusBanner } from "@/components/status-banner";

type Step = "capture" | "pin" | "details" | "done";

interface Pin {
  lat: number;
  lon: number;
  accuracy: number | null;
}

// maplibre-gl is heavy, so the pin map only loads when the wizard reaches
// the pin step instead of landing in the /report critical bundle.
const PinMap = dynamic(() => import("@/components/map/pin-map").then((m) => m.PinMap), {
  loading: () => (
    <div className="aspect-[4/3] w-full animate-pulse rounded-md border hairline bg-surface" />
  ),
});

function nowLocalValue(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stripTypeParams(type: string): string {
  return type.split(";")[0]!.trim();
}

function parseCollarNumbers(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 12)
    .slice(0, 5);
}

function historyOf(v: string): boolean {
  return v.length > 0 && !Number.isNaN(new Date(v).getTime());
}

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: "capture", label: "Capture" },
  { key: "pin", label: "Pin" },
  { key: "details", label: "Details" },
];

export function ReportWizard() {
  const token = useAuthStore((s) => s.token);
  const [step, setStep] = useState<Step>("capture");
  const [media, setMedia] = useState<QueuedMedia[]>([]);
  const [pin, setPin] = useState<Pin | null>(null);
  const [done, setDone] = useState<{ offline: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // capture state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [camera, setCamera] = useState<"idle" | "starting" | "live" | "recording">("idle");

  // form state
  const [incidentType, setIncidentType] = useState<IncidentType>(INCIDENT_TYPES[0]!);
  const [policeForce, setPoliceForce] = useState<PoliceForce>(POLICE_FORCES[0]!);
  const [timestamp, setTimestamp] = useState(nowLocalValue());
  const [description, setDescription] = useState("");
  const [officerCount, setOfficerCount] = useState("");
  const [collarNumbers, setCollarNumbers] = useState("");
  const [over16, setOver16] = useState(false);

  useEffect(() => {
    return () => stopMediaStream(streamRef.current);
  }, []);

  const attachPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
  };

  const startCamera = async () => {
    setError(null);
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setCamera("live");
      attachPreview();
    } catch (err) {
      setCamera("idle");
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied. You can still upload a file instead."
          : "The camera could not be started. You can still upload a file instead.",
      );
    }
  };

  const stopCamera = () => {
    recorderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCamera("idle");
  };

  const addBlobMedia = async (blob: Blob, typeHint: MediaType) => {
    const type = normalizeMediaType(stripTypeParams(blob.type)) ?? typeHint;
    const hash = await sha256Hex(blob);
    const thumbnail_blob = await makeThumbnail(new File([blob], `${hash}.bin`, { type: blob.type })).catch(
      () => null,
    );
    setMedia((prev) => [...prev, { blob, type, hash, thumbnail_blob }]);
  };

  const takePhotoNow = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const blob = await takePhoto(video);
      await addBlobMedia(blob, "image/jpeg");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not take the photo.");
    }
  };

  const toggleRecording = async () => {
    if (!streamRef.current) return;
    if (recorderRef.current) {
      try {
        const blob = await recorderRef.current.stop();
        recorderRef.current = null;
        setCamera("live");
        await addBlobMedia(blob, "video/webm");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not finish the clip.");
      }
    } else {
      recorderRef.current = startClipRecorder(streamRef.current);
      setCamera("recording");
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      const type = normalizeMediaType(stripTypeParams(file.type));
      if (!type) {
        setError(`Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, WebM or MP4.`);
        continue;
      }
      try {
        const hash = await sha256Hex(file);
        const thumbnail_blob = await makeThumbnail(file).catch(() => null);
        setMedia((prev) => [...prev, { blob: file, type, hash, thumbnail_blob }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read that file.");
      }
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError("This browser does not expose GPS. Tap the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPin({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      () => setError("Could not get your location. Tap the map to pin it instead."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const canForward =
    step === "capture"
      ? media.length > 0
      : step === "pin"
        ? pin !== null
        : step === "details"
          ? elapsedValid()
          : false;

  function elapsedValid(): boolean {
    if (!historyOf(timestamp)) return false;
    if (!incidentType || !policeForce) return false;
    if (!over16) return false;
    return true;
  }

  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    setError(null);
    const clientId = crypto.randomUUID();
    const parsedCount = officerCount.trim() ? Math.max(0, Math.min(100, parseInt(officerCount, 10) || 0)) : null;
    const collar = parseCollarNumbers(collarNumbers);
    const timestampIso = new Date(timestamp).toISOString();

    const submission: QueuedSubmission = {
      client_id: clientId,
      incident: {
        incident_type: incidentType,
        police_force: policeForce,
        timestamp: timestampIso,
        location: { lon: pin.lon, lat: pin.lat },
        location_accuracy_m: pin.accuracy,
        description: description.trim(),
        officer_count: parsedCount,
        collar_numbers: collar,
      },
      media,
      created_at: Date.now(),
    };

    const queue = createSubmissionQueue();
    try {
      await queue.enqueue(submission);
      const sessionToken = getSessionToken();
      if (sessionToken) {
        const result = await flushQueue(queue, makeFlushApi(sessionToken), sessionToken);
        if (result.submitted.includes(clientId) || result.dropped.includes(clientId)) {
          setDone({ offline: false });
          return;
        }
      }
      setDone({ offline: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-md border hairline bg-surface/60 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-verified/15">
          <Check className="size-6 text-verified" aria-hidden />
        </div>
        <h2 className="font-display mt-4 text-2xl font-extrabold tracking-tight">
          {done.offline ? "Saved on this device" : "Report in the register"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-paper/70">
          {done.offline
            ? "You're offline or not signed in, so your report is queued on this device. It will be sent automatically when you're back online."
            : "Your record is now part of the public register. It appears the moment it is created."}
        </p>
        {done.offline && !token ? (
          <p className="timecode mt-2 text-amber">
            Tip: sign in before going online so the report is attributed to your witness account.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={token ? "/profile" : "/"} className="btn btn-primary">
            {done.offline ? "See your records" : "Back to the register"}
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDone(null);
              setMedia([]);
              setPin(null);
              setDescription("");
              setOfficerCount("");
              setCollarNumbers("");
              setOver16(false);
              setTimestamp(nowLocalValue());
              setStep("capture");
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Report another
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="rounded-md border hairline bg-surface/60 p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-amber" aria-hidden />
        <h2 className="font-display mt-3 text-xl font-extrabold tracking-tight">
          Recording registers as you
        </h2>
        <p className="mx-auto mt-2 max-w-md text-paper/70">
          You can draft a report, but submitting it to the public register needs
          a sign-in. Reports are attributed to a pseudonymous witness account,
          never your real name.
        </p>
        <Link href="/signin?next=/report" className="btn btn-primary mt-6">
          Sign in to record
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            {i > 0 ? <span className="timecode text-paper/30">/</span> : null}
            <button
              type="button"
              onClick={() => setStep(s.key)}
              disabled={step === "done"}
              aria-current={step === s.key ? "step" : undefined}
              className={`timecode rounded-md border px-3 py-1.5 ${
                step === s.key
                  ? "border-amber text-amber"
                  : "border-line text-paper/50 hover:text-paper"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
      </ol>

      {error ? <div className="mb-6"><StatusBanner kind="error" message={error} /></div> : null}

      {step === "capture" ? (
        <section aria-label="Step 1: capture" className="space-y-4">
          <div className="overflow-hidden rounded-md border hairline bg-black/50">
            {streamRef.current || camera === "starting" || camera === "live" || camera === "recording" ? (
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el) attachPreview();
                }}
                className="aspect-video w-full"
                autoPlay
                muted
                playsInline
                aria-label="Camera preview"
              />
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-paper/50">
                <Camera className="size-10" aria-hidden />
                <p className="text-sm">Start the camera, or upload what you recorded.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {camera === "idle" ? (
              <button type="button" className="btn" onClick={() => void startCamera()}>
                <Camera className="size-4" aria-hidden />
                Start camera
              </button>
            ) : (
              <>
                {camera === "live" ? (
                  <button type="button" className="btn btn-primary" onClick={() => void takePhotoNow()}>
                    <ImagePlus className="size-4" aria-hidden />
                    Take photo
                  </button>
                ) : null}
                <button
                  type="button"
                  className={camera === "recording" ? "btn btn-danger" : "btn"}
                  onClick={() => void toggleRecording()}
                >
                  <Video className="size-4" aria-hidden />
                  {camera === "recording" ? "Stop recording" : "Record clip"}
                </button>
                <button type="button" className="btn" onClick={stopCamera}>
                  Stop camera
                </button>
              </>
            )}
            <label className="btn">
              <Upload className="size-4" aria-hidden />
              Upload files
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/webm,video/mp4"
                multiple
                className="hidden"
                onChange={(e) => void addFiles(e.target.files)}
              />
            </label>
          </div>

          {media.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Attached media">
              {media.map((m, i) => (
                <li key={`${m.hash}-${i}`} className="relative overflow-hidden rounded-md border hairline bg-surface/60">
                  {m.thumbnail_blob ? (
                    <img
                      src={URL.createObjectURL(m.thumbnail_blob)}
                      alt={`Attachment ${i + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-black/40 text-paper/60">
                      <Video className="size-8" aria-hidden />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove attachment ${i + 1}`}
                    className="absolute right-1.5 top-1.5 rounded-full border border-line bg-ink/80 p-1 text-paper/80 hover:text-flag"
                    onClick={() => removeMedia(i)}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                  <p className="timecode truncate border-t hairline px-2 py-1 text-paper/50">
                    {m.type}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {step === "pin" ? (
        <section aria-label="Step 2: pin location" className="space-y-4">
          <PinMap pin={pin} onPin={setPin} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-paper/70">
              Tap the map to place the pin at the exact spot. Drag it to fine-tune.
            </p>
            <button type="button" className="btn" onClick={getLocation}>
              <LocateFixed className="size-4" aria-hidden />
              Use my location
            </button>
          </div>
          {pin ? (
            <p className="timecode rounded-md border hairline bg-surface/60 px-3 py-2 text-amber">
              PIN {pin.lat.toFixed(5)},{pin.lon.toFixed(5)}
              {pin.accuracy !== null ? ` · ±${pin.accuracy}m GPS` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "details" ? (
        <section aria-label="Step 3: details" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Incident type</span>
              <select className="field" value={incidentType} onChange={(e) => setIncidentType(e.target.value as IncidentType)}>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Police force</span>
              <select className="field" value={policeForce} onChange={(e) => setPoliceForce(e.target.value as PoliceForce)}>
                {POLICE_FORCES.map((f) => (
                  <option key={f} value={f}>
                    {formatForce(f)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="label">When it happened</span>
            <input
              className="field"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">What happened (optional)</span>
            <textarea
              className="field min-h-28 resize-y"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, in your own words."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Officer count (optional)</span>
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                value={officerCount}
                onChange={(e) => setOfficerCount(e.target.value)}
                placeholder="e.g. 2"
              />
            </label>
            <label className="block">
              <span className="label">Collar numbers (optional, up to 5)</span>
              <input
                className="field"
                type="text"
                value={collarNumbers}
                onChange={(e) => setCollarNumbers(e.target.value)}
                placeholder="e.g. PC123, EP456"
              />
            </label>
          </div>

          <fieldset className="space-y-3 rounded-md border hairline p-4">
            <legend className="label px-1">Before you submit</legend>
            <p className="text-xs text-paper/50">
              Submitting waives deletion of this footage once published (see Terms).
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={over16}
                onChange={(e) => setOver16(e.target.checked)}
              />
              <span>
                I am 16 or older, and this is my own encounter or one I am entitled
                to record.
              </span>
            </label>
          </fieldset>

          {busy ? (
            <p className="timecode text-paper/50">Uploading and filing…</p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        {step !== "capture" ? (
          <button
            type="button"
            className="btn"
            onClick={() => setStep(step === "pin" ? "capture" : "pin")}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {step !== "details" ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canForward}
            onClick={() => setStep(step === "capture" ? "pin" : "details")}
          >
            Continue
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || !canForward} onClick={() => void submit()}>
            <Check className="size-4" aria-hidden />
            Submit to the register
          </button>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-sm text-paper/60">
        <MapPin className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
        <span>
          Your location is stored to the precision of the map pin you chose. Only
          record if it is safe to do so.
        </span>
      </p>
    </div>
  );
}