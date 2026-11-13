import {
  AudioSample, AudioSampleSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality
} from 'mediabunny';

/**
 * Encoding worker.
 *
 * The renderer stays on the main thread — that is where the WebGL context
 * lives — but everything after the pixels are grabbed happens here: an
 * OffscreenCanvas receives each frame as a transferable ImageBitmap, and
 * Mediabunny encodes and muxes it.
 *
 * Messages are processed strictly in order through a promise chain, so a fast
 * producer can never reorder frames.
 */

export interface WorkerConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  videoCodec: 'avc' | 'vp9';
  audioCodec: 'aac' | 'opus' | null;
  sampleRate: number;
}

type InMessage =
  | { type: 'init'; config: WorkerConfig }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; duration: number }
  | { type: 'audio'; left: Float32Array; right: Float32Array; sampleRate: number }
  | { type: 'finish' };

type OutMessage =
  | { type: 'progress'; phase: 'video' | 'audio' | 'muxing'; value: number }
  | { type: 'frame-done' }
  | { type: 'done'; buffer: ArrayBuffer; hasAudio: boolean }
  | { type: 'error'; message: string };

const scope = self as unknown as {
  postMessage: (message: OutMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
};

let output: Output | null = null;
let videoSource: CanvasSource | null = null;
let audioSource: AudioSampleSource | null = null;
let surface: OffscreenCanvas | null = null;
let surfaceCtx: OffscreenCanvasRenderingContext2D | null = null;
let config: WorkerConfig | null = null;
let audioDone = false;

const send = (message: OutMessage, transfer?: Transferable[]) => scope.postMessage(message, transfer);

async function handle(message: InMessage): Promise<void> {
  if (message.type === 'init') {
    config = message.config;
    surface = new OffscreenCanvas(config.width, config.height);
    const ctx = surface.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context in the worker');
    surfaceCtx = ctx as OffscreenCanvasRenderingContext2D;
    surfaceCtx.imageSmoothingEnabled = true;
    surfaceCtx.imageSmoothingQuality = 'high';

    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    videoSource = new CanvasSource(surface, {
      codec: config.videoCodec,
      quality: new Quality({ bitrate: config.bitrate })
    });
    output.addVideoTrack(videoSource, { frameRate: config.fps });

    if (config.audioCodec) {
      audioSource = new AudioSampleSource({
        codec: config.audioCodec,
        quality: new Quality({ bitrate: 128_000 })
      });
      output.addAudioTrack(audioSource);
    }

    await output.start();
    return;
  }

  if (message.type === 'frame') {
    if (!videoSource || !surfaceCtx) throw new Error('worker not initialised');
    surfaceCtx.drawImage(message.bitmap, 0, 0);
    message.bitmap.close();
    await videoSource.add(message.timestamp, message.duration);
    send({ type: 'frame-done' });
    return;
  }

  if (message.type === 'audio') {
    if (!audioSource) return;
    send({ type: 'progress', phase: 'audio', value: 0 });
    const total = message.left.length;
    const chunk = 4096;
    for (let offset = 0; offset < total; offset += chunk) {
      const count = Math.min(chunk, total - offset);
      const interleaved = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        interleaved[i * 2] = message.left[offset + i];
        interleaved[i * 2 + 1] = message.right[offset + i];
      }
      const sample = new AudioSample(
        new AudioData({
          format: 'f32',
          sampleRate: message.sampleRate,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((offset / message.sampleRate) * 1e6),
          data: interleaved
        })
      );
      await audioSource.add(sample);
      sample.close();
    }
    audioDone = true;
    send({ type: 'progress', phase: 'audio', value: 1 });
    return;
  }

  if (message.type === 'finish') {
    if (!output) throw new Error('nothing to finish');
    send({ type: 'progress', phase: 'muxing', value: 0 });
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('the muxer produced no data');
    send({ type: 'progress', phase: 'muxing', value: 1 });
    send({ type: 'done', buffer, hasAudio: audioDone }, [buffer]);
  }
}

/* one message at a time, in order */
let chain: Promise<void> = Promise.resolve();
scope.onmessage = (event: MessageEvent<InMessage>) => {
  chain = chain
    .then(() => handle(event.data))
    .catch((err: unknown) => {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    });
};
