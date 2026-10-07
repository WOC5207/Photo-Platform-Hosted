import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLRenderer
} from "three";
import { addLighting, fitText, gridTexture, makeTexture } from "./kit";
import { damp, settled, spring } from "./motion";
import { sceneArea, stageBand } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The prize draw as a deck of cards: one card per prize, laid out face up.
 * Drawing turns them face down and shuffles them; when the server has picked
 * the prize, the cards deal back out and the winning one rises and turns
 * over.
 */

export interface DeckCard {
  id: string;
  name: string;
  /** "2 LEFT", "ALL WON". */
  status: string;
  left: number;
  total: number;
}

export interface Deck {
  scene: Scene;
  camera: PerspectiveCamera;
  /** `labels` prints on the cards: the face's kicker and the back's title. */
  setCards(key: string, cards: DeckCard[], labels: { face: string; back: string }): void;
  setFocus(index: number): void;
  /** Turn the cards over and keep shuffling until reveal. */
  shuffle(): void;
  /** Deal out and raise the winning card; resolves once it faces up. */
  reveal(id: string): Promise<void>;
  /** Show a prize already won, raised, with no shuffle. */
  showWon(id: string | null): void;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const CARD_W = 1.5;
const CARD_H = 2.2;
const CARD_D = 0.035;
const FOV = 30;
const TEX_W = 384;
const TEX_H = Math.round((TEX_W * CARD_H) / CARD_W);
/** The shortest shuffle, so a fast server still reads as a draw. */
const MIN_SHUFFLE = 1.6;
const DEAL = 0.55;
const RISE = 0.9;

interface Card {
  data: DeckCard;
  signature: string;
  group: Group;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  face: MeshStandardMaterial;
  position: Vector3;
  turn: number;
  scale: number;
  lift: number;
}

type Phase = "idle" | "shuffle" | "deal" | "won";

export function createDeck(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Deck {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 10, 40);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const floorMaterial = new MeshStandardMaterial({ roughness: 0.95 });
  const floor = new Mesh(new PlaneGeometry(80, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -CARD_H / 2 - 0.02;
  floor.receiveShadow = !lowPower;
  scene.add(floor);

  const unit = new PlaneGeometry(1, 1);
  const body = new BoxGeometry(CARD_W, CARD_H, CARD_D);
  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const backCanvas = document.createElement("canvas");
  backCanvas.width = TEX_W;
  backCanvas.height = TEX_H;
  const backTexture = makeTexture(backCanvas, renderer);
  const backMaterial = new MeshStandardMaterial({ map: backTexture, roughness: 0.5 });
  const cardsGroup = new Group();
  scene.add(cardsGroup);

  let key = "";
  let backText = "";
  let faceText = "";
  let cards: Card[] = [];
  let focusIndex = -1;
  let hoverIndex = -1;
  let phase: Phase = "idle";
  let phaseAt = 0;
  let winner = "";
  let revealResolve: (() => void) | null = null;
  let width = 1;
  let height = 1;
  let clock = 0;
  const intro = spring(0);

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  const ink = () => (palette.dark ? "#ece6dc" : "#1c1a16");
  const muted = () => (palette.dark ? "rgba(236,230,220,0.74)" : "rgba(28,26,22,0.7)");

  function paint(card: Card) {
    const c = card.canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = TEX_W;
    const h = TEX_H;
    const out = card.data.left <= 0;
    c.fillStyle = palette.dark ? "#26231f" : "#f7f4ef";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = out ? muted() : palette.accent;
    c.lineWidth = 4;
    c.strokeRect(18, 18, w - 36, h - 36);
    c.fillStyle = out ? muted() : palette.accent;
    c.font = `600 18px ${palette.fontMeta}`;
    c.fillText(faceText.toUpperCase(), 36, 58);
    c.fillStyle = out ? muted() : ink();
    // The prize name, wrapped onto up to three lines.
    c.font = `800 40px ${palette.fontSans}`;
    const words = card.data.name.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > w - 72 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((text, i) => {
      const last = i === 2 && lines.length > 3;
      c.fillText(fitText(c, last ? `${text}…` : text, w - 72), 36, 130 + i * 48);
    });
    const lamps = Math.min(card.data.total, 10);
    for (let i = 0; i < lamps; i++) {
      c.fillStyle = i < card.data.left ? palette.accent : palette.dark ? "rgba(255,255,255,0.12)" : "rgba(28,26,22,0.12)";
      c.fillRect(36 + i * 28, h - 96, 20, 20);
    }
    c.fillStyle = out ? muted() : ink();
    c.font = `600 20px ${palette.fontMeta}`;
    c.fillText(card.data.status.toUpperCase(), 36, h - 44);
    card.texture.needsUpdate = true;
  }

  function paintBack() {
    const c = backCanvas.getContext("2d") as CanvasRenderingContext2D;
    const w = TEX_W;
    const h = TEX_H;
    c.fillStyle = palette.dark ? "#1f1c18" : "#2a2620";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = palette.accent;
    c.lineWidth = 3;
    c.strokeRect(18, 18, w - 36, h - 36);
    // Diagonal hatching with the amber guide across the middle.
    c.strokeStyle = "rgba(255,255,255,0.07)";
    c.lineWidth = 2;
    for (let x = -h; x < w; x += 22) {
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x + h, 0);
      c.stroke();
    }
    c.fillStyle = palette.accent;
    c.fillRect(36, h / 2 - 4, w - 72, 8);
    c.fillStyle = "#f2ece2";
    c.font = `600 22px ${palette.fontMeta}`;
    c.textAlign = "center";
    c.fillText(backText.toUpperCase(), w / 2, h / 2 - 26);
    c.fillText("PINHAOSHE", w / 2, h / 2 + 48);
    c.textAlign = "left";
    backTexture.needsUpdate = true;
  }

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    bodyMaterial.color.copy(palette.dark ? toColor(palette.raised) : toColor(palette.raised).lerp(page, 0.2));
    floorMaterial.map?.dispose();
    floorMaterial.map = gridTexture(
      renderer,
      palette.dark ? "rgba(255,255,255,0.05)" : "rgba(60,50,40,0.07)",
      palette.dark ? "rgba(255,255,255,0.12)" : "rgba(60,50,40,0.18)",
      `#${page.getHexString(SRGBColorSpace)}`
    );
    floorMaterial.map.repeat.set(40, 40);
    floorMaterial.needsUpdate = true;
    for (const card of cards) paint(card);
    paintBack();
  }

  function makeCard(data: DeckCard): Card {
    const group = new Group();
    const edge = new Mesh(body, bodyMaterial);
    edge.castShadow = !lowPower;
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const texture = makeTexture(canvas, renderer);
    const face = new MeshStandardMaterial({ map: texture, roughness: 0.45 });
    const front = new Mesh(unit, face);
    front.scale.set(CARD_W - 0.03, CARD_H - 0.03, 1);
    front.position.z = CARD_D / 2 + 0.002;
    const back = new Mesh(unit, backMaterial);
    back.scale.set(CARD_W - 0.03, CARD_H - 0.03, 1);
    back.position.z = -CARD_D / 2 - 0.002;
    back.rotation.y = Math.PI;
    group.add(edge, front, back);
    cardsGroup.add(group);
    return { data, signature: "", group, canvas, texture, face, position: new Vector3(), turn: 0, scale: 1, lift: 0 };
  }

  function disposeCard(card: Card) {
    card.texture.dispose();
    card.face.dispose();
    card.group.removeFromParent();
  }

  // -------------------------------------------------------------- layout --
  function spacing() {
    const n = Math.max(1, cards.length);
    return n <= 1 ? 0 : Math.min(CARD_W + 0.3, 7.2 / (n - 1));
  }

  function home(index: number, target: Vector3) {
    const n = cards.length;
    const offset = index - (n - 1) / 2;
    // A gentle arc, the middle cards nearest.
    return target.set(offset * spacing(), 0, -Math.abs(offset) * 0.12);
  }

  const aim = new Vector3();
  function frame() {
    const area = sceneArea(width, height);
    const aspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    const span = Math.max(4.6, (cards.length - 1) * spacing() + CARD_W + 1.2);
    // On phones the fan fits between the site header and the bottom sheet.
    const band = stageBand(width, height);
    const tallShare = aspect < 1.05 ? Math.min(0.55, band ? band.half * 2.2 : 0.55) : 0.85;
    const distance = Math.max(span / (area.width * 2 * halfW), (CARD_H * 2.3) / (2 * halfH * tallShare));
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    aim.set(-(area.x - 0.5) * visibleW, 0.35 + (area.y - 0.5) * visibleH, 0);
    camera.position.set(aim.x, aim.y + distance * 0.12, distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    const fog = scene.fog as Fog;
    fog.near = distance + 2;
    fog.far = distance + 20;
  }

  // -------------------------------------------------------------- motion --
  const target = new Vector3();

  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const k = reduced ? 1 : 1 - Math.exp(-dt * 10);
    let moving = false;
    frame();
    damp(intro, 1, reduced ? 60 : 4, dt);
    if (!settled(intro, 1)) moving = true;
    lights.key.position.set(aim.x - 5, 10, 7);
    lights.key.target.position.copy(aim);

    const age = clock - phaseAt;
    if (phase === "deal" && revealResolve && age > DEAL + RISE) {
      revealResolve();
      revealResolve = null;
      phase = "won";
    }

    cards.forEach((card, i) => {
      home(i, target);
      let turnTarget = 0;
      let scaleTarget = 1;
      let liftTarget = i === focusIndex ? 0.28 : i === hoverIndex ? 0.14 : 0;
      const isWinner = card.data.id === winner;
      if (phase === "shuffle" && !reduced) {
        // Face down, gathered and riffled in the middle.
        turnTarget = Math.PI;
        liftTarget = 0;
        const gather = MathUtils.smoothstep(age, 0.3, 0.7);
        const swing = Math.sin(clock * 9 + i * 2.1) * 0.9 * gather;
        target.set(MathUtils.lerp(target.x, swing, gather), Math.abs(Math.sin(clock * 7 + i)) * 0.25 * gather, 0.4 + i * 0.03 * gather);
        moving = true;
      } else if ((phase === "deal" || phase === "won") && winner) {
        const rise = phase === "won" || reduced ? 1 : MathUtils.smoothstep(age, DEAL, DEAL + RISE);
        if (isWinner) {
          turnTarget = Math.PI * (1 - rise);
          target.set(MathUtils.lerp(target.x, 0, rise), rise * 0.85, target.z + rise * 1.4);
          scaleTarget = 1 + rise * 0.3;
          liftTarget = 0;
        } else {
          turnTarget = Math.PI * (phase === "won" ? 0 : 1 - MathUtils.smoothstep(age, DEAL + RISE * 0.6, DEAL + RISE + 0.4));
          target.y -= rise * 0.12;
          target.z -= rise * 0.5;
          scaleTarget = 1 - rise * 0.08;
          liftTarget = 0;
        }
        if (phase === "deal") moving = true;
      }
      card.lift = MathUtils.lerp(card.lift, liftTarget, k);
      target.y += card.lift;
      const introOffset = (1 - intro.value) * (1.4 + i * 0.25);
      target.y -= introOffset;
      if (!card.group.userData.placed) {
        card.position.copy(target);
        card.group.userData.placed = true;
      }
      card.position.lerp(target, k);
      card.turn = MathUtils.lerp(card.turn, turnTarget, k);
      card.scale = MathUtils.lerp(card.scale, scaleTarget, k);
      if (card.position.distanceToSquared(target) > 1e-6 || Math.abs(card.turn - turnTarget) > 1e-4 || Math.abs(card.scale - scaleTarget) > 1e-4 || Math.abs(card.lift - liftTarget) > 1e-4) moving = true;
      card.group.position.copy(card.position);
      card.group.rotation.set(0, card.turn, 0);
      card.group.scale.setScalar(card.scale);
      card.group.renderOrder = isWinner ? 2 : 0;
    });
    return moving;
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  applyPalette();

  return {
    scene,
    camera,
    setCards(nextKey, next, labels) {
      if (nextKey !== key) {
        for (const card of cards) disposeCard(card);
        cards = [];
        key = nextKey;
        phase = "idle";
        winner = "";
        intro.value = 0;
        intro.velocity = 0;
      }
      faceText = labels.face;
      const kept = new Map(cards.map((c) => [c.data.id, c]));
      cards = next.map((data) => {
        const card = kept.get(data.id) ?? makeCard(data);
        kept.delete(data.id);
        card.data = data;
        const signature = JSON.stringify(data) + faceText;
        if (signature !== card.signature) {
          card.signature = signature;
          paint(card);
        }
        return card;
      });
      for (const card of kept.values()) disposeCard(card);
      if (labels.back !== backText) {
        backText = labels.back;
        paintBack();
      }
      invalidate();
    },
    setFocus(index) {
      if (index === focusIndex) return;
      focusIndex = index;
      invalidate();
    },
    shuffle() {
      phase = "shuffle";
      phaseAt = clock;
      winner = "";
      invalidate();
    },
    reveal(id) {
      const begin = () => {
        if (!cards.some((c) => c.data.id === id)) {
          phase = "idle";
          return Promise.resolve();
        }
        winner = id;
        phase = "deal";
        phaseAt = clock;
        invalidate();
        return new Promise<void>((resolve) => {
          revealResolve = resolve;
        });
      };
      if (context.reduced()) {
        winner = id;
        phase = "won";
        invalidate();
        return Promise.resolve();
      }
      const wait = Math.max(0, MIN_SHUFFLE - (clock - phaseAt)) * 1000;
      return new Promise<void>((resolve) => setTimeout(() => begin().then(resolve), phase === "shuffle" ? wait : 0));
    },
    showWon(id) {
      winner = id ?? "";
      phase = id ? "won" : "idle";
      invalidate();
    },
    settle() {
      intro.value = 1;
      intro.velocity = 0;
      frame();
      cards.forEach((card, i) => {
        home(i, card.position);
        card.group.userData.placed = true;
      });
      invalidate();
    },
    setHover(index) {
      if (index === hoverIndex) return;
      hoverIndex = index;
      invalidate();
    },
    pick(clientX, clientY, rect) {
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(cardsGroup, true)[0];
      const group = hit?.object.parent;
      return group ? cards.findIndex((c) => c.group === group) : -1;
    },
    step,
    resize(w, h) {
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    setPalette(next) {
      palette = next;
      applyPalette();
    },
    dispose() {
      for (const card of cards) disposeCard(card);
      cards = [];
      unit.dispose();
      body.dispose();
      bodyMaterial.dispose();
      backMaterial.dispose();
      backTexture.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      floor.geometry.dispose();
      lights.environment.dispose();
    }
  };
}
