import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

/**
 * Encoding worker.
 *
 * The renderer has to stay on the main thread — that is where the WebGL context
 * lives — but everything after the pixels are grabbed does not. Encoding and
 * muxing move here so the editor keeps painting while a long export runs.
 *
 * Frames arrive as transferable ImageBitmaps, which are zero-copy.
 */

export interface WorkerVideoConfig {
  codec: string;
  muxCodec: 'avc' | 'vp9';
  width: number;
  height: number;
  bitrate: number;
  fps: number;
}

export interface WorkerAudioConfig {
  codec: AudioEncoderConfig;
  muxCodec: 'aac' | 'opus';
  sampleRate: number;
}

type InMessage =
  | { type: 'init'; video: WorkerVideoConfig; audio: WorkerAudioConfig | null }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; keyFrame: boolean }
  | { type: 'audio'; left: Float32Array; right: Float32Array; sampleRate: number }
  | { type: 'finish' };

type OutMessage =
  | { type: 'progress'; phase: 'video' | 'audio' | 'muxing'; value: number }
  | { type: 'done'; buffer: ArrayBuffer; hasAudio: boolean; audioError?: string }
  | { type: 'error'; message: string };

const scope = self as unknown as {
  postMessage: (message: OutMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
};

let muxer: Muxer<ArrayBufferTarget> | null = null;
let videoEncoder: VideoEncoder | null = null;
let audioEncoder: AudioEncoder | null = null;
let failure: Error | null = null;
let framesEncoded = 0;
let audioDone = false;

function send(message: OutMessage, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = async (event: MessageEvent<InMessage>) => {
  const message = event.data;

  try {
    if (message.type === 'init') {
      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: message.video.muxCodec,
          width: message.video.width,
          height: message.video.height,
          frameRate: message.video.fps
        },
        audio: message.audio
          ? {
              codec: message.audio.muxCodec,
              sampleRate: message.audio.sampleRate,
              numberOfChannels: 2
            }
          : undefined,
        fastStart: 'in-memory'
      });

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          try { muxer?.addVideoChunk(chunk, meta); } catch (err) { failure = err as Error; }
        },
        error: (err) => { failure = err; }
      });
      videoEncoder.configure({
        codec: message.video.codec,
        width: message.video.width,
        height: message.video.height,
        bitrate: message.video.bitrate,
        framerate: message.video.fps
      });

      if (message.audio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            try { muxer?.addAudioChunk(chunk, meta); } catch (err) { failure = err as Error; }
          },
          error: (err) => { failure = err; }
        });
        audioEncoder.configure(message.audio.codec);
      }
      return;
    }

    if (message.type === 'frame') {
      if (failure) throw failure;
      if (!videoEncoder) throw new Error('encoder not configured');
      const frame = new VideoFrame(message.bitmap, {
        timestamp: message.timestamp,
        duration: Math.round(1e6 / 30)
      });
      videoEncoder.encode(frame, { keyFrame: message.keyFrame });
      frame.close();
      message.bitmap.close();
      framesEncoded++;
      if (framesEncoded % 8 === 0) send({ type: 'progress', phase: 'video', value: framesEncoded });
      return;
    }

    if (message.type === 'audio') {
      /* encoded on the main thread hand-off so the worker stays simple */
      const total = message.left.length;
      if (!audioEncoder) throw new Error('audio encoder not configured');
      const chunk = 4096;
      for (let offset = 0; offset < total; offset += chunk) {
        const count = Math.min(chunk, total - offset);
        const interleaved = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
          interleaved[i * 2] = message.left[offset + i];
          interleaved[i * 2 + 1] = message.right[offset + i];
        }
        const data = new AudioData({
          format: 'f32',
          sampleRate: message.sampleRate,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((offset / message.sampleRate) * 1e6),
          data: interleaved
        });
        audioEncoder.encode(data);
        data.close();
        if (audioEncoder.encodeQueueSize > 16) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      await audioEncoder.flush();
      audioEncoder.close();
      audioEncoder = null;
      audioDone = true;
      send({ type: 'progress', phase: 'audio', value: 1 });
      return;
    }

    if (message.type === 'finish') {
      if (failure) throw failure;
      await videoEncoder?.flush();
      videoEncoder?.close();
      videoEncoder = null;
      if (!muxer) throw new Error('nothing to finish');
      send({ type: 'progress', phase: 'muxing', value: 0 });
      muxer.finalize();
      const buffer = (muxer.target as ArrayBufferTarget).buffer;
      muxer = null;
      send({ type: 'progress', phase: 'muxing', value: 1 });
      send({ type: 'done', buffer, hasAudio: audioDone }, [buffer]);
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
