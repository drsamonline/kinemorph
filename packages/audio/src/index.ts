import * as Tone from 'tone';
import type { MoodId } from '@kinemorph/core';

/**
 * The score is generated as data first (`buildScore`) and rendered twice:
 * once through Tone.js for live playback, once through a plain
 * OfflineAudioContext for export. Keeping the note list pure is what lets the
 * exported audio match the preview — the same events, two renderers.
 */

export interface MoodDef {
  label: string;
  bpm: number;
  root: number;
  scale: number[];
  progression: number[][];
  drums: 'four' | 'big' | 'soft' | 'sparse' | 'none';
  arp: number;
  pad: number;
  swing: number;
}

export const MOODS: Record<MoodId, MoodDef> = {
  uplifting: { label: 'Uplifting', bpm: 116, root: 57, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [3, 5, 7], [4, 6, 1], [3, 5, 0]], drums: 'four', arp: 1, pad: 0.55, swing: 0 },
  calm: { label: 'Calm', bpm: 74, root: 53, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [3, 5, 0], [1, 3, 5], [3, 5, 0]], drums: 'none', arp: 0.7, pad: 0.75, swing: 0 },
  epic: { label: 'Epic', bpm: 96, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], progression: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], drums: 'big', arp: 1, pad: 0.6, swing: 0 },
  playful: { label: 'Playful', bpm: 132, root: 60, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [4, 6, 1], [3, 5, 0], [4, 6, 3]], drums: 'four', arp: 1.2, pad: 0.4, swing: 0.1 },
  tense: { label: 'Tense', bpm: 104, root: 45, scale: [0, 1, 4, 5, 7, 8], progression: [[0, 2, 4], [0, 3, 5], [1, 3, 5], [0, 2, 4]], drums: 'sparse', arp: 0.6, pad: 0.7, swing: 0 },
  lofi: { label: 'Lo-fi', bpm: 84, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], progression: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [3, 5, 0]], drums: 'soft', arp: 0.9, pad: 0.6, swing: 0.16 },
  none: { label: 'Silent', bpm: 0, root: 57, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4]], drums: 'none', arp: 0, pad: 0, swing: 0 }
};

export const MOOD_LIST = Object.keys(MOODS) as MoodId[];

export type Voice = 'pad' | 'bass' | 'pluck' | 'kick' | 'hat' | 'snare';

export interface NoteEvent {
  time: number;
  dur: number;
  midi: number;
  voice: Voice;
  gain: number;
}

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function degreeToMidi(root: number, scale: number[], degree: number): number {
  const octave = Math.floor(degree / scale.length);
  const index = ((degree % scale.length) + scale.length) % scale.length;
  return root + 12 * octave + scale[index];
}

/** Pure: mood + duration -> note events. Deterministic for a given seed. */
export function buildScore(moodId: MoodId, seconds: number, seed = 1): NoteEvent[] {
  const mood = MOODS[moodId];
  if (!mood || mood.bpm === 0) return [];

  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const stepDur = 60 / mood.bpm / 4;
  const steps = Math.ceil(seconds / stepDur);
  const events: NoteEvent[] = [];

  for (let step = 0; step < steps; step++) {
    const time = step * stepDur;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chordIndex = Math.floor(bar / 2) % mood.progression.length;
    const chord = mood.progression[chordIndex].map((d) => degreeToMidi(mood.root, mood.scale, d));
    const swing = inBar % 2 === 1 ? stepDur * mood.swing : 0;

    if (inBar === 0) {
      for (const note of chord) {
        events.push({ time, dur: stepDur * 8, midi: note, voice: 'pad', gain: 0.05 * (mood.pad || 0.5) });
      }
    }

    if (inBar === 0 || inBar === 6 || inBar === 8 || inBar === 14) {
      events.push({ time, dur: stepDur * 3, midi: chord[0] - 12, voice: 'bass', gain: 0.16 });
    }

    if (mood.arp > 0 && inBar % 2 === 0) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const note = chord[seq[(step / 2) % seq.length] % chord.length] + 12;
      events.push({ time: time + swing, dur: stepDur * 2, midi: note, voice: 'pluck', gain: 0.05 * mood.arp });
      if (inBar % 4 === 0 && rand() > 0.55) {
        events.push({ time: time + swing, dur: stepDur, midi: chord[0] + 24, voice: 'pluck', gain: 0.024 });
      }
    }

    const drums = mood.drums;
    if (drums === 'four') {
      if (inBar % 4 === 0) events.push({ time, dur: 0.22, midi: 36, voice: 'kick', gain: 0.42 });
      if (inBar % 4 === 2) events.push({ time, dur: 0.05, midi: 42, voice: 'hat', gain: 0.05 });
      if (inBar === 4 || inBar === 12) events.push({ time, dur: 0.16, midi: 38, voice: 'snare', gain: 0.1 });
    } else if (drums === 'big') {
      if (inBar === 0 || inBar === 8 || inBar === 11) events.push({ time, dur: 0.24, midi: 36, voice: 'kick', gain: 0.45 });
      if (inBar === 4 || inBar === 12) events.push({ time, dur: 0.18, midi: 38, voice: 'snare', gain: 0.12 });
      if (inBar % 4 === 2) events.push({ time, dur: 0.05, midi: 42, voice: 'hat', gain: 0.055 });
    } else if (drums === 'soft') {
      if (inBar === 0 || inBar === 10) events.push({ time, dur: 0.22, midi: 36, voice: 'kick', gain: 0.34 });
      if (inBar === 8) events.push({ time, dur: 0.16, midi: 38, voice: 'snare', gain: 0.09 });
      if (inBar % 4 === 2) events.push({ time, dur: 0.05, midi: 42, voice: 'hat', gain: 0.032 });
    } else if (drums === 'sparse') {
      if (inBar === 0) events.push({ time, dur: 0.22, midi: 36, voice: 'kick', gain: 0.36 });
      if (inBar === 12) events.push({ time, dur: 0.05, midi: 42, voice: 'hat', gain: 0.038 });
    }
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* Live playback (Tone.js)                                             */
/* ------------------------------------------------------------------ */

export class LiveScore {
  private pad: Tone.PolySynth | null = null;
  private pluck: Tone.PolySynth | null = null;
  private bass: Tone.MonoSynth | null = null;
  private kick: Tone.MembraneSynth | null = null;
  private hat: Tone.NoiseSynth | null = null;
  private snare: Tone.NoiseSynth | null = null;
  private reverb: Tone.Reverb | null = null;
  private part: Tone.Part | null = null;
  private mood: MoodId = 'uplifting';
  private running = false;

  private build(): void {
    if (this.pad) return;
    this.reverb = new Tone.Reverb({ decay: 2.4, wet: 0.32 }).toDestination();
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.8, decay: 0.4, sustain: 0.6, release: 1.2 }
    }).connect(this.reverb);
    this.pad.volume.value = -16;

    this.pluck = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.2 }
    }).connect(this.reverb);
    this.pluck.volume.value = -14;

    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 1 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, baseFrequency: 220, octaves: 2 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 }
    }).toDestination();
    this.bass.volume.value = -12;

    this.kick = new Tone.MembraneSynth().toDestination();
    this.kick.volume.value = -6;
    this.hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 } }).toDestination();
    this.hat.volume.value = -22;
    this.snare = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).toDestination();
    this.snare.volume.value = -18;
  }

  async start(mood: MoodId, duration: number): Promise<void> {
    if (mood === 'none') return;
    await Tone.start();
    this.build();
    this.stop();
    this.mood = mood;

    const events = buildScore(mood, duration);
    this.part = new Tone.Part((time, ev: NoteEvent) => {
      const hz = midiToHz(ev.midi);
      switch (ev.voice) {
        case 'pad': this.pad?.triggerAttackRelease(hz, ev.dur, time, 0.5); break;
        case 'pluck': this.pluck?.triggerAttackRelease(hz, ev.dur, time, 0.6); break;
        case 'bass': this.bass?.triggerAttackRelease(hz, ev.dur, time, 0.7); break;
        case 'kick': this.kick?.triggerAttackRelease('C1', ev.dur, time); break;
        case 'hat': this.hat?.triggerAttackRelease(ev.dur, time); break;
        case 'snare': this.snare?.triggerAttackRelease(ev.dur, time); break;
      }
    }, events.map((e) => [e.time, e] as [number, NoteEvent]));
    this.part.loop = true;
    this.part.loopEnd = duration;
    this.part.start(0);

    Tone.getTransport().bpm.value = MOODS[mood].bpm;
    Tone.getTransport().start();
    this.running = true;
  }

  stop(): void {
    if (this.part) { this.part.stop(); this.part.dispose(); this.part = null; }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    this.running = false;
  }

  setMuted(muted: boolean): void {
    Tone.getDestination().mute = muted;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentMood(): MoodId {
    return this.mood;
  }
}

/* ------------------------------------------------------------------ */
/* Offline mixdown (used by the exporter)                              */
/* ------------------------------------------------------------------ */

/**
 * Renders the same note events into an AudioBuffer with a plain
 * OfflineAudioContext — no Tone, no transport, sample-accurate, and identical
 * on every run. This is the audio half of a deterministic export.
 */
export async function renderScoreOffline(moodId: MoodId, seconds: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  const mood = MOODS[moodId];
  if (!mood || mood.bpm === 0) return null;

  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const events = buildScore(moodId, seconds);

  const master = ctx.createGain();
  master.gain.value = 0.9;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.25;

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 2.2, 2.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  convolver.connect(wet);
  wet.connect(master);

  master.connect(compressor);
  compressor.connect(ctx.destination);

  const noiseBuffer = makeNoise(ctx, 1.2);

  for (const ev of events) {
    const t = ev.time;
    switch (ev.voice) {
      case 'pad': {
        for (const detune of [-6, 7]) {
          const osc = ctx.createOscillator();
          osc.type = detune < 0 ? 'triangle' : 'sawtooth';
          osc.frequency.value = midiToHz(ev.midi);
          osc.detune.value = detune;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 950;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(ev.gain, t + 0.9);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur);
          osc.connect(filter); filter.connect(gain); gain.connect(master); gain.connect(convolver);
          osc.start(t); osc.stop(t + ev.dur + 0.1);
        }
        break;
      }
      case 'pluck': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToHz(ev.midi);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 4200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(ev.gain, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur);
        osc.connect(filter); filter.connect(gain); gain.connect(master); gain.connect(convolver);
        osc.start(t); osc.stop(t + ev.dur + 0.05);
        break;
      }
      case 'bass': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(ev.midi);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(ev.gain, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur);
        osc.connect(filter); filter.connect(gain); gain.connect(master);
        osc.start(t); osc.stop(t + ev.dur + 0.05);
        break;
      }
      case 'kick': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(44, t + 0.13);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(ev.gain, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain); gain.connect(master);
        osc.start(t); osc.stop(t + 0.25);
        break;
      }
      case 'hat':
      case 'snare': {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = ev.voice === 'hat' ? 'highpass' : 'bandpass';
        filter.frequency.value = ev.voice === 'hat' ? 8200 : 1900;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(ev.gain, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur + 0.05);
        src.connect(filter); filter.connect(gain); gain.connect(master);
        if (ev.voice === 'snare') gain.connect(convolver);
        src.start(t); src.stop(t + ev.dur + 0.08);
        break;
      }
    }
  }

  return ctx.startRendering();
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
