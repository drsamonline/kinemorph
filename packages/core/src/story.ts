import type { MotifId, Project, Scene, StyleId, TextFxId, TransitionId } from './model';
import { accentFor } from './styles';

/**
 * The story engine is deliberately rule-based. It splits text into sentences,
 * derives a title from the first clause, and matches keywords to motifs. No
 * model, no network — which is why the whole studio can run offline.
 */

const TEXTFX_CYCLE: TextFxId[] = ['reveal', 'reveal', 'typewriter', 'highlight', 'shutter', 'reveal', 'glitch'];

const VISUAL_CYCLE = ['motif', 'motif', 'bars', 'flow', 'motif', 'rings', 'timeline', 'orbit', 'steps', 'grid'];

const KEYWORDS: Record<MotifId, string[]> = {
  sun: ['sun', 'light', 'morning', 'bright', 'hope', 'summer', 'warm', 'day', 'shine'],
  moon: ['moon', 'night', 'sleep', 'quiet', 'calm', 'dark', 'dawn'],
  mountain: ['mountain', 'climb', 'challenge', 'goal', 'peak', 'high', 'struggle', 'hard'],
  tree: ['tree', 'seed', 'grow', 'root', 'forest', 'plant', 'soil', 'leaf', 'leaves'],
  city: ['city', 'town', 'office', 'market', 'business', 'team', 'work', 'build', 'street', 'train'],
  wave: ['water', 'sea', 'ocean', 'river', 'flow', 'rain', 'wave', 'liquid', 'drink', 'fall'],
  cloud: ['cloud', 'sky', 'weather', 'vapour', 'vapor', 'air', 'wind', 'float', 'rise'],
  star: ['star', 'space', 'wish', 'magic', 'wonder', 'future', 'dream'],
  rocket: ['rocket', 'launch', 'start', 'fast', 'speed', 'progress', 'ship', 'release'],
  bulb: ['idea', 'think', 'learn', 'know', 'insight', 'understand', 'discover', 'why', 'assume'],
  heart: ['heart', 'love', 'care', 'health', 'feel', 'people', 'friend', 'patient', 'listen'],
  book: ['book', 'story', 'read', 'study', 'lesson', 'write', 'history', 'plan'],
  planet: ['planet', 'world', 'earth', 'global', 'everyone', 'together', 'all of us'],
  spiral: ['change', 'again', 'cycle', 'loop', 'repeat', 'transform', 'journey', 'begins']
};

const STOP_WORDS = new Set([
  'and', 'the', 'a', 'an', 'of', 'to', 'in', 'it', 'is', 'as', 'that', 'with',
  'for', 'on', 'at', 'but', 'or', 'its', 'was', 'were', 'are', 'from', 'by'
]);

const MOTIF_ORDER = Object.keys(KEYWORDS) as MotifId[];

export function titleFrom(text: string): string {
  let t = text.split(/[,;:—–]/)[0].trim();
  const words = t.split(' ');
  if (words.length > 7) {
    const cut = words.slice(0, 6);
    while (cut.length > 2 && STOP_WORDS.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) cut.pop();
    t = cut.join(' ');
  }
  t = t.replace(/[.!?]+$/, '').trim();
  if (!t) t = 'Untitled';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 52 ? t.slice(0, 50).trim() + '…' : t;
}

export function trimBody(text: string, max = 190): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(0, cut.lastIndexOf(' '))).replace(/[,;:—–]$/, '') + '…';
}

export function pickMotif(text: string, index: number, previous: MotifId | null): MotifId {
  const haystack = text.toLowerCase();
  let best: MotifId | null = null;
  let bestScore = 0;
  for (const id of MOTIF_ORDER) {
    let score = 0;
    for (const word of KEYWORDS[id]) {
      if (haystack.includes(word)) score += word.length > 5 ? 1.6 : 1;
    }
    if (score > bestScore) { bestScore = score; best = id; }
  }
  if (!best) best = MOTIF_ORDER[(index * 3 + 2) % MOTIF_ORDER.length];
  if (best === previous && bestScore === 0) {
    best = MOTIF_ORDER[(MOTIF_ORDER.indexOf(best) + 3) % MOTIF_ORDER.length];
  }
  return best;
}

function expandShort(topic: string): string[] {
  const t = topic.replace(/[.!?]+$/, '').trim() || 'this idea';
  return [
    `Everything starts with ${t}.`,
    'At first it looks simple, almost too simple to notice.',
    'Then one part begins to move, and the rest follow.',
    'Something small turns into something you can see.',
    `And that is how ${t} actually works.`
  ];
}

export interface GenerateOptions {
  style?: StyleId;
  mood?: Project['mood'];
  pace?: number;
  transition?: TransitionId;
  aspect?: Project['aspect'];
  maxScenes?: number;
  title?: string;
}

const uid = () => 's_' + Math.random().toString(36).slice(2, 9);

export function generateProject(text: string, options: GenerateOptions = {}): Project {
  const style = options.style ?? 'neon';
  const pace = options.pace ?? 1;
  const source = text.replace(/\s+/g, ' ').trim();

  let sentences = source.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 1);
  if (sentences.length < 3) sentences = expandShort(source || 'this idea');

  const maxScenes = options.maxScenes ?? 9;
  const count = Math.max(3, Math.min(maxScenes, sentences.length));

  const per = sentences.length / count;
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = sentences.slice(Math.round(i * per), Math.round((i + 1) * per)).join(' ').trim();
    if (part) chunks.push(part);
  }
  if (!chunks.length) chunks.push(source);

  let previous: MotifId | null = null;
  const scenes: Scene[] = chunks.map((chunk, index) => {
    const motif = pickMotif(chunk, index, previous);
    previous = motif;

    const title = titleFrom(chunk);
    let body = trimBody(chunk);
    const clean = title.replace(/…$/, '');
    if (clean && body.toLowerCase().startsWith(clean.toLowerCase())) {
      const rest = body
        .slice(clean.length)
        .replace(/^[\s.,;:!?—–-]+/, '')
        .replace(/^(and|but|then|so)\s+/i, '')
        .trim();
      body = rest.length > 24 ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
    }

    const last = index === chunks.length - 1;
    return {
      id: uid(),
      title,
      body,
      motif,
      visual: VISUAL_CYCLE[index % VISUAL_CYCLE.length],
      textFx: TEXTFX_CYCLE[index % TEXTFX_CYCLE.length],
      dur: (index === 0 ? 4.5 : 5.5) * pace,
      layout: index === 0 || (last && chunks.length > 2) ? 'center' : 'split',
      transition: options.transition ?? 'morph',
      enter: index === 0 ? 'zoom' : 'rise',
      ease: 'back',
      cam: index % 3 === 2 ? 'pan' : 'in',
      accent: accentFor(index, style)
    } as Scene;
  });

  return {
    schema: 1,
    id: 'p_' + Math.random().toString(36).slice(2, 10),
    title: options.title ?? (titleFrom(source) || 'My show'),
    style,
    mood: options.mood ?? 'uplifting',
    pace,
    aspect: options.aspect ?? '16:9',
    musicSeed: Math.floor(Math.random() * 0xffffffff),
    transition: options.transition ?? 'morph',
    scenes
  };
}

export const DEMO_STORIES: { name: string; text: string }[] = [
  {
    name: 'The Water Cycle',
    text: 'Water is always on the move. The sun warms the sea and water rises as invisible vapour. High in the cold sky it gathers into clouds. When the clouds grow heavy, rain falls back to the ground. Rivers carry it home to the ocean. And the whole journey starts again.'
  },
  {
    name: 'A Seed Becomes a Tree',
    text: 'Every forest begins with one small seed. Buried in the dark soil, it waits for water. Then a root pushes down and a shoot reaches for the light. Years pass and the shoot becomes a trunk. Branches spread and leaves catch the sun. Today the tree gives shade to everything beneath it.'
  },
  {
    name: 'Why We Ship Fast',
    text: 'Big plans move slowly. Small releases move every week. When you ship often, feedback arrives while the idea is still warm. You learn what people actually need instead of what we assumed. Each small release makes the next one cheaper. Speed is not carelessness, it is how we listen.'
  },
  {
    name: 'A Night in the City',
    text: 'The city does not sleep. Neon signs flicker over empty streets. A last train pulls out of the station. Somewhere a kitchen is still open. Dawn arrives quietly over the rooftops. And the city starts again.'
  }
];
