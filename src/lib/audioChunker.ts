/**
 * Captures microphone audio, downsamples it to 16 kHz mono and cuts it into
 * self-contained WAV chunks at natural pauses in speech (simple energy VAD).
 * Each chunk is handed to `onChunk` for transcription.
 *
 * Cutting on silence (rather than every N seconds) avoids splitting words in
 * half, which is the main source of errors when transcribing in pieces.
 */

export const TARGET_RATE = 16_000;
const FRAME_SAMPLES = 480; // 30 ms @ 16 kHz
const FRAME_MS = 30;

export interface AudioChunk {
  /** Wall-clock start / end of the chunk (ms since epoch). */
  startMs: number;
  endMs: number;
  /** Base64-encoded 16-bit PCM WAV. */
  wavBase64: string;
  /** How much of the chunk the VAD considered speech. */
  voicedMs: number;
  /** Loudest 30 ms frame in the chunk (RMS, 0..1). */
  peakRms: number;
}

export interface ChunkerOptions {
  onChunk: (chunk: AudioChunk) => void;
  /** Called ~10x/sec with the current input level (0..1) and whether it looks like speech. */
  onLevel?: (level: number, speaking: boolean) => void;
  /** Don't cut before this much audio has accumulated. */
  minChunkMs?: number;
  /** Always cut by this length (at the quietest point near the end). */
  maxChunkMs?: number;
  /** Silence needed to trigger a cut once minChunkMs has passed. */
  silenceCutMs?: number;
}

const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(2048);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

export class AudioChunker {
  private opts: Required<Omit<ChunkerOptions, "onLevel">> & Pick<ChunkerOptions, "onLevel">;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private resumeOnVisible: (() => void) | null = null;

  // Resampler state
  private ratio = 3;
  private acc = 0;
  private accN = 0;
  private phase = 0;

  // Current chunk
  private samples = new Int16Array(TARGET_RATE * 60);
  private len = 0;
  private frameSq = 0; // running sum of squares for the current VAD frame
  private frameN = 0;
  private frames: { rms: number; speech: boolean }[] = [];
  private silenceRunMs = 0;
  private chunkStartMs = 0;

  // Adaptive noise floor for the VAD
  private noiseFloor = 0.002;
  private levelTick = 0;

  constructor(opts: ChunkerOptions) {
    this.opts = {
      minChunkMs: 6_000,
      maxChunkMs: 20_000,
      silenceCutMs: 600,
      ...opts,
    };
  }

  /** Wall-clock start of the chunk currently being recorded. */
  get currentChunkStartMs(): number {
    return this.chunkStartMs;
  }

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioWorkletNode !== "undefined"
    );
  }

  /**
   * Must be called directly from a click/tap handler: the AudioContext is created before the
   * first `await`, otherwise mobile browsers (iOS Safari, some Android) start it suspended and
   * refuse to resume it — the recording would then be silent.
   */
  async start(): Promise<void> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    const resumed = ctx.state === "suspended" ? ctx.resume().catch(() => {}) : Promise.resolve();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await resumed;
    this.ratio = ctx.sampleRate / TARGET_RATE;

    // Phones suspend/interrupt audio (screen lock, notification, call) — resume when possible.
    ctx.onstatechange = () => {
      if (this.ctx === ctx && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
    };
    this.resumeOnVisible = () => {
      if (document.visibilityState === "visible" && this.ctx === ctx && ctx.state !== "running") ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", this.resumeOnVisible);

    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-tap");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data);
    this.source.connect(this.node);
    // The node outputs silence; connecting keeps it pulled by the graph in every browser.
    this.node.connect(this.ctx.destination);

    this.chunkStartMs = Date.now();
  }

  /** Stops capture. Unless `discard` is set, the remaining audio is emitted as a final chunk. */
  async stop(discard = false): Promise<void> {
    if (this.resumeOnVisible) document.removeEventListener("visibilitychange", this.resumeOnVisible);
    this.resumeOnVisible = null;
    if (this.ctx) this.ctx.onstatechange = null;
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close().catch(() => {});
    this.node = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;

    if (!discard && this.len > TARGET_RATE / 2) this.emit(this.len);
    this.len = 0;
    this.frames = [];
  }

  /* ---------------------------------------------------------------- */

  private push(input: Float32Array) {
    const r = this.ratio;
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.accN++;
      this.phase += 1;
      if (this.phase >= r) {
        this.addSample(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
        this.phase -= r;
      }
    }
  }

  private addSample(x: number) {
    if (this.len >= this.samples.length) {
      // Should not happen (maxChunkMs forces a cut first), but never overflow.
      this.emit(this.len);
    }
    const s = Math.max(-1, Math.min(1, x));
    this.samples[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.frameSq += s * s;
    if (++this.frameN === FRAME_SAMPLES) {
      this.endFrame(Math.sqrt(this.frameSq / FRAME_SAMPLES));
      this.frameSq = 0;
      this.frameN = 0;
    }
  }

  private endFrame(rms: number) {
    // Relative to the room's background — a fixed loudness bar would treat a distant speaker as silence.
    const speech = rms > Math.max(this.noiseFloor * 2.5, 0.0008);
    // Noise floor: falls fast, rises slowly — tracks the room's background level.
    // While someone is talking it barely moves, so long monologues aren't mistaken for background noise.
    if (rms < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
    else if (!speech) this.noiseFloor = this.noiseFloor * 0.995 + rms * 0.005;
    else this.noiseFloor = this.noiseFloor * 0.9998 + rms * 0.0002;

    this.frames.push({ rms, speech });
    this.silenceRunMs = speech ? 0 : this.silenceRunMs + FRAME_MS;

    if (this.opts.onLevel && ++this.levelTick % 3 === 0) {
      this.opts.onLevel(Math.min(1, rms * 8), speech);
    }

    const durMs = (this.len / TARGET_RATE) * 1000;
    if (durMs >= this.opts.minChunkMs && this.silenceRunMs >= this.opts.silenceCutMs) {
      // Cut in the middle of the pause.
      const back = Math.floor(this.silenceRunMs / 2 / FRAME_MS) * FRAME_SAMPLES;
      this.emit(this.len - back);
    } else if (durMs >= this.opts.maxChunkMs) {
      // No pause found — cut at the quietest frame in the last 3 seconds.
      const lookback = Math.min(this.frames.length - 1, Math.floor(3000 / FRAME_MS));
      let best = this.frames.length - 1;
      for (let i = this.frames.length - 1; i >= this.frames.length - lookback; i--) {
        if (this.frames[i].rms < this.frames[best].rms) best = i;
      }
      this.emit(Math.min(this.len, best * FRAME_SAMPLES + FRAME_SAMPLES / 2));
    }
  }

  /** Emits samples [0, cut) as a chunk and keeps the rest as the start of the next one. */
  private emit(cut: number) {
    cut = Math.max(0, Math.min(this.len, cut));
    const cutFrames = Math.floor(cut / FRAME_SAMPLES);
    const chunkFrames = this.frames.slice(0, cutFrames);
    const voicedMs = chunkFrames.filter((f) => f.speech).length * FRAME_MS;
    const peakRms = chunkFrames.reduce((m, f) => Math.max(m, f.rms), 0);
    const startMs = this.chunkStartMs;
    const endMs = startMs + Math.round((cut / TARGET_RATE) * 1000);

    const pcm = this.samples.slice(0, cut);
    this.samples.copyWithin(0, cut, this.len);
    this.len -= cut;
    this.frames = this.frames.slice(cutFrames);
    this.silenceRunMs = 0;
    for (let i = this.frames.length - 1; i >= 0 && !this.frames[i].speech; i--) this.silenceRunMs += FRAME_MS;
    this.chunkStartMs = endMs;

    if (pcm.length > 0) {
      this.opts.onChunk({ startMs, endMs, voicedMs, peakRms, wavBase64: toBase64(encodeWav(pcm, TARGET_RATE)) });
    }
  }
}

function encodeWav(pcm: Int16Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}
