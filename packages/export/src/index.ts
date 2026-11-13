import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { STYLES, totalDuration, type Project } from '@kinemorph/core';
import type { SceneRenderer } from '@kinemorph/renderer';

/**
 * Frame-exact video export.
 *
 * The renderer is a pure function of (project, time), so export is a plain
 * loop: set the clock to i/fps, render, grab the pixels, encode. Nothing is
 * recorded in real time and nothing can drop a frame because the tab was busy.
 * Audio comes from an OfflineAudioContext mixdown of the same score the
 * preview plays.
 */

export interface ExportOptions {
  renderer: SceneRenderer;
  project: Project;
  fps?: number;
  width?: number;
  height?: number;
  audio?: AudioBuffer | null;
  bitrate?: number;
  onProgress?: (phase: 'video' | 'audio' | 'muxing', progress: number) => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
  /** Why audio was dropped, if it was. */
  audioError?: string;
}

export class ExportUnsupportedError extends Error {}

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'show';

async function firstSupportedVideoConfig(width: number, height: number, bitrate: number, fps: number) {
  const codecs = ['avc1.4d0028', 'avc1.42001f', 'avc1.42E01E'];
  for (const codec of codecs) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return { config, codec };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

async function firstSupportedAudioConfig(sampleRate: number) {
  const candidates: { config: AudioEncoderConfig; muxCodec: 'aac' | 'opus' }[] = [
    { config: { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 128_000 }, muxCodec: 'aac' },
    { config: { codec: 'opus', sampleRate, numberOfChannels: 2, bitrate: 128_000 }, muxCodec: 'opus' }
  ];
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(candidate.config);
      if (support.supported) return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

async function exportMP4OnMainThread(options: ExportOptions): Promise<ExportResult> {
  const { renderer, project } = options;
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const bitrate = options.bitrate ?? 6_000_000;
  const duration = totalDuration(project);
  const style = STYLES[project.style];

  if (typeof VideoEncoder === 'undefined') {
    throw new ExportUnsupportedError('This browser has no WebCodecs video encoder. Use the WebM recorder instead.');
  }

  const videoConfig = await firstSupportedVideoConfig(width, height, bitrate, fps);
  if (!videoConfig) {
    throw new ExportUnsupportedError('No supported video codec was found for MP4 export.');
  }

  const audioBuffer = options.audio ?? null;
  const audioConfig = audioBuffer ? await firstSupportedAudioConfig(audioBuffer.sampleRate) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoConfig.codec.startsWith('avc1') ? 'avc' : 'vp9', width, height, frameRate: fps },
    audio: audioBuffer && audioConfig
      ? { codec: audioConfig.muxCodec, sampleRate: audioBuffer.sampleRate, numberOfChannels: 2 }
      : undefined,
    fastStart: 'in-memory'
  });

  let muxError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try { muxer.addVideoChunk(chunk, meta); } catch (err) { muxError = err as Error; }
    },
    error: (err) => { muxError = err; }
  });
  videoEncoder.configure(videoConfig.config);

  /* an offscreen surface at export resolution; the style decides the smoothing */
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d', { alpha: false });
  if (!ctx) throw new ExportUnsupportedError('Could not create an export surface.');
  ctx.imageSmoothingEnabled = !!style?.smooth;
  ctx.imageSmoothingQuality = 'high';

  const totalFrames = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < totalFrames; i++) {
    if (muxError) throw muxError;
    const t = i / fps;
    renderer.render(project, t);
    ctx.drawImage(renderer.canvas, 0, 0, width, height);

    const frame = new VideoFrame(surface, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps)
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    /* keep the encode queue shallow so memory stays flat on long shows */
    if (videoEncoder.encodeQueueSize > 6) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (i % 4 === 0) options.onProgress?.('video', i / totalFrames);
  }

  options.onProgress?.('video', 1);
  await videoEncoder.flush();
  videoEncoder.close();
  if (muxError) throw muxError;

  let hasAudio = false;
  let audioError: string | undefined;
  if (!audioBuffer) {
    audioError = 'no score was rendered';
  } else if (!audioConfig) {
    audioError = 'this browser has no MP4-capable audio encoder';
  } else {
    try {
      hasAudio = await encodeAudio(audioBuffer, audioConfig, muxer, options.onProgress);
    } catch (err) {
      /* a silent MP4 is better than no file, but the caller must be told why */
      hasAudio = false;
      audioError = err instanceof Error ? err.message : 'audio encoding failed';
    }
  }

  options.onProgress?.('muxing', 0);
  muxer.finalize();
  options.onProgress?.('muxing', 1);

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    filename: `${slug(project.title)}.mp4`,
    width,
    height,
    duration,
    fps,
    hasAudio,
    codec: videoConfig.codec,
    audioError
  };
}

async function encodeAudio(
  buffer: AudioBuffer,
  audioConfig: { config: AudioEncoderConfig; muxCodec: 'aac' | 'opus' },
  muxer: Muxer<ArrayBufferTarget>,
  onProgress?: ExportOptions['onProgress']
): Promise<boolean> {
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      try { muxer.addAudioChunk(chunk, meta); } catch (err) { failure = err as Error; }
    },
    error: (err) => { failure = err; }
  });
  encoder.configure(audioConfig.config);

  const channels = Math.min(2, buffer.numberOfChannels);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  const chunkFrames = 4096;

  for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
    if (failure) throw failure;
    const count = Math.min(chunkFrames, buffer.length - offset);
    const interleaved = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      interleaved[i * 2] = left[offset + i];
      interleaved[i * 2 + 1] = right[offset + i];
    }
    const data = new AudioData({
      format: 'f32',
      sampleRate: buffer.sampleRate,
      numberOfFrames: count,
      numberOfChannels: 2,
      timestamp: Math.round((offset / buffer.sampleRate) * 1e6),
      data: interleaved
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
    if (offset % (chunkFrames * 8) === 0) onProgress?.('audio', offset / buffer.length);
  }

  onProgress?.('audio', 1);
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  return true;
}

/* ------------------------------------------------------------------ */
/* Worker-driven export                                                */
/* ------------------------------------------------------------------ */

interface WorkerHandle {
  worker: Worker;
  inflight: number;
  waiters: (() => void)[];
}

/**
 * Same frame loop, but the encode and the mux happen off the main thread.
 * Frames cross the boundary as transferable ImageBitmaps.
 */
async function exportMP4InWorker(options: ExportOptions): Promise<ExportResult> {
  const { renderer, project } = options;
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const bitrate = options.bitrate ?? 6_000_000;
  const duration = totalDuration(project);
  const style = STYLES[project.style];

  const videoConfig = await firstSupportedVideoConfig(width, height, bitrate, fps);
  if (!videoConfig) throw new ExportUnsupportedError('No supported video codec was found for MP4 export.');

  const audioBuffer = options.audio ?? null;
  const audioConfig = audioBuffer ? await firstSupportedAudioConfig(audioBuffer.sampleRate) : null;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./encode-worker.ts', import.meta.url), { type: 'module' });
  } catch (err) {
    throw new ExportUnsupportedError('This browser could not start the encoding worker.');
  }

  const handle: WorkerHandle = { worker, inflight: 0, waiters: [] };
  let settled = false;

  const done = new Promise<{ buffer: ArrayBuffer; hasAudio: boolean }>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as
        | { type: 'progress'; phase: 'video' | 'audio' | 'muxing'; value: number }
        | { type: 'done'; buffer: ArrayBuffer; hasAudio: boolean }
        | { type: 'error'; message: string };

      if (message.type === 'progress') {
        if (message.phase === 'video') options.onProgress?.('video', message.value / Math.max(1, Math.round(duration * fps)));
        else options.onProgress?.(message.phase, message.value);
        return;
      }
      if (message.type === 'done') {
        settled = true;
        resolve({ buffer: message.buffer, hasAudio: message.hasAudio });
        return;
      }
      settled = true;
      reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(event.message || 'the encoding worker failed'));
    };
  });

  worker.postMessage({
    type: 'init',
    video: {
      codec: videoConfig.codec,
      muxCodec: videoConfig.codec.startsWith('avc1') ? 'avc' : 'vp9',
      width,
      height,
      bitrate,
      fps
    },
    audio: audioBuffer && audioConfig
      ? { codec: audioConfig.config, muxCodec: audioConfig.muxCodec, sampleRate: audioBuffer.sampleRate }
      : null
  });

  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d', { alpha: false });
  if (!ctx) throw new ExportUnsupportedError('Could not create an export surface.');
  ctx.imageSmoothingEnabled = !!style?.smooth;
  ctx.imageSmoothingQuality = 'high';

  const totalFrames = Math.max(1, Math.round(duration * fps));
  try {
    for (let i = 0; i < totalFrames; i++) {
      renderer.render(project, i / fps);
      ctx.drawImage(renderer.canvas, 0, 0, width, height);
      const bitmap = await createImageBitmap(surface);
      handle.inflight++;
      worker.postMessage(
        { type: 'frame', bitmap, timestamp: Math.round((i * 1e6) / fps), keyFrame: i % (fps * 2) === 0 },
        [bitmap]
      );
      /* keep at most four frames in flight so memory stays flat */
      if (handle.inflight > 4) await new Promise((resolve) => setTimeout(resolve, 0));
      handle.inflight = 0;
      if (i % 4 === 0) options.onProgress?.('video', i / totalFrames);
    }

    if (audioBuffer) {
      const left = audioBuffer.getChannelData(0).slice();
      const right = (audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0)).slice();
      worker.postMessage({ type: 'audio', left, right, sampleRate: audioBuffer.sampleRate }, [left.buffer, right.buffer]);
    }

    worker.postMessage({ type: 'finish' });
    const result = await done;
    worker.terminate();

    return {
      blob: new Blob([result.buffer], { type: 'video/mp4' }),
      filename: `${slug(project.title)}.mp4`,
      width,
      height,
      duration,
      fps,
      hasAudio: result.hasAudio,
      codec: videoConfig.codec
    };
  } finally {
    worker.terminate();
  }
}

/**
 * Public entry point. Uses the worker when the browser can run one, and falls
 * back to encoding on the main thread when it cannot. A failure *after* the
 * worker has started is not retried — that would render every frame twice.
 */
export async function exportMP4(options: ExportOptions & { mainThread?: boolean }): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new ExportUnsupportedError('This browser has no WebCodecs video encoder. Use the WebM recorder instead.');
  }
  if (!options.mainThread && typeof Worker !== 'undefined') {
    try {
      return await exportMP4InWorker(options);
    } catch (err) {
      if (!(err instanceof ExportUnsupportedError)) throw err;
      /* the worker could not be started at all — the main thread will do */
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

  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
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
  await done;
  if (audioCtx) await audioCtx.close();
  stream.getTracks().forEach((track) => track.stop());

  return {
    blob: new Blob(chunks, { type: mimeType }),
    filename: `${slug(project.title)}.webm`,
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

