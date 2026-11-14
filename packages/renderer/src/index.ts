import { Application, BlurFilter, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  ASPECTS, EASES, MOTIF_LABELS, STYLES, clamp, contrastRatio, ensureContrast, lerp,
  morphPoints, motifPoints, resolveFrame, sceneDuration,
  type AspectId, type Frame, type MotifId, type Project, type Pt, type Scene, type StyleDef
} from '@kinemorph/core';

/**
 * PixiJS compositor.
 *
 * Two decisions carry the whole look:
 *
 * 1. The renderer's backing store is the style's native resolution (480x270 for
 *    Pixel Arcade, 1920x1080 for the clean ones) and the stage is scaled from
 *    1920x1080 design units into it. Pixel styles therefore *are* low-res, not
 *    a filter pretending to be.
 * 2. Rendering is a pure function of (project, time). `render()` never advances
 *    a clock, so the preview, the scrubber and the frame-exact export all share
 *    one path — which is what makes the exported video match what you saw.
 */

let DESIGN_W = 1920;
let DESIGN_H = 1080;

export { ASPECTS, type AspectId } from '@kinemorph/core';

const isPortrait = () => DESIGN_H > DESIGN_W * 1.02;

const hex = (value: string): number => parseInt(value.replace('#', ''), 16);

const wordBase = new WeakMap<Text, { x: number; y: number }>();

interface TextBlock {
  container: Container;
  title: Text;
  body: Text;
  blur: BlurFilter;
  /** one Text per word, for the word-level effects */
  wordLayer: Container;
}

export interface RendererOptions {
  antialias?: boolean;
  backgroundAlpha?: number;
  /** Keep the drawing buffer readable. Used by the golden-frame harness only. */
  preserveDrawingBuffer?: boolean;
}

export class SceneRenderer {
  readonly app = new Application();
  private root = new Container();
  private layerA = new Container();
  private layerB = new Container();
  private views = new Map<string, SceneView>();
  private style: StyleDef = STYLES.neon;
  private ready = false;
  private lastStyleId = '';

  async init(options: RendererOptions = {}): Promise<void> {
    await this.app.init({
      width: this.style.width,
      height: this.style.height,
      backgroundAlpha: options.backgroundAlpha ?? 1,
      backgroundColor: hex(this.style.palette.bg),
      antialias: options.antialias ?? this.style.smooth,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      preference: 'webgl',
      autoDensity: false,
      resolution: 1,
      powerPreference: 'high-performance'
    });
    this.app.ticker?.stop();
    this.app.stage.addChild(this.root);
    this.root.addChild(this.layerA, this.layerB);
    this.ready = true;
    this.applyStageScale();
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  mount(element: HTMLElement): void {
    const canvas = this.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';
    canvas.style.display = 'block';
    canvas.style.imageRendering = this.style.smooth ? 'auto' : 'pixelated';
    element.appendChild(canvas);
  }

  private applyStageScale(): void {
    const scale = this.style.width / DESIGN_W;
    this.root.scale.set(scale);
    this.root.position.set(0, 0);
  }

  private nativeHeight(): number {
    return Math.round((this.style.width * DESIGN_H) / DESIGN_W);
  }

  /** Switch output format. The design space changes, so cached views are dropped. */
  setDesign(aspect: AspectId): void {
    const a = ASPECTS[aspect] ?? ASPECTS['16:9'];
    if (a.w === DESIGN_W && a.h === DESIGN_H) return;
    DESIGN_W = a.w;
    DESIGN_H = a.h;
    if (!this.ready) return;
    this.app.renderer.resize(this.style.width, this.nativeHeight());
    this.applyStageScale();
    this.views.clear();
    this.layerA.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.layerB.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  get designWidth(): number { return DESIGN_W; }
  get designHeight(): number { return DESIGN_H; }

  setStyle(style: StyleDef): void {
    if (style.id === this.lastStyleId) return;
    this.lastStyleId = style.id;
    this.style = style;
    if (!this.ready) return;
    this.app.renderer.resize(style.width, this.nativeHeight());
    this.app.renderer.background.color = hex(style.palette.bg);
    this.applyStageScale();
    const canvas = this.canvas;
    canvas.style.imageRendering = style.smooth ? 'auto' : 'pixelated';
    /* text metrics change with the style's fonts, so drop the cached views */
    this.views.clear();
    this.layerA.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.layerB.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private view(scene: Scene): SceneView {
    let v = this.views.get(scene.id);
    if (!v) {
      v = new SceneView(scene);
      this.views.set(scene.id, v);
    }
    return v;
  }

  /** Draw the project at an absolute time, in seconds. */
  render(project: Project, time: number): Frame | null {
    if (!this.ready) return null;
    /* the project owns its format, so the editor and the export agree */
    this.setDesign(project.aspect ?? '16:9');
    this.setStyle(STYLES[project.style] ?? STYLES.neon);

    const frame = resolveFrame(project, time);
    if (!frame) return null;

    this.layerA.removeChildren();
    this.layerB.removeChildren();
    this.layerA.alpha = 1;
    this.layerB.alpha = 1;
    this.layerA.position.set(0, 0);
    this.layerB.position.set(0, 0);
    this.layerA.mask = null;
    this.layerB.mask = null;

    const style = this.style;
    const viewA = this.view(frame.cue.scene);
    viewA.update(frame.cue.scene, style, frame.local);
    this.layerA.addChild(viewA.container);

    if (frame.next && frame.transitionProgress !== null) {
      const p = frame.transitionProgress;
      const nextScene = frame.next.scene;
      if (frame.transition === 'morph') {
        this.composeMorph(viewA, nextScene, style, p, frame);
      } else {
        const viewB = this.view(nextScene);
        viewB.update(nextScene, style, Math.max(0, frame.local - (sceneDuration(frame.cue.scene) - frame.transitionDuration)));
        this.layerB.addChild(viewB.container);
        this.composeTransition(frame.transition, p, style);
      }
    }

    this.app.renderer.render(this.app.stage);
    return frame;
  }

  /** Morph is composited inside one scene view: background of B, geometry in flight. */
  private composeMorph(from: SceneView, to: Scene, style: StyleDef, p: number, frame: Frame): void {
    const e = EASES.inOut(p);
    /* start from B's background so the frame does not flash */
    from.drawBackground(style, frame.local);
    from.morphTo(to, style, e, frame.local);
    if (p > 0.5) {
      from.setTextsFrom(to, p);
      const incoming = clamp((p - 0.5) * 2.6, 0, 1);
      from.setTextAlpha(incoming, incoming);
    } else {
      const outgoing = clamp(1 - e * 2, 0, 1);
      from.setTextAlpha(outgoing, outgoing);
    }
  }

  private composeTransition(kind: Frame['transition'], p: number, style: StyleDef): void {
    const e = EASES.inOut(p);
    switch (kind) {
      case 'fade':
        this.layerB.alpha = e;
        break;
      case 'slide':
        this.layerA.position.x = -e * DESIGN_W;
        this.layerB.position.x = (1 - e) * DESIGN_W;
        break;
      case 'wipe': {
        const mask = new Graphics().rect(0, 0, DESIGN_W * e, DESIGN_H).fill(0xffffff);
        this.layerB.addChild(mask);
        this.layerB.mask = mask;
        break;
      }
      case 'iris': {
        const mask = new Graphics()
          .circle(DESIGN_W / 2, DESIGN_H / 2, e * DESIGN_W * 0.78)
          .fill(0xffffff);
        this.layerB.addChild(mask);
        this.layerB.mask = mask;
        break;
      }
      case 'glitch': {
        /* cheap approximation: the outgoing scene jitters, the incoming one fades */
        const jitter = (1 - Math.abs(p - 0.5) * 2) * 60;
        this.layerA.position.x = Math.sin(p * 40) * jitter;
        this.layerA.alpha = 1 - e;
        this.layerB.alpha = e;
        break;
      }
      default:
        this.layerB.alpha = e;
    }
    void style;
  }

  destroy(): void {
    this.views.clear();
    this.app.destroy(true, { children: true });
  }
}

/* ------------------------------------------------------------------ */
/* A single scene, drawn into its own container                        */
/* ------------------------------------------------------------------ */

class SceneView {
  readonly container = new Container();
  private bg = new Graphics();
  private motif = new Graphics();
  private wordTexts: Text[] = [];
  private wordKey = '';
  /* diagrams get their own object: reusing the motif Graphics dropped fills */
  private diagram = new Graphics();
  private fxLayer!: Graphics;
  private detail = new Graphics();
  private textLayer: TextBlock;
  private sceneId: string;
  private titleText = '';
  private bodyText = '';
  private blurEnabled = false;

  constructor(scene: Scene) {
    this.sceneId = scene.id;
    this.container.addChild(this.bg, this.motif, this.diagram, this.detail);
    this.textLayer = SceneView.makeTextBlock();
    this.fxLayer = new Graphics();
    this.container.addChild(this.fxLayer);
    this.container.addChild(this.textLayer.container);
  }

  private static makeTextBlock(): TextBlock {
    const container = new Container();
    const blur = new BlurFilter({ strength: 0 });
    const title = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'system-ui',
        fontSize: 96,
        fontWeight: '700',
        fill: '#ffffff',
        align: 'left',
        wordWrap: true,
        wordWrapWidth: 800,
        lineHeight: 104
      })
    });
    const body = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'system-ui',
        fontSize: 38,
        fontWeight: '400',
        fill: '#ffffff',
        align: 'left',
        wordWrap: true,
        wordWrapWidth: 780,
        lineHeight: 58
      })
    });
    const wordLayer = new Container();
    container.addChild(title, body, wordLayer);
    return { container, title, body, blur, wordLayer };
  }

  /**
   * Lay the body out word by word and animate each word.
   *
   * Pixi gives one Text per word, so the wrap is measured here rather than
   * delegated to a single Text object. That measurement is the whole reason
   * this is a separate path from the single-object effects.
   */
  private layoutWords(
    scene: Scene, style: StyleDef, bodyText: string, left: number, top: number,
    maxW: number, fontSize: number, lineHeight: number, center: boolean,
    fx: string, t: number, start: number, colour: string
  ): void {
    const layer = this.textLayer.wordLayer;
    const key = `${scene.id}|${style.id}|${bodyText}|${Math.round(maxW)}|${fontSize}|${center}`;
    const words = bodyText.split(/\s+/).filter(Boolean);

    if (key !== this.wordKey) {
      this.wordKey = key;
      const probe = this.wordTexts[0] ?? new Text({ text: '', style: {} });
      probe.style.fontFamily = style.font.body;
      probe.style.fontWeight = style.font.weightBody as TextStyle['fontWeight'];
      probe.style.fontSize = fontSize;
      probe.anchor.set(0, 0);
      const measure = (w: string) => { probe.text = w; return probe.width; };
      const gap = measure(' ') || fontSize * 0.28;

      const lines: { w: string; x: number; width: number }[][] = [];
      let row: { w: string; x: number; width: number }[] = [];
      let cursor = 0;
      for (const word of words) {
        const width = measure(word);
        if (cursor > 0 && cursor + width > maxW) { lines.push(row); row = []; cursor = 0; }
        row.push({ w: word, x: cursor, width });
        cursor += width + gap;
      }
      if (row.length) lines.push(row);

      let index = 0;
      for (let li = 0; li < lines.length; li++) {
        const lineRow = lines[li];
        const rowW = lineRow.length ? lineRow[lineRow.length - 1].x + lineRow[lineRow.length - 1].width : 0;
        const offset = center ? (maxW - rowW) / 2 : 0;
        for (const item of lineRow) {
          let obj = this.wordTexts[index];
          if (!obj) { obj = new Text({ text: '', style: {} }); this.wordTexts.push(obj); layer.addChild(obj); }
          obj.text = item.w;
          obj.style.fontFamily = style.font.body;
          obj.style.fontWeight = style.font.weightBody as TextStyle['fontWeight'];
          obj.style.fontSize = fontSize;
          obj.style.fill = colour;
          obj.anchor.set(0, 0);
          obj.position.set(left + offset + item.x, top + li * lineHeight);
          obj.visible = true;
          wordBase.set(obj, { x: obj.x, y: obj.y });
          index++;
        }
      }
      for (let i = index; i < this.wordTexts.length; i++) this.wordTexts[i].visible = false;
    }

    for (let i = 0; i < this.wordTexts.length; i++) {
      const obj = this.wordTexts[i];
      if (!obj.visible) continue;
      const base = wordBase.get(obj) ?? { x: obj.x, y: obj.y };
      const at = start + i * (fx === 'kinetic' ? 0.05 : 0.07);
      const k = clamp((t - at) / 0.45, 0, 1);
      obj.scale.set(1);
      obj.rotation = 0;
      obj.position.set(base.x, base.y);
      obj.alpha = k <= 0 ? 0 : clamp(k * 2, 0, 1);
      if (k <= 0) continue;
      const e = EASES.back(k);

      if (fx === 'pop') {
        const sc = 0.6 + 0.4 * e;
        obj.scale.set(sc);
        obj.position.set(base.x - (obj.width * (sc - 1)) / 2, base.y - (obj.height * (sc - 1)) / 2);
      } else if (fx === 'wave') {
        obj.position.set(base.x, base.y + Math.sin(t * 2.6 + i * 0.55) * 9);
      } else if (fx === 'kinetic') {
        obj.rotation = (1 - e) * 0.5 * (i % 2 ? -1 : 1);
        obj.scale.set(0.4 + 0.6 * e);
        obj.position.set(base.x + (1 - e) * (i % 2 ? 40 : -40), base.y + (1 - e) * 26);
      }
    }
  }

  private isCenter(scene: Scene): boolean {
    return scene.layout === 'center';
  }

  drawBackground(style: StyleDef, t: number): void {
    const g = this.bg;
    const p = style.palette;
    g.clear();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(hex(p.bg));

    switch (style.background) {
      case 'stars': {
        g.rect(0, 0, DESIGN_W, DESIGN_H * 0.62).fill(hex(p.bg2));
        let seed = 7;
        for (let i = 0; i < 40; i++) {
          seed = (seed * 16807) % 2147483647;
          const x = Math.floor(((seed % 1000) / 1000) * DESIGN_W);
          seed = (seed * 16807) % 2147483647;
          const y = Math.floor(((seed % 1000) / 1000) * DESIGN_H * 0.55);
          const s = 8 + (i % 3) * 8;
          g.rect(x, y, s, s).fill({ color: hex(p.ink), alpha: 0.35 + 0.4 * Math.abs(Math.sin(t * 1.6 + i)) });
        }
        g.rect(0, DESIGN_H * 0.84, DESIGN_W, DESIGN_H * 0.16).fill(hex(p.dim));
        break;
      }
      case 'ruled': {
        for (let i = 1; i < 14; i++) {
          g.rect(0, i * 78, DESIGN_W, 2).fill({ color: hex(p.ink), alpha: 0.07 });
        }
        g.rect(90, 0, 3, DESIGN_H).fill({ color: hex(p.ink), alpha: 0.12 });
        break;
      }
      case 'grid': {
        g.circle(DESIGN_W * 0.72, DESIGN_H * 0.45, 620).fill({ color: 0x3a1f6e, alpha: 0.35 });
        for (let i = 0; i < 12; i++) {
          const y = DESIGN_H * 0.62 + Math.pow(i / 11, 2) * DESIGN_H * 0.45;
          g.rect(0, y, DESIGN_W, 2).fill({ color: 0x7a5aff, alpha: 0.3 });
        }
        for (let i = -10; i <= 10; i++) {
          g.moveTo(DESIGN_W / 2 + i * 60, DESIGN_H * 0.62)
            .lineTo(DESIGN_W / 2 + i * 320, DESIGN_H)
            .stroke({ width: 2, color: 0x7a5aff, alpha: 0.3 });
        }
        break;
      }
      case 'paper': {
        g.circle(DESIGN_W * 0.78, DESIGN_H * 0.2, 420).fill(hex(p.bg2));
        g.moveTo(0, DESIGN_H * 0.86)
          .quadraticCurveTo(DESIGN_W * 0.5, DESIGN_H * 0.76, DESIGN_W, DESIGN_H * 0.9)
          .lineTo(DESIGN_W, DESIGN_H).lineTo(0, DESIGN_H)
          .fill({ color: 0xffffff, alpha: 0.35 });
        break;
      }
      case 'space': {
        g.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: hex(p.bg2), alpha: 0.55 });
        let seed = 23;
        for (let i = 0; i < 130; i++) {
          seed = (seed * 16807) % 2147483647;
          const x = ((seed % 1000) / 1000) * DESIGN_W;
          seed = (seed * 16807) % 2147483647;
          const y = ((seed % 1000) / 1000) * DESIGN_H;
          g.circle(x, y, 1 + (i % 3) * 0.6).fill({ color: 0xffffff, alpha: 0.25 + 0.6 * Math.abs(Math.sin(t * 0.9 + i * 0.7)) });
        }
        break;
      }
      case 'blueprint': {
        g.rect(0, 0, DESIGN_W, DESIGN_H).fill(hex(p.bg));
        for (let i = 0; i <= 24; i++) g.rect(i * 80, 0, 2, DESIGN_H).fill({ color: hex('#7fb3ff'), alpha: 0.16 });
        for (let i = 0; i <= 14; i++) g.rect(0, i * 80, DESIGN_W, 2).fill({ color: hex('#7fb3ff'), alpha: 0.16 });
        g.rect(60, 60, DESIGN_W - 120, DESIGN_H - 120).stroke({ width: 4, color: hex(p.ink), alpha: 0.5 });
        g.rect(84, 84, DESIGN_W - 168, DESIGN_H - 168).stroke({ width: 2, color: hex(p.ink), alpha: 0.28 });
        break;
      }
      case 'riso': {
        g.rect(0, 0, DESIGN_W, DESIGN_H).fill(hex(p.bg));
        g.poly(this.circlePts(DESIGN_W * 0.78, DESIGN_H * 0.24, 380)).fill({ color: hex(p.accents[0]), alpha: 0.2 });
        g.poly(this.circlePts(DESIGN_W * 0.72, DESIGN_H * 0.3, 380)).fill({ color: hex(p.accents[1]), alpha: 0.18 });
        break;
      }
      case 'chalk': {
        g.rect(0, 0, DESIGN_W, DESIGN_H).fill(hex(p.bg));
        g.rect(48, 48, DESIGN_W - 96, DESIGN_H - 96).stroke({ width: 3, color: hex(p.ink), alpha: 0.1 });
        break;
      }
      case 'swiss': {
        g.rect(0, 0, DESIGN_W, DESIGN_H).fill(hex(p.bg));
        g.rect(0, DESIGN_H * 0.86, DESIGN_W, 3).fill({ color: hex(p.dim), alpha: 1 });
        g.rect(130, DESIGN_H * 0.86 - 14, 220, 14).fill({ color: hex(p.ink), alpha: 1 });
        g.rect(DESIGN_W - 330, 90, 200, 10).fill({ color: hex(p.accents[0]), alpha: 1 });
        break;
      }
      case 'sunset': {
        g.rect(0, 0, DESIGN_W, DESIGN_H * 0.72).fill(hex('#7a1266'));
        g.circle(DESIGN_W / 2, DESIGN_H * 0.6, 200).fill({ color: 0xffdc78, alpha: 0.55 });
        g.rect(0, DESIGN_H * 0.72, DESIGN_W, DESIGN_H * 0.28).fill(hex(p.bg));
        for (let i = 0; i < 10; i++) {
          const y = DESIGN_H * 0.72 + Math.pow(i / 9, 2) * DESIGN_H * 0.28;
          g.rect(0, y, DESIGN_W, 2).fill({ color: 0x00e5ff, alpha: 0.5 });
        }
        for (let i = -8; i <= 8; i++) {
          g.moveTo(DESIGN_W / 2 + i * 40, DESIGN_H * 0.72)
            .lineTo(DESIGN_W / 2 + i * 210, DESIGN_H)
            .stroke({ width: 2, color: 0x00e5ff, alpha: 0.45 });
        }
        break;
      }
    }
  }

  private circlePts(cx: number, cy: number, r: number, n = 48): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return out;
  }

  private motifGeometry(points: Pt[], cx: number, cy: number, r: number, rot: number): number[] {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const flat: number[] = [];
    for (const p of points) {
      const x = p.x * r;
      const y = p.y * r;
      flat.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
    }
    return flat;
  }

  drawMotif(
    points: Pt[],
    style: StyleDef,
    accent: string,
    cx: number,
    cy: number,
    r: number,
    rot: number,
    alpha: number
  ): void {
    const g = this.motif;
    g.clear();
    const color = hex(accent);
    const flat = this.motifGeometry(points, cx, cy, r, rot);

    switch (style.id) {
      case 'pixel':
        g.poly(flat).fill({ color, alpha });
        g.poly(this.motifGeometry(points, cx, cy, r * 0.9, rot)).fill({ color: 0xffffff, alpha: alpha * 0.22 });
        break;
      case 'stick':
        g.poly(flat).stroke({ width: 8, color: hex(style.palette.ink), alpha, join: 'round' });
        g.poly(flat).stroke({ width: 8, color, alpha: alpha * 0.9, join: 'round' });
        break;
      case 'neon': {
        /* layered strokes read as a glow without paying for a blur filter */
        g.poly(flat).stroke({ width: 26, color, alpha: alpha * 0.14, join: 'round' });
        g.poly(flat).stroke({ width: 14, color, alpha: alpha * 0.3, join: 'round' });
        g.poly(flat).stroke({ width: 6, color, alpha, join: 'round' });
        g.poly(flat).stroke({ width: 2, color: 0xffffff, alpha: alpha * 0.9, join: 'round' });
        break;
      }
      case 'paper':
        g.poly(this.motifGeometry(points, cx + 8, cy + 12, r, rot)).fill({ color: 0x000000, alpha: alpha * 0.14 });
        g.poly(flat).fill({ color, alpha });
        g.poly(this.motifGeometry(points, cx, cy, r * 0.82, rot)).fill({ color: 0xffffff, alpha: alpha * 0.16 });
        break;
      case 'cosmic':
        g.poly(this.motifGeometry(points, cx, cy, r * 1.02, rot)).fill({ color, alpha: alpha * 0.16 });
        g.poly(flat).fill({ color, alpha: alpha * 0.92 });
        g.poly(flat).stroke({ width: 2, color: 0xffffff, alpha: alpha * 0.5, join: 'round' });
        break;
      case 'blueprint':
        g.poly(flat).stroke({ width: 5, color, alpha, join: 'round' });
        g.poly(flat).fill({ color, alpha: alpha * 0.1 });
        break;
      case 'riso':
        g.poly(this.motifGeometry(points, cx + 10, cy - 8, r, rot)).fill({ color: hex(style.palette.accents[1]), alpha: alpha * 0.55 });
        g.poly(flat).fill({ color, alpha: alpha * 0.92 });
        break;
      case 'chalk':
        g.poly(flat).stroke({ width: 9, color, alpha: alpha * 0.55, join: 'round' });
        g.poly(flat).stroke({ width: 5, color, alpha, join: 'round' });
        break;
      case 'swiss':
        g.poly(flat).fill({ color, alpha });
        g.poly(this.motifGeometry(points, cx, cy, r * 0.9, rot)).fill({ color: 0xffffff, alpha: alpha * 0.14 });
        break;
      case 'vhs':
        g.poly(this.motifGeometry(points, cx + 7, cy, r, rot)).fill({ color: 0x00e5ff, alpha: alpha * 0.8 });
        g.poly(this.motifGeometry(points, cx - 7, cy, r, rot)).fill({ color: 0xff2e88, alpha: alpha * 0.8 });
        g.poly(flat).fill({ color, alpha });
        break;
    }
  }


  /** The seven diagrams, drawn with the same Graphics as the motifs. */
  private drawDiagram(
    kind: string, style: StyleDef, accent: string,
    cx: number, cy: number, r: number, t: number, alpha: number
  ): void {
    const g = this.diagram;
    g.clear();
    const ink = style.palette.ink;
    const alt = style.palette.accents[(style.palette.accents.indexOf(accent) + 2) % style.palette.accents.length] ?? accent;
    const ease = EASES.back;
    const grow = ease(clamp(t / 0.9, 0, 1));
    const thick = style.id === 'pixel' ? 10 : 5;
    const disc = (x: number, y: number, rad: number, colour: string, a = 1) => {
      const pts: number[] = [];
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        pts.push(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
      }
      g.poly(pts).fill({ color: hex(colour), alpha: a * alpha });
    };
    const ring = (x: number, y: number, rad: number, w: number, colour: string, a = 1) => {
      const pts: number[] = [];
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        pts.push(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
      }
      g.poly(pts).stroke({ width: w, color: hex(colour), alpha: a * alpha });
    };
    const block = (x: number, y: number, w: number, h: number, colour: string, a = 1) =>
      g.poly([x, y, x + w, y, x + w, y + h, x, y + h]).fill({ color: hex(colour), alpha: a * alpha });
    const frame = (x: number, y: number, w: number, h: number, colour: string, a = 1) =>
      g.poly([x, y, x + w, y, x + w, y + h, x, y + h]).stroke({ width: 3, color: hex(colour), alpha: a * alpha });
    const line = (x1: number, y1: number, x2: number, y2: number, w: number, colour: string, a = 1) =>
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: hex(colour), alpha: a * alpha });

    if (kind === 'rings') {
      for (let i = 0; i < 4; i++) {
        const rr = r * (0.35 + i * 0.22) * grow;
        const from = t * (0.4 + i * 0.2);
        const to = from + Math.PI * 2 * (0.6 + 0.4 * Math.sin(t * 1.2 + i));
        const sx = cx + Math.cos(from) * rr;
        const sy = cy + Math.sin(from) * rr;
        g.moveTo(sx, sy).arc(cx, cy, rr, from, to)
          .stroke({ width: thick, color: hex(i % 2 ? alt : accent), alpha: alpha * (0.9 - i * 0.12) });
      }
      disc(cx, cy, r * 0.16 * grow, accent);
      return;
    }

    if (kind === 'bars') {
      const n = 5, bw = r * 0.26, gap = r * 0.16;
      const totalW = n * bw + (n - 1) * gap;
      const baseY = cy + r * 0.75;
      const seed = [0.45, 0.8, 0.35, 0.62, 0.5];
      for (let i = 0; i < n; i++) {
        const rise = ease(clamp((t - i * 0.12) / 0.7, 0, 1));
        const h = (0.35 + seed[i] * 0.65) * r * 1.5 * rise;
        const x = cx - totalW / 2 + i * (bw + gap);
        block(x, baseY - h, bw, h, i === n - 2 ? alt : accent);
      }
      line(cx - totalW / 2 - 12, baseY, cx + totalW / 2 + 12, baseY, 3, ink, 0.5);
      return;
    }

    if (kind === 'flow') {
      const nodes = 3, nr = r * 0.24, span = r * 1.9;
      const active = Math.floor(t / 1.2) % nodes;
      for (let i = 0; i < nodes; i++) {
        const nx = cx - span / 2 + (span / (nodes - 1)) * i;
        const pulse = i === active ? 1 + 0.12 * Math.sin(t * 6) : 1;
        if (i === active) disc(nx, cy, nr * grow * pulse, accent);
        else ring(nx, cy, nr * grow * pulse, thick, i < active ? alt : ink, 0.9);
        if (i < nodes - 1) {
          const ax0 = nx + nr * 1.25, ax1 = nx + span / (nodes - 1) - nr * 1.25;
          line(ax0, cy, ax1, cy, 3, ink, 0.45);
          g.poly([ax1, cy, ax1 - 14, cy - 10, ax1 - 14, cy + 10]).fill({ color: hex(ink), alpha: alpha * 0.45 });
        }
      }
      return;
    }

    if (kind === 'orbit') {
      disc(cx, cy, r * 0.22 * grow, accent);
      for (let i = 0; i < 3; i++) {
        const rx = r * (0.6 + i * 0.22) * grow, ry = rx * (0.38 + i * 0.06);
        const ringPts: number[] = [];
        for (let k = 0; k < 48; k++) {
          const a2 = (k / 48) * Math.PI * 2;
          ringPts.push(cx + Math.cos(a2) * rx, cy + Math.sin(a2) * ry);
        }
        g.poly(ringPts).stroke({ width: 3, color: hex(i === 1 ? alt : ink), alpha: alpha * 0.35 });
        const ang = t * (0.9 + i * 0.35) + i * 2.1;
        disc(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, r * 0.055, i === 1 ? alt : accent);
      }
      return;
    }

    if (kind === 'steps') {
      const count = 4, sw = r * 0.42, sh = r * 0.3;
      for (let i = 0; i < count; i++) {
        const sx = cx - (count * sw) / 2 + i * sw;
        const sy = cy + r * 0.7 - i * sh;
        const lit = i <= Math.floor(t * 1.4);
        if (lit) block(sx, sy - sh, sw, sh, i % 2 ? alt : accent);
        else frame(sx, sy - sh, sw, sh, ink, 0.5);
      }
      return;
    }

    if (kind === 'grid') {
      const cols = 8, rows = 5, gx = (r * 1.8) / cols, gy = (r * 1.2) / rows;
      const sweep = (t * 0.55) % 1.6 - 0.3;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const near = clamp(1 - Math.abs(col / cols - sweep) * 3.2, 0, 1);
          disc(cx - r * 0.9 + col * gx + gx / 2, cy - r * 0.6 + row * gy + gy / 2,
            (style.id === 'pixel' ? 7 : 5) + near * 7, near > 0.3 ? accent : ink, (0.45 + 0.55 * near) * grow);
        }
      }
      return;
    }

    if (kind === 'timeline') {
      const x0 = cx - r * 0.95, x1 = cx + r * 0.95;
      const head = clamp(t / 4, 0, 1);
      line(x0, cy, x1, cy, 3, ink, 0.35);
      line(x0, cy, lerp(x0, x1, head * grow), cy, 5, accent, 1);
      for (let i = 0; i < 5; i++) {
        const nx = lerp(x0, x1, i / 4);
        const passed = head >= i / 4;
        if (passed) disc(nx, cy, r * 0.055 * grow, i === 4 ? alt : accent);
        else ring(nx, cy, r * 0.055 * grow, 3, ink, 0.6);
      }
      disc(lerp(x0, x1, head * grow), cy, r * 0.035, ink);
      return;
    }
  }

  private drawDetail(scene: Scene, style: StyleDef, accent: string, cx: number, cy: number, r: number, t: number): void {
    const g = this.detail;
    g.clear();
    if (this.isCenter(scene)) return;
    const ink = style.id === 'neon' ? accent : style.palette.ink;

    if (scene.motif === 'planet') {
      g.ellipse(cx, cy, r * 1.5, r * 0.34).stroke({ width: 4, color: hex(ink), alpha: 0.85 });
    } else if (scene.motif === 'sun' || scene.motif === 'star') {
      for (let i = 0; i < 5; i++) {
        const a = t * 0.6 + i * 1.257;
        g.circle(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35, 4).fill({ color: hex(ink), alpha: 0.5 });
      }
    } else if (scene.motif === 'rocket') {
      const flame = 0.7 + 0.3 * Math.sin(t * 12);
      g.poly([
        cx - r * 0.18, cy + r * 0.72,
        cx, cy + r * (0.72 + 0.5 * flame),
        cx + r * 0.18, cy + r * 0.72
      ]).fill({ color: hex(ink), alpha: 0.7 });
    }
  }

  update(scene: Scene, style: StyleDef, t: number): void {
    this.sceneId = scene.id;
    this.currentMotif = scene.motif;
    const accent = ensureContrast(scene.accent, style.palette.bg, 3);
    this.currentAccent = accent;
    const cam = this.camera(scene, t);

    /* the camera moves the whole frame, background included */
    this.container.pivot.set(DESIGN_W / 2, DESIGN_H / 2);
    this.container.position.set(DESIGN_W / 2 + cam.x, DESIGN_H / 2 + cam.y);
    this.container.scale.set(cam.z);

    this.drawBackground(style, t);

    const center = this.isCenter(scene);
    const portrait = isPortrait();
    const cx = center ? DESIGN_W / 2 : (portrait ? DESIGN_W * 0.72 : 1390);
    const cy = center ? (portrait ? DESIGN_H * 0.7 : 520) : (portrait ? DESIGN_H * 0.52 : 560);
    const baseR = center ? 400 : 300;
    const ease = EASES[scene.ease] ?? EASES.back;
    const enter = ease(clamp(t / 0.9, 0, 1));
    const r = baseR * (0.55 + 0.45 * enter);
    const bob = Math.sin(t * 1.1) * (center ? 10 : 14);
    const rot = Math.sin(t * 0.35) * 0.06;

    if (scene.visual && scene.visual !== 'motif') {
      this.motif.clear();
      this.drawDiagram(scene.visual, style, accent, cx, cy + bob, r, t, center ? 0.5 : 1);
      this.detail.clear();
    } else {
      this.diagram.clear();
      this.drawMotif(motifPoints(scene.motif), style, accent, cx, cy + bob, r, rot, center ? 0.22 : 1);
      this.drawDetail(scene, style, accent, cx, cy + bob, r, t);
    }

    this.layoutText(scene, style, accent, t, enter);
  }

  private camera(scene: Scene, t: number): { z: number; x: number; y: number } {
    if (scene.cam === 'none') return { z: 1, x: 0, y: 0 };
    const p = clamp(t / Math.max(1, sceneDuration(scene)), 0, 1);
    const e = EASES.inOut(p);
    if (scene.cam === 'out') return { z: 1.07 - 0.07 * e, x: 0, y: 0 };
    if (scene.cam === 'pan') return { z: 1.05, x: lerp(-28, 28, e), y: 0 };
    return { z: 1 + 0.07 * e, x: 0, y: 0 };
  }

  private layoutText(scene: Scene, style: StyleDef, accent: string, t: number, enter: number): void {
    const portrait = isPortrait();
    const center = this.isCenter(scene) || portrait;
    const { title, body, container } = this.textLayer;
    const maxW = center ? (portrait ? DESIGN_W * 0.86 : 1360) : DESIGN_W * 0.43;
    const left = center ? (DESIGN_W - maxW) / 2 : (portrait ? DESIGN_W * 0.068 : 130);

    if (this.titleText !== scene.title) {
      title.text = scene.title;
      this.titleText = scene.title;
    }
    if (this.bodyText !== scene.body) {
      body.text = scene.body;
      this.bodyText = scene.body;
    }

    const displayFont = style.font.display;
    title.style.fontFamily = displayFont;
    title.style.fontWeight = style.font.weightDisplay as TextStyle['fontWeight'];
    title.style.letterSpacing = style.font.spacing;
    title.style.wordWrapWidth = maxW;
    title.style.align = center ? 'center' : 'left';
    title.style.fill = style.id === 'neon' ? style.palette.ink : style.palette.ink;

    body.style.fontFamily = style.font.body;
    body.style.fontWeight = style.font.weightBody as TextStyle['fontWeight'];
    body.style.wordWrapWidth = center ? (portrait ? DESIGN_W * 0.78 : 1180) : DESIGN_W * 0.41;
    body.style.align = center ? 'center' : 'left';
    /* decided by the background, so new dark styles do not get dark copy */
    const lightBg = contrastRatio(style.palette.bg, '#000000') > 6;
    body.style.fill = lightBg ? 'rgba(30,30,40,0.86)' : 'rgba(240,244,255,0.88)';

    /* fit the title into two lines */
    let size = center ? (portrait ? Math.round(DESIGN_W * 0.085) : 118) : 96;
    for (let guard = 0; guard < 14; guard++) {
      title.style.fontSize = size;
      title.style.lineHeight = Math.round(size * 1.08);
      if (title.height <= title.style.lineHeight * 2.05 || size <= 44) break;
      size -= 6;
    }

    const titleY = center ? (portrait ? DESIGN_H * 0.3 - title.height / 2 : 470 - title.height / 2) : (portrait ? DESIGN_H * 0.28 : 300);
    title.position.set(left, titleY);
    title.anchor.set(0, 0);

    /* how the body arrives — five effects, all driven by the same clock */
    const full = scene.body || '';
    const words = full.split(/\s+/).filter(Boolean);
    const fx = scene.textFx ?? 'reveal';
    const revealStart = center ? 0.55 : 0.62;
    let visible = full;

    if (fx === 'typewriter') {
      const chars = Math.floor(clamp((t - revealStart) / 0.035, 0, full.length));
      visible = full.slice(0, chars);
    } else if (fx === 'reveal') {
      const shown = Math.floor(clamp((t - revealStart) / 0.09, 0, 9999));
      visible = words.slice(0, Math.min(words.length, shown)).join(' ');
    }

    if (body.text !== visible) body.text = visible;

    body.style.fontSize = center ? (portrait ? Math.round(DESIGN_W * 0.036) : 40) : 38;
    body.style.lineHeight = Math.round((center ? (portrait ? Math.round(DESIGN_W * 0.036) : 40) : 38) * 1.55);
    body.position.set(left, titleY + title.height + (center ? (portrait ? DESIGN_H * 0.05 : 60) : 90));

    /* per-effect presentation */
    this.fxLayer.clear();
    body.alpha = 1;
    body.tint = 0xffffff;
    body.x = left;
    const bodyTop = body.y;

    if (fx === 'glitch') {
      /* horizontal slices, not a box: a tear across the text block, with the
         two tinted bands offset in opposite directions and moving per frame */
      const bands = 4;
      for (let i = 0; i < bands; i++) {
        const phase = t * 3 + i * 1.7;
        const y = bodyTop + ((Math.sin(phase) * 0.5 + 0.5) * body.height);
        const h = body.style.lineHeight * 0.34;
        const shift = (Math.sin(phase * 2.3) > 0 ? 1 : -1) * (4 + (i % 2) * 5);
        this.fxLayer.rect(left + shift, y, body.width, h).fill({ color: i % 2 ? 0x00e5ff : 0xff2e88, alpha: 0.34 });
      }
    } else if (fx === 'highlight') {
      /* a marker bar that sweeps behind each line */
      const sweep = clamp((t - revealStart) / 1.1, 0, 1);
      const lines = Math.max(1, Math.round(body.height / body.style.lineHeight));
      for (let i = 0; i < lines; i++) {
        const lineY = bodyTop + i * body.style.lineHeight + body.style.lineHeight * 0.16;
        const w = body.width * clamp(sweep * lines - i, 0, 1);
        if (w > 0) this.fxLayer.rect(left - 8, lineY, w + 16, body.style.lineHeight * 0.82)
          .fill({ color: hex(accent), alpha: 0.26 });
      }
    } else if (fx === 'shutter') {
      /* a hard wipe: the body is masked by a growing rectangle */
      const open = clamp((t - revealStart) / 0.8, 0, 1);
      this.fxLayer.rect(left - 10, bodyTop - 10, (body.width + 20) * open, body.height + 20).fill(0xffffff);
      body.mask = this.fxLayer;
    }

    if (fx !== 'shutter') body.mask = null;

    /* word-level effects hide the single Text and animate the word layer */
    const wordFx = fx === 'pop' || fx === 'wave' || fx === 'kinetic';
    if (wordFx) {
      body.alpha = 0;
      this.layoutWords(scene, style, full, left, bodyTop, maxW,
        body.style.fontSize as number, body.style.lineHeight as number, center,
        fx, t, revealStart, String(body.style.fill));
    } else if (this.wordKey) {
      this.wordKey = '';
      for (const w of this.wordTexts) w.visible = false;
    }

    /* entrance transform */
    let dx = 0, dy = 0, sx = 1, sy = 1, blur = 0;
    switch (scene.enter) {
      case 'fade': break;
      case 'zoom': sx = sy = lerp(1.18, 1, enter); break;
      case 'slide': dx = (1 - enter) * 150; break;
      case 'slideR': dx = -(1 - enter) * 150; break;
      case 'drop': dy = -(1 - enter) * 120; break;
      case 'flip': sy = Math.max(0.02, enter); break;
      case 'blur': blur = (1 - enter) * 14; break;
      case 'pop': sx = sy = lerp(0.62, 1, enter); break;
      case 'none': break;
      default: dy = (1 - enter) * 52;
    }

    const anchorX = center ? DESIGN_W / 2 : left + 380;
    const anchorY = center ? DESIGN_H * 0.5 : 370;
    container.pivot.set(anchorX, anchorY);
    container.position.set(anchorX + dx, anchorY + dy);
    container.scale.set(sx, sy);
    container.alpha = clamp(enter * 1.6, 0, 1);

    if (blur > 0.3) {
      if (!this.blurEnabled) { container.filters = [this.textLayer.blur]; this.blurEnabled = true; }
      this.textLayer.blur.strength = blur;
    } else if (this.blurEnabled) {
      container.filters = null;
      this.blurEnabled = false;
    }

    if (style.id === 'vhs') {
      /* chromatic split, faked with a coloured shadow */
      title.style.dropShadow = { color: '#ff2e88', alpha: 0.45, blur: 0, distance: 3, angle: 0 };
    } else if (style.id === 'neon') {
      title.style.dropShadow = { color: accent, alpha: 0.55, blur: 18, distance: 0, angle: 0 };
    }
  }

  /* ---- morph support ---- */

  morphTo(to: Scene, style: StyleDef, e: number, t: number): void {
    const accent = ensureContrast(e < 0.5 ? this.currentAccent ?? to.accent : to.accent, style.palette.bg, 3);
    const fromCenter = false;
    const portrait = isPortrait();
    const ax = fromCenter ? DESIGN_W / 2 : (portrait ? DESIGN_W * 0.72 : 1390);
    const bx = to.layout === 'center' || portrait ? DESIGN_W / 2 : (portrait ? DESIGN_W * 0.72 : 1390);
    const cx = lerp(ax, bx, e);
    const cy = lerp(portrait ? DESIGN_H * 0.7 : 560,
      (to.layout === 'center' || portrait) ? (portrait ? DESIGN_H * 0.7 : 520) : (portrait ? DESIGN_H * 0.52 : 560), e);
    const r = lerp(300, to.layout === 'center' ? 400 : 300, e);
    const points = morphPoints(this.currentMotif ?? 'sun', to.motif, e);
    this.drawMotif(points, style, accent, cx, cy, r, lerp(0, 0.5, e), 1);
    this.detail.clear();
    void t;
  }

  setTextAlpha(titleAlpha: number, bodyAlpha: number): void {
    this.textLayer.title.alpha = titleAlpha;
    this.textLayer.body.alpha = bodyAlpha;
  }

  setTextsFrom(to: Scene, p: number): void {
    if (p > 0.5) {
      this.textLayer.title.text = to.title;
      this.textLayer.body.text = to.body;
      this.titleText = to.title;
      this.bodyText = to.body;
    }
  }

  currentMotif: MotifId | null = null;
  currentAccent: string | null = null;

  destroy(): void {
    this.container.destroy({ children: true });
  }

  get id(): string {
    return this.sceneId;
  }
}

/* re-exported so the studio can show a live contrast readout */
export { contrastRatio, MOTIF_LABELS };
