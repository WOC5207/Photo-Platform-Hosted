import {
  BoxGeometry,
  Color,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type CanvasTexture,
  type Texture,
  type WebGLRenderer
} from "three";
import { addLighting, fitText, gridTexture, imageMaterial, loadImage, makeTexture, photoTexture } from "./kit";
import { damp, settled, smooth, spring } from "./motion";
import { layoutFor, sceneArea, stageBand } from "./types";
import type { EnginePalette } from "./engine";

/**
 * A photographer's own archive as album cards, made like the photographer
 * select's cards: the cover in the window, whole and never cropped, then the
 * album's code, its event name, date and photo count. Wide screens lay the
 * cards out in rows, scrolling a row at a time to keep the focused card in
 * view; phones roll them along a curved rail, the focused one in front.
 */

export interface ShelfCard {
  id: string;
  /** Label code, e.g. "AL-03". */
  code: string;
  title: string;
  date: string;
  /** Photo count and place. */
  meta: string;
  thumb: string;
  med: string;
}

export interface Shelf {
  scene: Scene;
  camera: PerspectiveCamera;
  /** The same cards keep their place and loaded covers. */
  setCards(cards: ShelfCard[]): void;
  setFocus(index: number): void;
  /** Cards per row (1 on the rolling rail), for moving up and down. */
  columns(): number;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const CARD_W = 2.5;
const CARD_H = 3.6;
const CARD_D = 0.07;
const FACE_W = CARD_W - 0.08;
const FACE_H = CARD_H - 0.08;
const GAP_X = 0.5;
const GAP_Y = 0.6;
/** Visible rows in the laid-out grid. */
const ROWS = 2;
/** From the focused card to its neighbours on the rail. */
const SPACING = 2.95;
const FOV = 30;
const TEXTURE_W = 600;
const TEXTURE_H = Math.round((TEXTURE_W * CARD_H) / CARD_W);
const PAD = 34;
const WINDOW_H = Math.round(TEXTURE_H * 0.6);
// The photo window in world units, from the face's texture.
const WIN_W = ((TEXTURE_W - PAD * 2) * FACE_W) / TEXTURE_W;
const WIN_H = (WINDOW_H * FACE_H) / TEXTURE_H;
const WIN_Y = FACE_H / 2 - ((PAD + WINDOW_H / 2) * FACE_H) / TEXTURE_H;
const BORDER = 0.09;

interface Card {
  data: ShelfCard;
  group: Group;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  photo: Mesh;
  photoMaterial: MeshBasicMaterial;
  photoTexture: Texture | null;
  /** The cover size on the card, and the one loading. */
  loaded: "" | "thumb" | "med";
  loading: "" | "thumb" | "med";
  gone: boolean;
  hover: number;
  lift: number;
}

export function createShelf(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Shelf {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 12, 30);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const floorMaterial = new MeshStandardMaterial({ roughness: 0.95 });
  const floor = new Mesh(new PlaneGeometry(160, 160), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = !lowPower;
  scene.add(floor);

  const bodyGeometry = new BoxGeometry(CARD_W, CARD_H, CARD_D);
  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const faceGeometry = new PlaneGeometry(FACE_W, FACE_H);
  const unit = new PlaneGeometry(1, 1);
  const rack = new Group();
  scene.add(rack);
  // The accent border behind the focused card.
  const ringMaterial = new MeshBasicMaterial({ toneMapped: false });
  const ring = new Mesh(unit, ringMaterial);
  ring.scale.set(CARD_W + BORDER * 2, CARD_H + BORDER * 2, 1);
  ring.position.z = -CARD_D / 2 - 0.004;

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);

  /** The card face around the photo window: code, event name, date and counts. */
  function paint(card: Card) {
    const c = card.canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = TEXTURE_W;
    const h = TEXTURE_H;
    const { code, title, date, meta } = card.data;
    const ink = palette.dark ? "#ece6dc" : "#1c1a16";
    const muted = palette.dark ? "rgba(236,230,220,0.6)" : "rgba(28,26,22,0.55)";
    c.fillStyle = palette.dark ? "#26231f" : "#f7f4ef";
    c.fillRect(0, 0, w, h);
    c.fillStyle = palette.dark ? "#1b1916" : "#e4dfd5";
    c.fillRect(PAD, PAD, w - PAD * 2, WINDOW_H);
    // Corner fasteners and the amber guide, as on the photographer cards.
    c.fillStyle = palette.dark ? "#8c8378" : "#6e665b";
    for (const [x, y] of [
      [16, 16],
      [w - 16, 16],
      [16, h - 16],
      [w - 16, h - 16]
    ]) {
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = palette.accent;
    c.fillRect(PAD, PAD + WINDOW_H + 18, 64, 6);

    const top = PAD + WINDOW_H + 64;
    const width = w - PAD * 2;
    c.fillStyle = muted;
    c.font = `500 22px ${palette.fontMeta}`;
    c.fillText(code, PAD, top);
    c.fillText("PINHAOSHE", w - PAD - c.measureText("PINHAOSHE").width, top);
    // Long event names step the type down before they are cut short.
    const name = title.toUpperCase();
    let size = 58;
    c.font = `800 ${size}px ${palette.fontSans}`;
    while (size > 40 && c.measureText(name).width > width) {
      size -= 4;
      c.font = `800 ${size}px ${palette.fontSans}`;
    }
    c.fillStyle = ink;
    c.fillText(fitText(c, name, width), PAD, top + 70);
    c.fillStyle = muted;
    c.font = `500 28px ${palette.fontMeta}`;
    c.fillText(fitText(c, date, width), PAD, top + 114);
    c.fillStyle = ink;
    c.fillRect(PAD, top + 140, width, 2);
    c.font = `500 26px ${palette.fontMeta}`;
    c.fillText(fitText(c, meta.toUpperCase(), width), PAD, top + 184);
    card.texture.needsUpdate = true;
  }

  function makeCard(data: ShelfCard, index: number): Card {
    const group = new Group();
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = !lowPower;
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_W;
    canvas.height = TEXTURE_H;
    const texture = makeTexture(canvas, renderer);
    // Unlit, so the lettering keeps its contrast under the scene's light.
    const material = imageMaterial({ map: texture });
    const front = new Mesh(faceGeometry, material);
    front.position.z = CARD_D / 2 + 0.002;
    const photoMaterial = imageMaterial();
    const photo = new Mesh(unit, photoMaterial);
    photo.position.set(0, WIN_Y, CARD_D / 2 + 0.004);
    photo.visible = false;
    group.add(body, front, photo);
    group.userData.index = index;
    rack.add(group);
    const card: Card = {
      data,
      group,
      canvas,
      texture,
      material,
      photo,
      photoMaterial,
      photoTexture: null,
      loaded: "",
      loading: "",
      gone: false,
      hover: 0,
      lift: 0
    };
    paint(card);
    return card;
  }

  function dropCard(card: Card) {
    card.gone = true;
    rack.remove(card.group);
    card.texture.dispose();
    card.material.dispose();
    card.photoTexture?.dispose();
    card.photoMaterial.dispose();
  }

  /** The cover, whole inside the window: the thumbnail first, the larger size near the focus. */
  function load(card: Card, size: "thumb" | "med") {
    if (card.loaded === "med" || card.loaded === size || card.loading === size || !card.data[size]) return;
    card.loading = size;
    loadImage(card.data[size])
      .then((image) => {
        if (card.gone || card.loaded === "med") return;
        const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
        card.photoTexture?.dispose();
        card.photoTexture = photoTexture(image, renderer, aspect);
        card.photoMaterial.map = card.photoTexture;
        card.photoMaterial.needsUpdate = true;
        const wide = aspect > WIN_W / WIN_H;
        card.photo.scale.set(wide ? WIN_W : WIN_H * aspect, wide ? WIN_W / aspect : WIN_H, 1);
        card.photo.visible = true;
        card.loaded = size;
        invalidate();
      })
      .catch(() => undefined)
      .finally(() => {
        if (card.loading === size) card.loading = "";
      });
  }

  let cards: Card[] = [];
  let focusIndex = 0;
  let hoverIndex = -1;
  let width = 1;
  let height = 1;
  let clock = 0;
  let introAt = 0;
  // The rail's place, or the grid's top visible row.
  const at = spring(0);
  let topRow = 0;
  const rowAt = spring(0);

  const portrait = () => layoutFor(width, height) === "portrait";
  const columnCount = () => (portrait() ? 1 : Math.max(1, Math.min(cards.length, layoutFor(width, height) === "wide" ? 4 : 3)));

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    bodyMaterial.color.copy(palette.dark ? toColor(palette.raised) : toColor(palette.raised).lerp(page, 0.2));
    ringMaterial.color.copy(toColor(palette.accent));
    floorMaterial.map?.dispose();
    floorMaterial.map = gridTexture(
      renderer,
      palette.dark ? "rgba(255,255,255,0.05)" : "rgba(60,50,40,0.07)",
      palette.dark ? "rgba(255,255,255,0.12)" : "rgba(60,50,40,0.18)",
      `#${page.getHexString(SRGBColorSpace)}`
    );
    floorMaterial.map.repeat.set(80, 80);
    floorMaterial.needsUpdate = true;
    cards.forEach(paint);
  }

  /** Keep the focused card's row on screen, scrolling as little as possible. */
  function followRow() {
    const cols = columnCount();
    const rows = Math.ceil(cards.length / cols);
    const row = Math.floor(focusIndex / cols);
    if (row < topRow) topRow = row;
    if (row > topRow + ROWS - 1) topRow = row - ROWS + 1;
    topRow = MathUtils.clamp(topRow, 0, Math.max(0, rows - ROWS));
  }

  function loadNear() {
    const reach = portrait() ? 2 : columnCount() * ROWS;
    cards.forEach((card, i) => load(card, Math.abs(i - focusIndex) <= reach ? "med" : "thumb"));
  }

  const aim = new Vector3();

  function frame() {
    const area = sceneArea(width, height);
    const aspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    let distance: number;
    let middle: number;
    if (portrait()) {
      // The focused card and a peek of each neighbour, in the strip above the sheet.
      const band = stageBand(width, height);
      distance = Math.max(
        (CARD_W + SPACING * 1.1) / (area.width * 2 * halfW),
        (CARD_H * 1.3) / (2 * halfH * (band ? band.half * 1.8 : 0.4))
      );
      middle = 0.2;
    } else {
      const cols = columnCount();
      const rows = Math.min(ROWS, Math.ceil(cards.length / cols)) || 1;
      distance = Math.max(
        (cols * (CARD_W + GAP_X)) / (area.width * 2 * halfW),
        (rows * (CARD_H + GAP_Y) + 0.4) / (2 * halfH * 0.74)
      );
      middle = -(rowAt.value + (rows - 1) / 2) * (CARD_H + GAP_Y);
    }
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    aim.set(-(area.x - 0.5) * visibleW, middle + (area.y - 0.5) * visibleH, 0);
    camera.position.set(aim.x, aim.y + distance * 0.12, distance);
    camera.lookAt(aim);
    lights.key.position.set(aim.x - 6, aim.y + 12, 6);
    lights.key.target.position.copy(aim);
    const fog = scene.fog as Fog;
    fog.near = distance + 2;
    fog.far = distance + 18;
  }

  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const rate = (r: number) => (reduced ? 60 : r);
    let moving = false;
    const rail = portrait();
    const cols = columnCount();
    damp(at, focusIndex, rate(5.2), dt);
    damp(rowAt, topRow, rate(5.5), dt);
    if (!settled(at, focusIndex) || !settled(rowAt, topRow)) moving = true;
    frame();

    const rows = Math.ceil(cards.length / cols);
    floor.position.y = rail ? -CARD_H / 2 - 0.35 : -(rows - 1) * (CARD_H + GAP_Y) - CARD_H / 2 - 0.35;
    const bob = reduced || lowPower ? 0 : Math.sin(clock * 1.6) * 0.04;
    if (bob) moving = true;
    const blend = (value: number, target: number, speed: number) =>
      reduced ? target : MathUtils.lerp(value, target, 1 - Math.exp(-dt * speed));

    cards.forEach((card, i) => {
      const hoverTarget = i === hoverIndex && i !== focusIndex ? 1 : 0;
      const liftTarget = i === focusIndex ? 1 : 0;
      card.hover = blend(card.hover, hoverTarget, 12);
      card.lift = blend(card.lift, liftTarget, 9);
      if (Math.abs(card.hover - hoverTarget) > 1e-3 || Math.abs(card.lift - liftTarget) > 1e-3) moving = true;
      // Arriving, the cards rise into place one after another.
      const intro = reduced ? 1 : smooth((clock - introAt - Math.min(i, 12) * 0.05) / 0.45);
      if (intro < 1) moving = true;
      const rise = (1 - intro) * 1.4;
      const group = card.group;
      if (rail) {
        const k = i - at.value;
        const d = Math.abs(k);
        const near = MathUtils.clamp(1 - d, 0, 1);
        const x = Math.sign(k) * Math.min(d, 1) * SPACING + Math.sign(k) * Math.max(0, d - 1) * SPACING * 0.82;
        group.position.set(x, near * (0.32 + bob) + card.hover * 0.18 - rise, -Math.pow(d, 1.15) * 1.25 + near * 0.6);
        group.rotation.set(-0.06, MathUtils.clamp(-k * 0.38, -0.7, 0.7), 0);
        group.scale.setScalar(1);
        group.visible = d < 4.2;
      } else {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * (CARD_W + GAP_X);
        const y = -row * (CARD_H + GAP_Y);
        group.position.set(x, y + card.lift * (0.1 + bob) - rise, card.lift * 0.55 + card.hover * 0.22);
        group.rotation.set(-0.08 - (1 - intro) * 0.5, 0, 0);
        group.scale.setScalar(1 + card.lift * 0.06);
        group.visible = row >= rowAt.value - 1.2 && row <= rowAt.value + ROWS + 0.2;
      }
    });
    return moving;
  }

  function placeRing() {
    const card = cards[focusIndex];
    if (card) card.group.add(ring);
    else ring.removeFromParent();
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  applyPalette();

  return {
    scene,
    camera,
    setCards(next) {
      const same =
        next.length === cards.length &&
        next.every((data, i) => {
          const card = cards[i];
          return card.data.id === data.id && card.data.title === data.title && card.data.date === data.date && card.data.meta === data.meta && card.data.code === data.code && card.data.med === data.med;
        });
      if (same) return;
      const old = new Map(cards.map((card) => [card.data.id, card]));
      cards = next.map((data, i) => {
        const kept = old.get(data.id);
        if (kept && kept.data.med === data.med) {
          old.delete(data.id);
          kept.data = data;
          kept.group.userData.index = i;
          paint(kept);
          return kept;
        }
        return makeCard(data, i);
      });
      old.forEach(dropCard);
      focusIndex = MathUtils.clamp(focusIndex, 0, Math.max(0, cards.length - 1));
      placeRing();
      followRow();
      loadNear();
      invalidate();
    },
    setFocus(index) {
      const next = MathUtils.clamp(index, 0, Math.max(0, cards.length - 1));
      if (next === focusIndex && ring.parent === cards[next]?.group) return;
      focusIndex = next;
      placeRing();
      followRow();
      loadNear();
      invalidate();
    },
    columns: columnCount,
    settle() {
      followRow();
      at.value = focusIndex;
      rowAt.value = topRow;
      at.velocity = rowAt.velocity = 0;
      cards.forEach((card, i) => {
        card.lift = i === focusIndex ? 1 : 0;
        card.hover = 0;
      });
      introAt = clock;
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
      for (const hit of raycaster.intersectObject(rack, true)) {
        if (hit.object === ring) continue;
        const index = hit.object.parent?.userData.index;
        if (typeof index === "number") return index;
      }
      return -1;
    },
    step,
    resize(w, h) {
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      followRow();
      loadNear();
    },
    setPalette(next) {
      palette = next;
      applyPalette();
    },
    dispose() {
      cards.forEach(dropCard);
      cards = [];
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      faceGeometry.dispose();
      unit.dispose();
      ringMaterial.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      floor.geometry.dispose();
      lights.environment.dispose();
    }
  };
}
