import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, SwitchCamera, X } from "lucide-react";
import {
  MAX_VIDEO_SECONDS,
  MAX_VOICE_SECONDS,
  baseMime,
  clipName,
  captureFrame,
  createLevelMeter,
  formatClock,
  friendlyMediaError,
  pickRecorderMime,
  type LevelMeter,
} from "../lib/capture-media";

export type StageMode = "voice" | "photo" | "video" | "dictate";
export type StageResult =
  | { kind: "photo"; dataUrl: string }
  | { kind: "audio" | "video"; blob: Blob; name: string; mime: string; seconds: number };

const LIMIT: Partial<Record<StageMode, number>> = {
  voice: MAX_VOICE_SECONDS,
  video: MAX_VIDEO_SECONDS,
};
const TITLE: Record<StageMode, string> = {
  voice: "Recording voice note",
  video: "Recording video",
  photo: "Take a photo",
  dictate: "Listening · your words appear in the bar",
};

type CaptureStageProps = {
  mode: StageMode;
  onResult: (result: StageResult) => void;
  onClose: () => void;
};

export function CaptureStage({ mode, onResult, onClose }: CaptureStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const finishing = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    let meter: LevelMeter | null = null;
    let timer: number | undefined;
    let raf = 0;
    let recorder: MediaRecorder | undefined;
    finishing.current = false;
    setError("");
    setSeconds(0);
    setReady(false);
    setBusy(false);

    const startWaveform = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !meter) return;
      const color = getComputedStyle(canvas).color;
      const history: number[] = [];
      let last = 0;
      const frame = (now: number) => {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const bar = 3;
        const step = 6;
        const count = Math.max(1, Math.floor(w / step));
        if (now - last > 45) {
          history.push(meter!.read());
          if (history.length > count) history.shift();
          last = now;
        }
        ctx.fillStyle = color;
        // faint baseline dots fill the part that hasn't been recorded yet
        ctx.globalAlpha = 0.14;
        for (let x = w - step * (history.length + 1); x > -step; x -= step)
          ctx.fillRect(x, h / 2 - 1, bar, 2);
        for (let i = 0; i < history.length; i++) {
          const x = w - (history.length - i) * step;
          const bh = Math.max(3, history[i]! * h * 0.92);
          ctx.globalAlpha = 0.3 + 0.7 * (i / history.length);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, (h - bh) / 2, bar, bh, 1.5);
          else ctx.rect(x, (h - bh) / 2, bar, bh);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("This browser can't access the camera or microphone.");
        const wantsVideo = mode === "photo" || mode === "video";
        const wantsAudio = mode !== "photo";
        stream = await navigator.mediaDevices.getUserMedia({
          audio: wantsAudio ? { echoCancellation: true, noiseSuppression: true } : false,
          video: wantsVideo
            ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (wantsVideo && videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (mode === "photo") {
          void navigator.mediaDevices
            .enumerateDevices()
            .then(
              (devices) =>
                !cancelled && setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1),
            );
        }
        meter = createLevelMeter(stream);
        startWaveform();

        if (mode === "voice" || mode === "video") {
          if (typeof MediaRecorder === "undefined")
            throw new Error("Recording isn't supported in this browser.");
          const kind = mode === "video" ? "video" : "audio";
          const mimeType = pickRecorderMime(kind);
          const chunks: Blob[] = [];
          const active = new MediaRecorder(stream, {
            ...(mimeType ? { mimeType } : {}),
            audioBitsPerSecond: mode === "video" ? 64000 : 32000,
            ...(mode === "video" ? { videoBitsPerSecond: 900000 } : {}),
          });
          recorder = active;
          active.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          const startedAt = Date.now();
          active.onstop = () => {
            if (!finishing.current) return;
            const mime = baseMime(
              active.mimeType || mimeType || "",
              kind === "video" ? "video/webm" : "audio/webm",
            );
            onResultRef.current({
              kind,
              blob: new Blob(chunks, { type: mime }),
              name: clipName(kind === "video" ? "video-clip" : "voice-note", mime),
              mime,
              seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            });
          };
          active.start();
          recorderRef.current = active;
          timer = window.setInterval(
            () => setSeconds(Math.round((Date.now() - startedAt) / 1000)),
            250,
          );
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(friendlyMediaError(err));
      }
    };
    void start();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive" && !finishing.current) recorder.stop();
      meter?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mode, facing, attempt]);

  const finish = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    recorder.stop();
  };

  const limit = LIMIT[mode];
  useEffect(() => {
    if (limit && seconds >= limit) finish();
  }, [seconds, limit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const snap = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    setFlash(true);
    try {
      // Encode while the flash plays; the flash keeps the capture from feeling abrupt.
      const [dataUrl] = await Promise.all([
        captureFrame(video),
        new Promise((resolve) => window.setTimeout(resolve, 240)),
      ]);
      onResultRef.current({ kind: "photo", dataUrl });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setFlash(false);
    }
  };

  const recording = ready && !error && (mode === "voice" || mode === "video");
  const hasWave = mode === "voice" || mode === "dictate";

  return (
    <section className={`stage stage-${mode}`} aria-label={error ? "Capture problem" : TITLE[mode]}>
      <header className="stage-head">
        <span
          className={`stage-dot ${recording || (mode === "dictate" && ready) ? "on" : ""}`}
          aria-hidden
        />
        <span className="stage-title">{error ? "Couldn't start" : TITLE[mode]}</span>
        {limit && (
          <span className="stage-timer" aria-live="off">
            {formatClock(seconds)}
            <small> / {formatClock(limit)}</small>
          </span>
        )}
        <button className="stage-x" onClick={onClose} aria-label="Cancel and close">
          <X size={14} />
        </button>
      </header>

      {error ? (
        <div className="stage-error" role="alert">
          <p>{error}</p>
          <div>
            <button className="stage-ghost" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw size={12} /> Try again
            </button>
            <button className="stage-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          {(mode === "photo" || mode === "video") && (
            <div className="stage-viewport">
              <video
                ref={videoRef}
                muted
                playsInline
                className={facing === "user" ? "mirror" : ""}
              />
              {mode === "video" && ready && (
                <div className="stage-rec-badge">
                  <i /> REC
                </div>
              )}
              {mode === "video" && (
                <canvas ref={canvasRef} className="stage-wave stage-wave-overlay" />
              )}
              {!ready && <div className="stage-starting">Starting camera…</div>}
              {flash && <div className="stage-flash" />}
            </div>
          )}
          {hasWave && (
            <div className="stage-wave-wrap">
              <canvas ref={canvasRef} className="stage-wave" />
              {!ready && <div className="stage-starting">Starting microphone…</div>}
            </div>
          )}

          {limit && (
            <div className="stage-progress">
              <i style={{ width: `${Math.min(100, (seconds / limit) * 100)}%` }} />
            </div>
          )}

          <footer className="stage-foot">
            {mode === "photo" ? (
              <>
                <span className="stage-hint">Esc to cancel</span>
                <button
                  className="stage-shutter"
                  onClick={() => void snap()}
                  disabled={!ready || busy}
                  aria-label="Take photo"
                >
                  <Camera size={20} />
                </button>
                {canFlip ? (
                  <button
                    className="stage-ghost"
                    onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                  >
                    <SwitchCamera size={13} /> Flip
                  </button>
                ) : (
                  <span />
                )}
              </>
            ) : mode === "dictate" ? (
              <>
                <span className="stage-hint">Speak naturally · Esc to stop</span>
                <button className="stage-save" onClick={onClose}>
                  <Check size={14} /> Done
                </button>
              </>
            ) : (
              <>
                <span className="stage-hint">Esc discards · saves to Inbox</span>
                <button className="stage-save" onClick={finish} disabled={!ready || busy}>
                  <Check size={14} /> {busy ? "Saving…" : "Stop & save"}
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
