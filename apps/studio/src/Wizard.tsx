import { useState } from 'react';
import {
  DEMO_STORIES, MOODS, MOOD_IDS, STYLE_LIST, TRANSITION_IDS, generateProject,
  type MoodId, type Project, type StyleId, type TransitionId
} from '@kinemorph/core';


export function Wizard({ onCreate, onClose }: { onCreate: (project: Project) => void; onClose: () => void }) {
  const [style, setStyle] = useState<StyleId>('neon');
  const [text, setText] = useState('');
  const [mood, setMood] = useState<MoodId>('uplifting');
  const [pace, setPace] = useState(1);
  const [transition, setTransition] = useState<TransitionId>('morph');

  const create = () => {
    const source = text.trim() || DEMO_STORIES[0].text;
    onCreate(generateProject(source, { style, mood, pace, transition }));
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card wizard">
        <header>
          <h1>Write it. Watch it move.</h1>
          <p>Every sentence becomes a scene. The studio draws its own artwork and scores it.</p>
        </header>

        <h2><i>1</i> Pick a look</h2>
        <div className="style-cards">
          {STYLE_LIST.map((option) => (
            <button
              key={option.id}
              className={`style-card ${style === option.id ? 'on' : ''}`}
              onClick={() => setStyle(option.id)}
            >
              <span
                className="preview"
                style={{
                  background: `linear-gradient(135deg, ${option.palette.bg2}, ${option.palette.bg} 55%, ${option.palette.accents[0]})`
                }}
              />
              <span className="name">{option.name}</span>
              <span className="blurb">{option.blurb}</span>
            </button>
          ))}
        </div>

        <h2><i>2</i> Give it a story</h2>
        <div className="chips">
          {DEMO_STORIES.map((demo) => (
            <button key={demo.name} className="chip" onClick={() => setText(demo.text)}>{demo.name}</button>
          ))}
        </div>
        <textarea
          className="story"
          value={text}
          placeholder="Paste a paragraph, a script, or a topic. Each sentence becomes a scene."
          onChange={(e) => setText(e.target.value)}
        />

        <h2><i>3</i> Set the mood</h2>
        <div className="row three">
          <label className="field">Score
            <select value={mood} onChange={(e) => setMood(e.target.value as MoodId)}>
              {MOOD_IDS.map((id) => <option key={id} value={id}>{MOODS[id].label}</option>)}
            </select>
          </label>
          <label className="field">Pace
            <select value={pace} onChange={(e) => setPace(Number(e.target.value))}>
              <option value={0.85}>Brisk</option>
              <option value={1}>Normal</option>
              <option value={1.3}>Slow</option>
            </select>
          </label>
          <label className="field">Transition
            <select value={transition} onChange={(e) => setTransition(e.target.value as TransitionId)}>
              {TRANSITION_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        </div>

        <footer>
          <button className="primary big" onClick={create}>Generate my show →</button>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}
