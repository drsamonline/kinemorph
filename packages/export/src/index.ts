import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat
} from 'mediabunny';
import { STYLES, totalDuration, type Project } from '@kinemorph/core';
import { ASPECTS, type AspectId } from '@kinemorph/core';
import type { SceneRenderer } from '@kinemorph/renderer';

/**
 * Frame-exact video export.
 *
 * The renderer is a pure function of (project, time), so export is a plain loop:
 * set the clock to i/fps, render, hand the canvas to the encoder, await
 * backpressure. Nothing is recorded in real time and nothing can drop a frame
 * because the tab was busy.
 *
 * Muxing is Mediabunny's job (it succeeded mp4-muxer). It owns the encoder
 * configuration and the container, which removed a few hundred lines of manual
 * VideoEncoder/AudioEncoder wiring and one whole class of bug.
 */

/** MP4 for sharing, WebM for a smaller file or when a container needs VP9. */
export type Container = 'mp4' | 'webm';

export interface ExportOptions {
  renderer: SceneRenderer;
  project: Project;
  container?: Container;
  /** Output format. Defaults to the renderer's current design space. */
  aspect?: AspectId;
  fps?: number;
  width?: number;
  height?: number;
  audio?: AudioBuffer | null;
  bitrate?: number;
  mainThread?: boolean;
  onProgress?: (phase: 'video' | 'audio' | 'muxing', progress: number) => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  container: Container;
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
  /** Which audio codec made it into the file, when one did. */
  audioCodec?: string;
  /** Why audio was dropped, if it was. */
  audioError?: string;
}

export class ExportUnsupportedError extends Error {}

/** Output pixel size for a format at a given long edge. */
export function sizeForAspect(aspect: AspectId, longEdge = 1280): { width: number; height: number } {
  const a = ASPECTS[aspect] ?? ASPECTS['16:9'];
  const scale = longEdge / Math.max(a.w, a.h);
  return { width: Math.round((a.w * scale) / 2) * 2, height: Math.round((a.h * scale) / 2) * 2 };
}

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'show';

/* ------------------------------------------------------------------ */
/* Codec probing — AAC first, Opus second, video-only as a last resort  */
/* ------------------------------------------------------------------ */

interface VideoChoice {
  /** WebCodecs codec string, used for the support probe. */
  probe: string;
  /** Mediabunny codec name. */
  codec: 'avc' | 'vp9';
}

async function chooseVideoCodec(
  container: Container, width: number, height: number, bitrate: number, fps: number
): Promise<VideoChoice | null> {
  const h264: VideoChoice[] = [
    { probe: 'avc1.4d0028', codec: 'avc' },
    { probe: 'avc1.42001f', codec: 'avc' }
  ];
  const vp9: VideoChoice[] = [{ probe: 'vp09.00.10.08', codec: 'vp9' }];
  const candidates = container === 'webm' ? [...vp9] : [...h264, ...vp9];
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.probe, width, height, bitrate, framerate: fps
      });
      if (support.supported) return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

interface AudioChoice {
  probe: string;
  codec: 'aac' | 'opus';
}

async function chooseAudioCodec(container: Container, sampleRate: number): Promise<AudioChoice | null> {
  const aac: AudioChoice = { probe: 'mp4a.40.2', codec: 'aac' };
  const opus: AudioChoice = { probe: 'opus', codec: 'opus' };
  /* AAC is preferred inside MP4 because some editors ignore Opus; WebM only takes Opus */
  const candidates = container === 'webm' ? [opus] : [aac, opus];
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: candidate.probe, sampleRate, numberOfChannels: 2, bitrate: 128_000
      });
      if (support.supported) return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

function makeSurface(width: number, height: number, smooth: boolean): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d', { alpha: false });
  if (!ctx) throw new ExportUnsupportedError('Could not create an export surface.');
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  return surface;
}

/* ------------------------------------------------------------------ */
/* Main-thread export                                                  */
/* ------------------------------------------------------------------ */

async function exportMP4OnMainThread(options: ExportOptions): Promise<ExportResult> {
  const { renderer, project } = options;
  const container = options.container ?? 'mp4';
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const bitrate = options.bitrate ?? 6_000_000;
  const duration = totalDuration(project);
  const style = STYLES[project.style];

  const video = await chooseVideoCodec(container, width, height, bitrate, fps);
  if (!video) throw new ExportUnsupportedError(`No supported video codec was found for ${container.toUpperCase()} export.`);

  const audioBuffer = options.audio ?? null;
  const audio = audioBuffer ? await chooseAudioCodec(container, audioBuffer.sampleRate) : null;
  let audioError: string | undefined;
  if (audioBuffer && !audio) audioError = `this browser has no ${container.toUpperCase()}-capable audio encoder`;

  renderer.setDesign(options.aspect ?? project.aspect ?? '16:9');
  const surface = makeSurface(width, height, !!style?.smooth);
  const ctx = surface.getContext('2d')!;

  const output = new Output({
    format: container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new BufferTarget()
  });
  const videoSource = new CanvasSource(surface, {
    codec: video.codec,
    quality: new Quality({ bitrate })
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (audioBuffer && audio) {
    try {
      audioSource = new AudioBufferSource({ codec: audio.codec, quality: new Quality({ bitrate: 128_000 }) });
      output.addAudioTrack(audioSource);
    } catch (err) {
      audioSource = null;
      audioError = err instanceof Error ? err.message : 'the audio track could not be added';
    }
  }

  await output.start();

  const totalFrames = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < totalFrames; i++) {
    renderer.render(project, i / fps);
    ctx.drawImage(renderer.canvas, 0, 0, width, height);
    /* awaiting add() is how backpressure reaches us — the encoder is already
       off the main thread inside the browser */
    await videoSource.add(i / fps, 1 / fps);
    if (i % 4 === 0) options.onProgress?.('video', i / totalFrames);
  }
  options.onProgress?.('video', 1);

  if (audioSource && audioBuffer) {
    try {
      options.onProgress?.('audio', 0);
      await audioSource.add(audioBuffer);
      options.onProgress?.('audio', 1);
    } catch (err) {
      audioSource = null;
      audioError = err instanceof Error ? err.message : 'audio encoding failed';
    }
  }

  options.onProgress?.('muxing', 0);
  await output.finalize();
  options.onProgress?.('muxing', 1);

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('the muxer produced no data');

  return {
    blob: new Blob([buffer], { type: container === 'webm' ? 'video/webm' : 'video/mp4' }),
    filename: `${slug(project.title)}.${container}`,
    container,
    width,
    height,
    duration,
    fps,
    hasAudio: !!audioSource,
    codec: video.codec,
    audioCodec: audioSource ? audio?.codec : undefined,
    audioError
  };
}

/* ------------------------------------------------------------------ */
/* Worker export                                                       */
/* ------------------------------------------------------------------ */

interface WorkerInit {
  container: Container;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  videoCodec: 'avc' | 'vp9';
  audioCodec: 'aac' | 'opus' | null;
  sampleRate: number;
}

type WorkerOut =
  | { type: 'progress'; phase: 'video' | 'audio' | 'muxing'; value: number }
  | { type: 'frame-done' }
  | { type: 'done'; buffer: ArrayBuffer; hasAudio: boolean }
  | { type: 'error'; message: string };

async function exportMP4InWorker(options: ExportOptions): Promise<ExportResult> {
  const { renderer, project } = options;
  const container = options.container ?? 'mp4';
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const bitrate = options.bitrate ?? 6_000_000;
  const duration = totalDuration(project);
  const style = STYLES[project.style];

  const video = await chooseVideoCodec(container, width, height, bitrate, fps);
  if (!video) throw new ExportUnsupportedError(`No supported video codec was found for ${container.toUpperCase()} export.`);

  const audioBuffer = options.audio ?? null;
  const audio = audioBuffer ? await chooseAudioCodec(container, audioBuffer.sampleRate) : null;
  let audioError: string | undefined;
  if (audioBuffer && !audio) audioError = `this browser has no ${container.toUpperCase()}-capable audio encoder`;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./encode-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    throw new ExportUnsupportedError('This browser could not start the encoding worker.');
  }

  let resolveFrame: (() => void) | null = null;
  let settled = false;

  const done = new Promise<{ buffer: ArrayBuffer; hasAudio: boolean }>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data;
      if (message.type === 'progress') {
        options.onProgress?.(message.phase, message.phase === 'video' ? message.value / Math.max(1, Math.round(duration * fps)) : message.value);
        return;
      }
      if (message.type === 'frame-done') {
        resolveFrame?.();
        resolveFrame = null;
        return;
      }
      settled = true;
      if (message.type === 'done') resolve({ buffer: message.buffer, hasAudio: message.hasAudio });
      else reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(event.message || 'the encoding worker failed'));
    };
  });

  const init: WorkerInit = {
    container, width, height, fps, bitrate,
    videoCodec: video.codec,
    audioCodec: audio?.codec ?? null,
    sampleRate: audioBuffer?.sampleRate ?? 48_000
  };
  worker.postMessage({ type: 'init', config: init });

  renderer.setDesign(options.aspect ?? project.aspect ?? '16:9');
  const surface = makeSurface(width, height, !!style?.smooth);
  const ctx = surface.getContext('2d')!;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  try {
    for (let i = 0; i < totalFrames; i++) {
      renderer.render(project, i / fps);
      ctx.drawImage(renderer.canvas, 0, 0, width, height);
      const bitmap = await createImageBitmap(surface);
      /* one frame in flight at a time: the ack is the backpressure signal */
      const ack = new Promise<void>((resolve) => { resolveFrame = resolve; });
      worker.postMessage({ type: 'frame', bitmap, timestamp: i / fps, duration: 1 / fps }, [bitmap]);
      await ack;
      if (i % 4 === 0) options.onProgress?.('video', i / totalFrames);
    }

    if (audioBuffer && audio) {
      const left = audioBuffer.getChannelData(0).slice();
      const right = (audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0)).slice();
      worker.postMessage({ type: 'audio', left, right, sampleRate: audioBuffer.sampleRate }, [left.buffer, right.buffer]);
    }

    worker.postMessage({ type: 'finish' });
    const result = await done;

    return {
      blob: new Blob([result.buffer], { type: container === 'webm' ? 'video/webm' : 'video/mp4' }),
      filename: `${slug(project.title)}.${container}`,
      container,
      width,
      height,
      duration,
      fps,
      hasAudio: result.hasAudio,
      codec: video.codec,
      audioCodec: result.hasAudio ? audio?.codec : undefined,
      audioError
    };
  } finally {
    worker.terminate();
  }
}

/**
 * Public entry point. Uses the worker when the browser can run one, and falls
 * back to the main thread when it cannot. A failure after the worker has
 * started is not retried — that would render every frame twice.
 */
export async function exportMP4(options: ExportOptions): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new ExportUnsupportedError('This browser has no WebCodecs video encoder. Use the WebM recorder instead.');
  }
  if (!options.mainThread && typeof Worker !== 'undefined') {
    try {
      return await exportMP4InWorker(options);
    } catch (err) {
      if (!(err instanceof ExportUnsupportedError)) throw err;
      /* the worker could not start at all — the main thread will do */
    }
  }
  return exportMP4OnMainThread(options);
}

/* ------------------------------------------------------------------ */
/* Fallback: real-time WebM capture                                    */
/* ------------------------------------------------------------------ */

export interface RecordOptions {
  renderer: SceneRenderer;
  project: Project;
  audio?: AudioBuffer | null;
  onProgress?: (phase: 'video', progress: number) => void;
}

/**
 * Real-time capture. Slower and lossier than the WebCodecs path, but it works
 * in browsers without a video encoder and it can carry the soundtrack.
 */
export async function recordWebM(options: RecordOptions): Promise<ExportResult> {
  const { renderer, project } = options;
  const duration = totalDuration(project);
  const fps = 30;

  const stream = renderer.canvas.captureStream(fps);
  let audioCtx: AudioContext | null = null;

  if (options.audio) {
    audioCtx = new AudioContext({ sampleRate: options.audio.sampleRate });
    const destination = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = options.audio;
    source.connect(destination);
    source.start();
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(250);

  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= duration) { resolve(); return; }
      renderer.render(project, elapsed);
      options.onProgress?.('video', elapsed / duration);
      requestAnimationFrame(tick);
    };
    tick();
  });

  recorder.stop();
  await finished;
  if (audioCtx) await audioCtx.close();
  stream.getTracks().forEach((track) => track.stop());

  return {
    blob: new Blob(chunks, { type: mimeType }),
    filename: `${slug(project.title)}.webm`,
    container: 'webm' as Container,
    width: renderer.canvas.width,
    height: renderer.canvas.height,
    duration,
    fps,
    hasAudio: !!options.audio,
    codec: mimeType
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1500);
}

/* ------------------------------------------------------------------ */
/* Audio stems                                                         */
/* ------------------------------------------------------------------ */

/**
 * A 16-bit PCM WAV of the score. Exporting the video silent and the audio as
 * WAV is the reliable way to get a soundtrack into a desktop editor: WAV is
 * universal, while Opus-in-MP4 is ignored by some NLEs.
 */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true);                     // block align
  view.setUint16(34, 16, true);            // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view.buffer], { type: 'audio/wav' });
}

export function wavFilename(project: Project): string {
  return `${slug(project.title)}-score.wav`;
}
