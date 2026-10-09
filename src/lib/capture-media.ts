// Browser-side capture helpers. Everything stays on this device; nothing is uploaded.
import { blobToDataUrl } from "./media-store";

export const MAX_VOICE_SECONDS = 180;
// ~0.9 Mbps keeps two minutes near 14 MB, under the 20 MB per-attachment limit.
export const MAX_VIDEO_SECONDS = 120;

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * Grabs the current camera frame as a downscaled JPEG data URL, in a single encode, so a photo stays
 * small enough for browser storage without being compressed twice.
 */
export async function captureFrame(video: HTMLVideoElement, maxEdge = 1600, quality = 0.85) {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not process the photo.");
  return blobToDataUrl(blob);
}

/** Picks a recording format this browser supports. Codec parameters are dropped from the stored type. */
export function pickRecorderMime(kind: "audio" | "video") {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates =
    kind === "video"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export const baseMime = (mime: string, fallback: string) => mime.split(";")[0] || fallback;

export const clipName = (kind: "voice-note" | "video-clip", mime: string) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `${kind}-${stamp}.${mime.includes("mp4") ? (kind === "video-clip" ? "mp4" : "m4a") : "webm"}`;
};

export function friendlyMediaError(error: unknown) {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Permission was blocked. Allow the camera or microphone in your browser's address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "The camera or microphone is being used by another app.";
  return (error as Error)?.message || "Couldn't start capture.";
}

export type LevelMeter = { read: () => number; close: () => void };

/** Reads the live loudness (0 to 1) of an audio stream, for the waveform. */
export function createLevelMeter(stream: MediaStream): LevelMeter | null {
  if (stream.getAudioTracks().length === 0) return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  const ctx = new AudioContextClass();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Uint8Array(analyser.fftSize);
  return {
    read: () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const value of buffer) sum += ((value - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buffer.length) * 3.4);
    },
    close: () => void ctx.close().catch(() => {}),
  };
}
