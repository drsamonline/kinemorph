import { useState } from 'react';
import { totalDuration, type Project } from '@kinemorph/core';
import type { SceneRenderer } from '@kinemorph/renderer';
import { renderScoreOffline } from '@kinemorph/audio';
import { ASPECTS, type AspectId } from '@kinemorph/renderer';
import {
  ExportUnsupportedError, downloadBlob, encodeWav, exportMP4, recordWebM, sizeForAspect, wavFilename
} from '@kinemorph/export';

type Phase = 'idle' | 'audio' | 'video' | 'muxing' | 'done' | 'error';

export function ExportPanel({
  renderer, project, onClose
}: {
  renderer: SceneRenderer;
  project: Project;
  onClose: () => void;
}) {
  const [container, setContainer] = useState<'mp4' | 'webm'>('mp4');
  const [aspect, setAspect] = useState<AspectId>('16:9');
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState<'720' | '1080'>('720');
  const [withAudio, setWithAudio] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const duration = totalDuration(project);

  const downloadStems = async () => {
    setPhase('audio');
    setProgress(0);
    setMessage('');
    try {
      const audio = await renderScoreOffline(project.mood, duration);
      if (!audio) {
        setPhase('error');
        setMessage('This show has no score — the mood is Silent.');
        return;
      }
      downloadBlob(encodeWav(audio), wavFilename(project));
      setPhase('done');
      setMessage(`${wavFilename(project)} — 16-bit PCM, ${(audio.sampleRate / 1000).toFixed(1)} kHz`);
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Could not render the score');
    }
  };

  const run = async (mode: 'mp4' | 'webm' | 'record') => {
    setPhase('audio');
    setProgress(0);
    setMessage('');
    try {
      const audio = withAudio ? await renderScoreOffline(project.mood, duration) : null;

      if (mode === 'record') {
        const result = await recordWebM({
          renderer,
          project,
          audio,
          onProgress: (_p, value) => { setPhase('video'); setProgress(value); }
        });
        downloadBlob(result.blob, result.filename);
        setPhase('done');
        setMessage(`${result.filename} — ${(result.blob.size / 1e6).toFixed(1)} MB, ${result.hasAudio ? 'with audio' : 'silent'}`);
        return;
      }

      const size = sizeForAspect(aspect, resolution === '1080' ? 1920 : 1280);
      const result = await exportMP4({
        renderer,
        project,
        container,
        aspect,
        fps,
        width: size.width,
        height: size.height,
        audio,
        onProgress: (stage, value) => {
          setPhase(stage);
          setProgress(value);
        }
      });
      downloadBlob(result.blob, result.filename);
      setPhase('done');
      setMessage(
        `${result.filename} — ${(result.blob.size / 1e6).toFixed(1)} MB, ${result.width}x${result.height}, ` +
        `${result.codec}` +
        (result.hasAudio
          ? ` + ${result.audioCodec ?? 'audio'}`
          : ` — silent: ${result.audioError ?? 'unknown reason'}`)
      );
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof ExportUnsupportedError ? err.message : err instanceof Error ? err.message : 'Export failed');
    }
  };

  const busy = phase === 'audio' || phase === 'video' || phase === 'muxing';

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-card export">
        <header>
          <h1>Export video</h1>
          <p>
            {duration.toFixed(1)} seconds · {Math.round(duration * fps)} frames · rendered frame by frame,
            not screen-recorded.
          </p>
        </header>

        <div className="row three">
          <label className="field">Aspect
            <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectId)} disabled={busy}>
              {(Object.keys(ASPECTS) as AspectId[]).map((k) => (
                <option key={k} value={k}>{ASPECTS[k].label}</option>
              ))}
            </select>
          </label>
          <label className="field">Format
            <select value={container} onChange={(e) => setContainer(e.target.value as 'mp4' | 'webm')} disabled={busy}>
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
          </label>
          <label className="field">Frame rate
            <select value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={busy}>
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>
          <label className="field">Resolution
            <select value={resolution} onChange={(e) => setResolution(e.target.value as '720' | '1080')} disabled={busy}>
              <option value="720">1280 × 720</option>
              <option value="1080">1920 × 1080</option>
            </select>
          </label>
          <label className="field">Audio
            <select value={withAudio ? 'on' : 'off'} onChange={(e) => setWithAudio(e.target.value === 'on')} disabled={busy}>
              <option value="on">Include score</option>
              <option value="off">Silent</option>
            </select>
          </label>
        </div>

        {busy && (
          <div className="progress">
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <span>{phase === 'audio' ? 'Mixing the score…' : phase === 'video' ? `Rendering frames… ${Math.round(progress * 100)}%` : 'Writing the file…'}</span>
          </div>
        )}

        {message && <p className={`result ${phase}`}>{message}</p>}

        <footer>
          <button className="primary" onClick={() => run('mp4')} disabled={busy}>
            Export {container.toUpperCase()}
          </button>
          <button className="ghost" onClick={downloadStems} disabled={busy}>Download WAV</button>
          <button className="ghost" onClick={() => run('record')} disabled={busy}>Record (real time)</button>
          <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
        </footer>
        <p className="hint">
          The main export renders every frame exactly. <strong>Download WAV</strong> gives you the score as
          16-bit PCM — the reliable way to get audio into a desktop editor, since some of them ignore
          Opus inside MP4. <strong>Record</strong> is the real-time fallback for browsers without a
          video encoder.
        </p>
      </div>
    </div>
  );
}
