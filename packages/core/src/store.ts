import { create } from 'zustand';
import type { Project } from './model';
import { applyCommand, CommandError, type Command } from './commands';
import { ProjectSchema } from './model';
import { generateProject, DEMO_STORIES } from './story';
import { totalDuration } from './timeline';

const HISTORY_LIMIT = 80;
const STORAGE_KEY = 'kinemorph.project.v1';

export interface StudioState {
  project: Project;
  selection: string[];
  playhead: number;
  playing: boolean;
  past: Project[];
  future: Project[];
  error: string | null;

  dispatch: (command: Command) => void;
  replaceProject: (project: Project, options?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setPlayhead: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  clearError: () => void;
  loadFromStorage: () => void;
}

function load(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      /* parse, do not trust: a project written by an older version, or edited by
         hand, must not be able to crash the editor */
      const parsed = ProjectSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* a corrupt store should never block the studio */
  }
  return generateProject(DEMO_STORIES[0].text, { style: 'neon', mood: 'uplifting' });
}

function persist(project: Project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    /* private mode, quota, or a very large project — editing still works */
  }
}

export const useStudio = create<StudioState>()((set, get) => ({
  project: load(),
  selection: [],
  playhead: 0,
  playing: false,
  past: [],
  future: [],
  error: null,

  dispatch: (command) => {
    const { project, past } = get();
    try {
      const next = applyCommand(project, command);
      if (next === project) return;
      persist(next);
      set({
        project: next,
        past: [...past, project].slice(-HISTORY_LIMIT),
        future: [],
        error: null
      });
    } catch (err) {
      set({ error: err instanceof CommandError ? err.message : 'That edit could not be applied' });
    }
  },

  replaceProject: (project, options) => {
    persist(project);
    const withHistory = options?.history !== false;
    set((state) => ({
      project,
      past: withHistory ? [...state.past, state.project].slice(-HISTORY_LIMIT) : [],
      future: [],
      playhead: 0,
      selection: project.scenes[0] ? [project.scenes[0].id] : [],
      error: null
    }));
  },

  undo: () => {
    const { past, future, project } = get();
    if (!past.length) return;
    const previous = past[past.length - 1];
    persist(previous);
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [project, ...future].slice(0, HISTORY_LIMIT),
      playhead: Math.min(get().playhead, totalDuration(previous))
    });
  },

  redo: () => {
    const { future, past, project } = get();
    if (!future.length) return;
    const next = future[0];
    persist(next);
    set({
      project: next,
      past: [...past, project].slice(-HISTORY_LIMIT),
      future: future.slice(1)
    });
  },

  select: (ids) => set({ selection: ids }),
  setPlayhead: (time) => set({ playhead: Math.max(0, time) }),
  setPlaying: (playing) => set({ playing }),
  clearError: () => set({ error: null }),

  loadFromStorage: () => {
    const project = load();
    set({ project, selection: project.scenes[0] ? [project.scenes[0].id] : [] });
  }
}));

export const studioSelectors = {
  selectedScene: (state: StudioState) =>
    state.project.scenes.find((s) => s.id === state.selection[0]) ?? state.project.scenes[0],
  duration: (state: StudioState) => totalDuration(state.project),
  canUndo: (state: StudioState) => state.past.length > 0,
  canRedo: (state: StudioState) => state.future.length > 0
};
