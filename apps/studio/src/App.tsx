import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECTS, ASPECT_IDS, EASE_IDS, ENTER_IDS, MOTIF_IDS, MOTIF_LABELS, MOOD_IDS, STYLE_LIST, STYLES,
  TRANSITION_IDS, CAM_IDS, accentFor, buildCues, contrastRatio, formatTime,
  studioSelectors, totalDuration, useStudio, type Scene
} from '@kinemorph/core';
import { SceneRenderer } from '@kinemorph/renderer';
import { LiveScore, MOODS } from '@kinemorph/audio';
import { Stage } from './Stage';
import { Wizard } from './Wizard';
import { ExportPanel } from './ExportPanel';

export function App() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const playing = useStudio((s) => s.playing);
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const setPlaying = useStudio((s) => s.setPlaying);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const error = useStudio((s) => s.error);
  const clearError = useStudio((s) => s.clearError);
  const replaceProject = useStudio((s) => s.replaceProject);
  const past = useStudio((s) => s.past);
  const future = useStudio((s) => s.future);

  const [renderer, setRenderer] = useState<SceneRenderer | null>(null);
  const [showWizard, setShowWizard] = useState(() => !localStorage.getItem('kinemorph.project.v1'));
  const [showExport, setShowExport] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(64);

  const timeRef = useRef(0);
  const headRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<LiveScore | null>(null);
  const duration = totalDuration(project);
  const selected = project.scenes.find((s) => s.id === selection[0]) ?? project.scenes[0];

  /* ---------------- render + transport ---------------- */

  const paint = useCallback(
    (time: number) => {
      if (!renderer) return;
      renderer.render(project, time);
      if (headRef.current) {
        const pct = duration ? (time / duration) * 100 : 0;
        headRef.current.style.left = `${pct}%`;
      }
      if (labelRef.current) labelRef.current.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    },
    [renderer, project, duration]
  );

  useEffect(() => {
    if (!playing) paint(timeRef.current);
  }, [paint, playing, project]);

  useEffect(() => {
    if (!playing || !renderer) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      timeRef.current += delta;
      if (timeRef.current >= duration) timeRef.current = 0;
      paint(timeRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, renderer, duration, paint]);

  useEffect(() => {
    if (!renderer) return;
    renderer.setStyle(STYLES[project.style]);
    paint(timeRef.current);
  }, [renderer, project.style, paint]);

  /* ---------------- audio ---------------- */

  useEffect(() => {
    const score = new LiveScore();
    scoreRef.current = score;
    return () => {
      score.stop();
      scoreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (playing) {
      void score.start(project.mood, duration);
    } else {
      score.stop();
    }
  }, [playing, project.mood, duration]);

  useEffect(() => {
    scoreRef.current?.setMuted(muted);
  }, [muted]);

  /* ---------------- transport actions ---------------- */

  const seek = useCallback(
    (time: number) => {
      timeRef.current = Math.max(0, Math.min(time, duration - 0.001));
      paint(timeRef.current);
      setPlayhead(timeRef.current);
    },
    [duration, paint, setPlayhead]
  );

  const togglePlay = useCallback(() => {
    setPlaying(!playing);
  }, [playing, setPlaying]);

  const jumpScene = useCallback(
    (direction: 1 | -1) => {
      const cues = buildCues(project);
      const index = cues.findIndex((c) => timeRef.current < c.end);
      const next = Math.max(0, Math.min(cues.length - 1, (index < 0 ? 0 : index) + direction));
      seek(cues[next].start);
      select([cues[next].scene.id]);
    },
    [project, seek, select]
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      if (event.code === 'ArrowRight') { event.preventDefault(); jumpScene(1); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); jumpScene(-1); }
      if (event.key === 'e') setShowExport(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, jumpScene, undo, redo]);

  const updateScene = useCallback(
    (id: string, patch: Partial<Scene>) => dispatch({ type: 'scene.update', id, patch }),
    [dispatch]
  );

  const cues = useMemo(() => buildCues(project), [project]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Kine<span>morph</span>
        </div>
        <select
          className="aspect-select"
          value={project.aspect}
          onChange={(e) => dispatch({ type: 'project.patch', patch: { aspect: e.target.value as typeof project.aspect } })}
          title="Output format"
        >
          {ASPECT_IDS.map((id) => (
            <option key={id} value={id}>{ASPECTS[id].label}</option>
          ))}
        </select>
        <input
          className="title-input"
          value={project.title}
          onChange={(e) => dispatch({ type: 'project.patch', patch: { title: e.target.value } })}
          aria-label="Project title"
        />
        <button className="icon" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">↶</button>
        <button className="icon" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">↷</button>
        <div className="spacer" />
        <button className="ghost" onClick={() => setMuted((m) => !m)}>{muted ? 'Sound off' : 'Sound on'}</button>
        <button className="ghost" onClick={() => setShowWizard(true)}>New show</button>
        <button className="primary" onClick={() => setShowExport(true)}>Export video</button>
      </header>

      <aside className="left">
        <div className="pane-head">
          Scenes
          <button
            className="icon small"
            title="Add scene"
            onClick={() =>
              dispatch({
                type: 'scenes.replace',
                scenes: [
                  ...project.scenes,
                  {
                    id: 's_' + Math.random().toString(36).slice(2, 9),
                    title: 'New scene',
                    body: 'Write something here.',
                    motif: MOTIF_IDS[project.scenes.length % MOTIF_IDS.length],
                    dur: 5,
                    layout: 'split',
                    transition: 'morph',
                    enter: 'rise',
                    ease: 'back',
                    cam: 'in',
                    accent: accentFor(project.scenes.length, project.style)
                  }
                ]
              })
            }
          >
            +
          </button>
        </div>
        <div className="scene-list">
          {project.scenes.map((scene, index) => (
            <button
              key={scene.id}
              className={`scene-item ${scene.id === selected?.id ? 'sel' : ''}`}
              onClick={() => {
                select([scene.id]);
                seek(cues[index]?.start ?? 0);
              }}
            >
              <span className="num">{index + 1}</span>
              <span className="meta">
                <span className="t">{scene.title || 'Untitled'}</span>
                <span className="s">
                  {scene.motif} · {scene.dur.toFixed(1)}s · {scene.enter}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="pane-head">Look</div>
        <div className="styles">
          {STYLE_LIST.map((style) => (
            <button
              key={style.id}
              className={`swatch ${project.style === style.id ? 'on' : ''}`}
              onClick={() => {
                dispatch({ type: 'project.patch', patch: { style: style.id } });
                project.scenes.forEach((scene, index) =>
                  dispatch({
                    type: 'scene.update',
                    id: scene.id,
                    patch: { accent: accentFor(index, style.id) }
                  })
                );
              }}
            >
              <i style={{ background: style.palette.accents[0] }} />
              {style.name.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="pane-head">Score</div>
        <select
          value={project.mood}
          onChange={(e) => dispatch({ type: 'project.patch', patch: { mood: e.target.value as typeof project.mood } })}
        >
          {MOOD_IDS.map((id) => (
            <option key={id} value={id}>{MOODS[id].label}</option>
          ))}
        </select>
      </aside>

      <main className="center">
        <Stage onReady={setRenderer} />
        <div className="transport">
          <button className="icon" onClick={() => jumpScene(-1)} title="Previous scene">⏮</button>
          <button className="icon play" onClick={togglePlay} title="Play / pause">{playing ? '❚❚' : '▶'}</button>
          <button className="icon" onClick={() => jumpScene(1)} title="Next scene">⏭</button>
          <span className="time" ref={labelRef}>0:00 / 0:00</span>
          <div className="spacer" />
          <label className="mini">
            Zoom
            <input
              type="range"
              min={24}
              max={180}
              value={pxPerSecond}
              onChange={(e) => setPxPerSecond(Number(e.target.value))}
            />
          </label>
        </div>
        <Timeline
          cues={cues}
          selectedId={selected?.id}
          pxPerSecond={pxPerSecond}
          headRef={headRef}
          onSeek={seek}
          onSelect={(id) => select([id])}
          onTrim={(id, dur) => updateScene(id, { dur })}
        />
      </main>

      <aside className="right">
        {selected && (
          <Inspector
            scene={selected}
            styleId={project.style}
            onChange={(patch) => updateScene(selected.id, patch)}
            onDelete={() => dispatch({ type: 'scene.remove', id: selected.id })}
            onDuplicate={() => dispatch({ type: 'scene.duplicate', id: selected.id })}
            onMove={(to) => dispatch({ type: 'scene.move', id: selected.id, to })}
            index={project.scenes.findIndex((s) => s.id === selected.id)}
            count={project.scenes.length}
          />
        )}
      </aside>

      {error && (
        <div className="toast" onClick={clearError}>
          {error} <span>dismiss</span>
        </div>
      )}

      {showWizard && (
        <Wizard
          onClose={() => setShowWizard(false)}
          onCreate={(next) => {
            replaceProject(next);
            setShowWizard(false);
            timeRef.current = 0;
            paint(0);
          }}
        />
      )}

      {showExport && renderer && (
        <ExportPanel
          renderer={renderer}
          project={project}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Timeline({
  cues, selectedId, pxPerSecond, headRef, onSeek, onSelect, onTrim
}: {
  cues: ReturnType<typeof buildCues>;
  selectedId?: string;
  pxPerSecond: number;
  headRef: React.RefObject<HTMLDivElement>;
  onSeek: (time: number) => void;
  onSelect: (id: string) => void;
  onTrim: (id: string, dur: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startDur: number } | null>(null);

  const timeFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left) / pxPerSecond);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (event.clientX - drag.startX) / pxPerSecond;
      onTrim(drag.id, Math.max(1, Math.min(30, drag.startDur + delta)));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [pxPerSecond, onTrim]);

  return (
    <div className="timeline">
      <div
        className="track"
        ref={trackRef}
        style={{ width: cues.length ? cues[cues.length - 1].end * pxPerSecond + 40 : 0 }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).dataset.seg) return;
          onSeek(timeFromEvent(event.clientX));
        }}
      >
        {cues.map((cue) => (
          <div
            key={cue.scene.id}
            data-seg="1"
            className={`seg ${cue.scene.id === selectedId ? 'sel' : ''}`}
            style={{ left: cue.start * pxPerSecond, width: Math.max(8, (cue.end - cue.start) * pxPerSecond - 2) }}
            onPointerDown={() => onSelect(cue.scene.id)}
          >
            <span>{cue.index + 1}</span>
            <i
              className="handle"
              onPointerDown={(event) => {
                event.stopPropagation();
                dragRef.current = { id: cue.scene.id, startX: event.clientX, startDur: cue.scene.dur };
              }}
            />
          </div>
        ))}
        <div className="playhead" ref={headRef} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Inspector({
  scene, styleId, index, count, onChange, onDelete, onDuplicate, onMove
}: {
  scene: Scene;
  styleId: keyof typeof STYLES;
  index: number;
  count: number;
  onChange: (patch: Partial<Scene>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (to: number) => void;
}) {
  const contrast = contrastRatio(scene.accent, STYLES[styleId].palette.bg);
  return (
    <div className="inspector">
      <div className="pane-head">Scene #{index + 1}</div>

      <label className="field">Title
        <input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      <label className="field">Text
        <textarea rows={4} value={scene.body} onChange={(e) => onChange({ body: e.target.value })} />
      </label>

      <label className="field">Visual
        <select value={scene.motif} onChange={(e) => onChange({ motif: e.target.value as Scene['motif'] })}>
          {MOTIF_IDS.map((id) => <option key={id} value={id}>{MOTIF_LABELS[id]}</option>)}
        </select>
      </label>

      <div className="row">
        <label className="field">Entrance
          <select value={scene.enter} onChange={(e) => onChange({ enter: e.target.value as Scene['enter'] })}>
            {ENTER_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="field">Easing
          <select value={scene.ease} onChange={(e) => onChange({ ease: e.target.value as Scene['ease'] })}>
            {EASE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>

      <div className="row">
        <label className="field">Layout
          <select value={scene.layout} onChange={(e) => onChange({ layout: e.target.value as Scene['layout'] })}>
            <option value="split">Text + visual</option>
            <option value="center">Centered</option>
          </select>
        </label>
        <label className="field">Camera
          <select value={scene.cam} onChange={(e) => onChange({ cam: e.target.value as Scene['cam'] })}>
            {CAM_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>

      <label className="field">Duration — {scene.dur.toFixed(1)}s
        <input
          type="range" min={1} max={20} step={0.5} value={scene.dur}
          onChange={(e) => onChange({ dur: Number(e.target.value) })}
        />
      </label>

      <label className="field">Transition
        <select value={scene.transition} onChange={(e) => onChange({ transition: e.target.value as Scene['transition'] })}>
          {TRANSITION_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>

      <label className="field">
        Accent{' '}
        <span
          className={`contrast ${contrast >= 3 ? 'ok' : 'low'}`}
          title="Contrast against the background. Below 3:1 the artwork is hard to see."
        >
          {contrast.toFixed(1)}:1
        </span>
        <input type="color" value={scene.accent} onChange={(e) => onChange({ accent: e.target.value })} />
      </label>

      <div className="row buttons">
        <button className="ghost" onClick={onDuplicate}>Duplicate</button>
        <button className="ghost" onClick={() => onMove(Math.max(0, index - 1))} disabled={index === 0}>↑</button>
        <button className="ghost" onClick={() => onMove(Math.min(count - 1, index + 1))} disabled={index === count - 1}>↓</button>
        <button className="ghost danger" onClick={onDelete} disabled={count <= 1}>Delete</button>
      </div>
    </div>
  );
}

export { studioSelectors };
