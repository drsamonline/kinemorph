import { z } from 'zod';
import {
  ASPECT_IDS, CAM_IDS, TEXTFX_IDS, VISUAL_IDS, EASE_IDS, ENTER_IDS, MOOD_IDS, MOTIF_IDS, STYLE_IDS, TRANSITION_IDS,
  type Project
} from './model';

/**
 * Every mutation is a serialisable command. The store applies commands to an
 * immutable project, which gives undo/redo for free and makes the whole edit
 * history replayable — useful later for collaboration and for scripted demos.
 *
 * Patches are declared explicitly rather than derived with .partial(), because
 * zod defaults would otherwise be injected for fields the caller did not touch.
 */

const ScenePatchSchema = z.object({
  title: z.string().max(120).optional(),
  body: z.string().max(400).optional(),
  motif: z.enum(MOTIF_IDS).optional(),
  visual: z.enum(VISUAL_IDS).optional(),
  textFx: z.enum(TEXTFX_IDS).optional(),
  dur: z.number().min(1).max(30).optional(),
  layout: z.enum(['split', 'center']).optional(),
  transition: z.enum(TRANSITION_IDS).optional(),
  enter: z.enum(ENTER_IDS).optional(),
  ease: z.enum(EASE_IDS).optional(),
  cam: z.enum(CAM_IDS).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
}).strict();

const ProjectPatchSchema = z.object({
  title: z.string().max(120).optional(),
  style: z.enum(STYLE_IDS).optional(),
  mood: z.enum(MOOD_IDS).optional(),
  pace: z.number().min(0.5).max(2).optional(),
  transition: z.enum(TRANSITION_IDS).optional(),
  aspect: z.enum(ASPECT_IDS).optional()
}).strict();

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('project.patch'), patch: ProjectPatchSchema }),
  z.object({ type: z.literal('scene.update'), id: z.string(), patch: ScenePatchSchema }),
  z.object({ type: z.literal('scene.remove'), id: z.string() }),
  z.object({ type: z.literal('scene.move'), id: z.string(), to: z.number().int().min(0) }),
  z.object({ type: z.literal('scene.duplicate'), id: z.string() }),
  z.object({ type: z.literal('scenes.replace'), scenes: z.array(z.any()).min(1) }),
  z.object({ type: z.literal('project.replace'), project: z.any() })
]);

export type Command = z.infer<typeof CommandSchema>;
export type ScenePatch = z.infer<typeof ScenePatchSchema>;
export type ProjectPatch = z.infer<typeof ProjectPatchSchema>;

export class CommandError extends Error {}

export function applyCommand(project: Project, command: Command): Project {
  switch (command.type) {
    case 'project.patch':
      return { ...project, ...command.patch };

    case 'scene.update':
      return {
        ...project,
        scenes: project.scenes.map((s) => (s.id === command.id ? { ...s, ...command.patch } : s))
      };

    case 'scene.remove': {
      if (project.scenes.length <= 1) throw new CommandError('A show needs at least one scene');
      return { ...project, scenes: project.scenes.filter((s) => s.id !== command.id) };
    }

    case 'scene.move': {
      const from = project.scenes.findIndex((s) => s.id === command.id);
      if (from < 0) throw new CommandError('Unknown scene ' + command.id);
      const scenes = project.scenes.slice();
      const [moved] = scenes.splice(from, 1);
      const to = Math.max(0, Math.min(scenes.length, command.to));
      scenes.splice(to, 0, moved);
      return { ...project, scenes };
    }

    case 'scene.duplicate': {
      const index = project.scenes.findIndex((s) => s.id === command.id);
      if (index < 0) throw new CommandError('Unknown scene ' + command.id);
      const source = project.scenes[index];
      const copy = { ...source, id: 's_' + Math.random().toString(36).slice(2, 9), title: source.title + ' copy' };
      const scenes = project.scenes.slice();
      scenes.splice(index + 1, 0, copy);
      return { ...project, scenes };
    }

    case 'scenes.replace':
      return { ...project, scenes: command.scenes };

    case 'project.replace':
      return command.project as Project;

    default:
      return project;
  }
}

/** Validate untrusted command input (e.g. from a script or a URL) before use. */
export function parseCommand(input: unknown): Command {
  return CommandSchema.parse(input);
}
