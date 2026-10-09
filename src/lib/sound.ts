/**
 * Sovereign Web Audio Synthesizer for Tactile & Acoustic Dopamine Feedback
 * 100% offline, zero external audio assets needed.
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function toggleSound(): boolean {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    playChime("high");
  }
  return soundEnabled;
}

/**
 * Satisfying Warm Thought Dump Chime (Dopamine reward)
 */
export function playDumpChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 pentatonic chord
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04);

      gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.04 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.04);
      osc.stop(ctx.currentTime + idx * 0.04 + 0.35);
    });
  } catch (err) {
    void err;
  }
}

/**
 * Smooth Route / Move Swoosh Chime
 */
export function playRouteSwoosh() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (err) {
    void err;
  }
}

/**
 * General UI Chime
 */
export function playChime(pitch: "high" | "low" = "high") {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch === "high" ? 880 : 330, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (err) {
    void err;
  }
}

/**
 * Ambient Focus Drone (Low soothing 432Hz sine wave)
 */
let ambientGain: GainNode | null = null;
let ambientOsc: OscillatorNode | null = null;

export function toggleAmbientFocus(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ambientOsc) {
    ambientGain?.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    setTimeout(() => {
      ambientOsc?.stop();
      ambientOsc?.disconnect();
      ambientOsc = null;
      ambientGain = null;
    }, 550);
    return false;
  } else {
    ambientOsc = ctx.createOscillator();
    ambientGain = ctx.createGain();

    ambientOsc.type = "sine";
    ambientOsc.frequency.setValueAtTime(216, ctx.currentTime); // Harmonic of 432Hz

    ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    ambientGain.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + 1);

    ambientOsc.connect(ambientGain);
    ambientGain.connect(ctx.destination);

    ambientOsc.start();
    return true;
  }
}
