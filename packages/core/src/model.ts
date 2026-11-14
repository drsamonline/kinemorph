import { z } from 'zod';

/**
 * The project is the single source of truth. Everything downstream — renderer,
 * score, export — is a pure function of (project, time). No renderer state is
 * allowed to leak back into the model, which is what makes deterministic export
 * possible: the same project at the same time always produces the same frame.
 */

/** Output formats. The design space follows the format; portrait reflows. */
export const ASPECTS = {
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9' },
  '9:16': { w: 1080, h: 1920, label: 'Portrait 9:16' },
  '1:1': { w: 1080, h: 1080, label: 'Square 1:1' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5' }
} as const;
export const ASPECT_IDS = ['16:9', '9:16', '1:1', '4:5'] as const;
export type AspectId = keyof typeof ASPECTS;

export const STYLE_IDS = ['pixel', 'stick', 'neon', 'paper', 'cosmic', 'vhs', 'blueprint', 'riso', 'chalk', 'swiss'] as const;
export const TEXTFX_IDS = ['reveal', 'typewriter', 'shutter', 'glitch', 'highlight', 'pop', 'wave', 'kinetic', 'split'] as const;
export type TextFxId = (typeof TEXTFX_IDS)[number];

export const VISUAL_IDS = ['motif', 'rings', 'bars', 'flow', 'orbit', 'steps', 'grid', 'timeline'] as const;
export type VisualId = (typeof VISUAL_IDS)[number];

export const MOTIF_IDS = [
  'sun', 'moon', 'mountain', 'tree', 'city', 'wave',
  'cloud', 'star', 'rocket', 'bulb', 'heart', 'book', 'planet', 'spiral'
] as const;
export const TRANSITION_IDS = ['morph', 'fade', 'slide', 'wipe', 'iris', 'glitch', 'none'] as const;
export const ENTER_IDS = ['rise', 'fade', 'zoom', 'slide', 'slideR', 'drop', 'flip', 'blur', 'pop', 'none'] as const;
export const EASE_IDS = ['linear', 'out', 'inOut', 'back', 'expo', 'elastic', 'bounce', 'spring', 'springSoft'] as const;
export const CAM_IDS = ['in', 'out', 'pan', 'none'] as const;
export const MOOD_IDS = ['uplifting', 'calm', 'epic', 'playful', 'tense', 'lofi', 'none'] as const;

export const SceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(120).default(''),
  body: z.string().max(400).default(''),
  motif: z.enum(MOTIF_IDS).default('sun'),
  /** motif, or one of seven diagrams */
  visual: z.enum(VISUAL_IDS).default('motif'),
  /** how the body copy arrives */
  textFx: z.enum(TEXTFX_IDS).default('reveal'),
  dur: z.number().min(1).max(30).default(5),
  layout: z.enum(['split', 'center']).default('split'),
  transition: z.enum(TRANSITION_IDS).default('morph'),
  enter: z.enum(ENTER_IDS).default('rise'),
  ease: z.enum(EASE_IDS).default('back'),
  cam: z.enum(CAM_IDS).default('in'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff2d95')
});

export const ProjectSchema = z.object({
  schema: z.literal(1).default(1),
  id: z.string().default(() => 'p_' + Math.random().toString(36).slice(2, 10)),
  title: z.string().default('Untitled show'),
  style: z.enum(STYLE_IDS).default('neon'),
  mood: z.enum(MOOD_IDS).default('uplifting'),
  pace: z.number().min(0.5).max(2).default(1),
  aspect: z.enum(ASPECT_IDS).default('16:9'),
  /** 0 means "not chosen yet"; the studio fills it on first play */
  musicSeed: z.number().int().min(0).default(0),
  transition: z.enum(TRANSITION_IDS).default('morph'),
  scenes: z.array(SceneSchema).min(1)
});

export type StyleId = (typeof STYLE_IDS)[number];
export type MotifId = (typeof MOTIF_IDS)[number];
export type TransitionId = (typeof TRANSITION_IDS)[number];
export type EnterId = (typeof ENTER_IDS)[number];
export type EaseId = (typeof EASE_IDS)[number];
export type CamId = (typeof CAM_IDS)[number];
export type MoodId = (typeof MOOD_IDS)[number];
export type Scene = z.infer<typeof SceneSchema>;
export type Project = z.infer<typeof ProjectSchema>;

/** Parse untrusted input (a file, a URL hash) into a Project or throw. */
export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}

export function safeParseProject(input: unknown): Project | null {
  const result = ProjectSchema.safeParse(input);
  return result.success ? result.data : null;
}
