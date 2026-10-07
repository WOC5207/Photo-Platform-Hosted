import {
  BoxGeometry,
  CanvasTexture,
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
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLRenderer
} from "three";
import { addLighting, fitText, imageMaterial, makeTexture } from "./kit";
import { damp, settled, spring, type Spring } from "./motion";
import { RACK_STATES, layoutFor, sceneArea, stageBand, type RackState } from "./types";
import type { EnginePalette } from "./engine";

/**
 * A packing list as gear tags hung on a pegboard, a column per category.
 * Each tag carries the item's whole name (wrapped, never cut short), its
 * label UID, and a four-way slide switch along the bottom for where it is on
 * the event day: planned, at the event, returned or broken. The switch's
 * knob is a real part that slides to the new position, and the tag swings
 * on its peg as it moves. Custom reminders hang as tags without a switch.
 */


export interface RackTag {
  id: string;
  /** Category column, and order within it. */
  column: number;
  row: number;
  category: string;
  /** The whole name, however long. */
  name: string;
  /** Label code; "" for a reminder. */
  uid: string;
  /** Inventory status, or "Custom item" for a reminder. */
  note: string;
  /** Null for a reminder: no switch. */
  state: RackState | null;
}

export interface Rack {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Tags for one list; the same ids keep their place and only repaint. `labels` names the four switch positions. */
  setTags(key: string, tags: RackTag[], headers: string[], labels: readonly string[]): void;
  setFocus(index: number): void;
  /** Lanes per category on the board, for arrow keys. */
  columns(): number;
  /** The switch position under the pointer on the tag `pick` finds there, or -1. */
  pickPart(clientX: number, clientY: number, rect: DOMRect): number;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const FOV = 30;
const ELEVATION = MathUtils.degToRad(6);
const TAG_W = 3.2;
const GAP_X = 0.36;
const GAP_Y = 0.3;
const HEADER = 0.72;
const DEPTH = 0.05;
/** Canvas pixels per scene unit on a tag's face. */
const PX = 240;
const PAD = 30;
const TOP_ROW = 74;
const SWITCH_H = 92;
const NAME_SIZES = [56, 50, 44, 40, 36];
const MAX_LINES = 6;
const KNOB_DEPTH = 0.07;

interface Tag {
  data: RackTag;
  signature: string;
  group: Group;
  body: Mesh;
  front: Mesh;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  face: MeshBasicMaterial;
  knob: Group;
  knobBody: Mesh;
  knobMaterial: MeshStandardMaterial;
  knobCanvas: HTMLCanvasElement;
  knobTexture: CanvasTexture;
  knobFace: MeshBasicMaterial;
  /** Where the knob sits, in switch positions. */
  slide: Spring;
  /** The swing on the peg after a switch, and the drop in on arrival. */
  swing: Spring;
  intro: Spring;
  /** Turned away, for columns panned off to the left under the panel. */
  away: Spring;
  pop: number;
  shownState: RackState | null;
  position: Vector3;
  placed: boolean;
}

/** A name in lines that fit `width`: words where there are spaces, characters where there aren't (Chinese, Japanese). */
function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const tokens = text.match(/[⺀-鿿가-힯豈-﫿＀-￯]|[^\s⺀-鿿가-힯豈-﫿＀-￯]+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
  };
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line) line += " ";
      continue;
    }
    if (c.measureText(line + token).width <= width) {
      line += token;
      continue;
    }
    push();
    line = token;
    // A word longer than the tag breaks where it has to.
    while (c.measureText(line).width > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && c.measureText(line.slice(0, cut)).width > width) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  push();
  return lines.length ? lines : [""];
}

export function createRack(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Rack {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 10, 40);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const unit = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);

  // The pegboard and the rail along its top.
  const pegCanvas = document.createElement("canvas");
  pegCanvas.width = pegCanvas.height = 64;
  const pegTexture = makeTexture(pegCanvas, renderer);
  pegTexture.wrapS = pegTexture.wrapT = RepeatWrapping;
  const boardMaterial = new MeshStandardMaterial({ map: pegTexture, roughness: 0.92 });
  const board = new Mesh(box, boardMaterial);
  board.receiveShadow = !lowPower;
  scene.add(board);
  const railMaterial = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });
  const rail = new Mesh(box, railMaterial);
  scene.add(rail);

  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.6 });
  const pegMaterial = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
  const tags = new Group();
  scene.add(tags);
  const headers = new Group();
  scene.add(headers);

  const reticleMaterial = new MeshBasicMaterial({ color: 0x1c1a16 });
  const reticle = new Group();
  const arms: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const arm = new Mesh(unit, reticleMaterial);
    arms.push(arm);
    reticle.add(arm);
  }
  scene.add(reticle);
  const reticleAt = new Vector3();
  let reticleFresh = true;

  let key = "";
  let list: Tag[] = [];
  let headerMeshes: { mesh: Mesh; texture: CanvasTexture; material: MeshBasicMaterial }[] = [];
  let headerLabels: string[] = [];
  let labels: readonly string[] = ["", "", "", ""];
  let focusIndex = 0;
  let hoverIndex = -1;
  let hoverPart = -1;
  let lastPart = -1;
  let width = 1;
  let height = 1;
  let clock = 0;
  let introAt = 0;
  let lanes = 1;
  let columnCount = 1;
  let rowCount = 1;
  /** Every tag on the board is as tall as the one with the longest name. */
  let tagH = 1.6;
  let faceH = 384;
  const panX = spring(0);
  const panY = spring(0);

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  const ink = () => (palette.dark ? "#ece6dc" : "#1c1a16");
  const muted = () => (palette.dark ? "rgba(236,230,220,0.66)" : "rgba(28,26,22,0.62)");
  const paper = () => (palette.dark ? "#26231f" : "#f7f4ef");
  const stateColor = (state: RackState | null) =>
    state === "AT_EVENT"
      ? palette.accent
      : state === "RETURNED"
        ? palette.dark
          ? "#7ac5a2"
          : "#287254"
        : state === "BROKEN"
          ? palette.dark
            ? "#ec8b82"
            : "#b6463d"
          : palette.dark
            ? "#8f877b"
            : "#8a8276";

  // -------------------------------------------------------------- sizing --
  const measure = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  const nameWidth = TAG_W * PX - PAD * 2 - 14;

  /** The size a name is set at, and its lines: the largest size that fits in three lines, else the smallest. */
  function setName(name: string) {
    for (const size of NAME_SIZES) {
      measure.font = `700 ${size}px ${palette.fontSans}`;
      const lines = wrap(measure, name, nameWidth);
      if (lines.length <= 3 || size === NAME_SIZES[NAME_SIZES.length - 1]) return { size, lines: lines.slice(0, MAX_LINES) };
    }
    return { size: NAME_SIZES[0], lines: [name] };
  }

  /** Face height in canvas pixels for the tallest name on the board. */
  function faceHeight(list: RackTag[]) {
    let tallest = 0;
    for (const tag of list) {
      const { size, lines } = setName(tag.name);
      tallest = Math.max(tallest, lines.length * Math.round(size * 1.16));
    }
    return Math.max(TOP_ROW + 26 + tallest + 18 + 34 + 22 + SWITCH_H + PAD, 330);
  }

  /** The switch track on a face, in canvas pixels. */
  function track() {
    const x = PAD + 14;
    const w = TAG_W * PX - PAD - x;
    return { x, y: faceH - PAD - SWITCH_H, w, h: SWITCH_H, seg: w / RACK_STATES.length };
  }

  // --------------------------------------------------------------- faces --
  function paint(tag: Tag) {
    const c = tag.canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = tag.canvas.width;
    const h = tag.canvas.height;
    const data = tag.data;
    c.fillStyle = paper();
    c.fillRect(0, 0, w, h);
    c.fillStyle = stateColor(data.state);
    c.fillRect(0, 0, 14, h);
    c.textBaseline = "alphabetic";
    const x = PAD + 14;

    // Top row: the category, and the UID on the right.
    c.font = `600 22px ${palette.fontMeta}`;
    let uidW = 0;
    if (data.uid) {
      c.font = `700 30px ${palette.fontMeta}`;
      uidW = c.measureText(data.uid).width;
      c.fillStyle = ink();
      c.fillText(data.uid, w - PAD - uidW, TOP_ROW - 22);
      c.font = `600 18px ${palette.fontMeta}`;
      const label = "UID";
      const labelW = c.measureText(label).width;
      c.fillStyle = muted();
      c.fillText(label, w - PAD - uidW - labelW - 10, TOP_ROW - 24);
      uidW += labelW + 30;
    }
    c.font = `600 22px ${palette.fontMeta}`;
    c.fillStyle = muted();
    c.fillText(fitText(c, data.category.toUpperCase(), Math.min(w - PAD - x - uidW, w / 2 - 34 - x)), x, TOP_ROW - 24);
    // The eyelet the peg goes through.
    c.fillStyle = palette.dark ? "#3a3631" : "#d9d2c6";
    c.beginPath();
    c.arc(w / 2, 0.12 * PX, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = palette.dark ? "#100f0d" : "#8f877b";
    c.beginPath();
    c.arc(w / 2, 0.12 * PX, 10, 0, Math.PI * 2);
    c.fill();
    // A perforation under it, as on a luggage tag.
    c.fillStyle = palette.dark ? "rgba(236,230,220,0.18)" : "rgba(28,26,22,0.18)";
    for (let px = x; px < w - PAD; px += 14) c.fillRect(px, TOP_ROW, 7, 2);

    // The whole name.
    const { size, lines } = setName(data.name);
    const lineH = Math.round(size * 1.16);
    c.font = `700 ${size}px ${palette.fontSans}`;
    c.fillStyle = ink();
    let y = TOP_ROW + 26 + size;
    for (const line of lines) {
      c.fillText(line, x, y);
      y += lineH;
    }
    // Inventory status under it.
    c.font = `500 24px ${palette.fontSans}`;
    c.fillStyle = muted();
    c.fillText(fitText(c, data.note, w - PAD - x), x, y - lineH + 18 + 34);

    if (data.state) paintTrack(c, tag);
    tag.texture.needsUpdate = true;
  }

  function paintTrack(c: CanvasRenderingContext2D, tag: Tag) {
    const t = track();
    c.fillStyle = palette.dark ? "#171513" : "#e4ded4";
    c.fillRect(t.x, t.y, t.w, t.h);
    c.fillStyle = palette.dark ? "rgba(0,0,0,0.45)" : "rgba(28,26,22,0.14)";
    c.fillRect(t.x, t.y, t.w, 5);
    c.textAlign = "center";
    c.textBaseline = "middle";
    const hovered = list.indexOf(tag) === hoverIndex ? hoverPart : -1;
    RACK_STATES.forEach((state, i) => {
      const cx = t.x + t.seg * (i + 0.5);
      if (i === hovered && state !== tag.data.state) {
        c.fillStyle = palette.dark ? "rgba(236,230,220,0.08)" : "rgba(28,26,22,0.07)";
        c.fillRect(t.x + t.seg * i, t.y, t.seg, t.h);
      }
      if (i > 0) {
        c.fillStyle = palette.dark ? "rgba(236,230,220,0.14)" : "rgba(28,26,22,0.16)";
        c.fillRect(t.x + t.seg * i - 1, t.y + 18, 2, t.h - 36);
      }
      c.fillStyle = i === hovered ? ink() : muted();
      c.font = `600 19px ${palette.fontMeta}`;
      c.fillText(fitText(c, (labels[i] ?? "").toUpperCase(), t.seg - 16), cx, t.y + t.h / 2 + 1);
    });
    c.textAlign = "start";
    c.textBaseline = "alphabetic";
  }

  /** The knob's own face: the position's name on its colour. */
  function paintKnob(tag: Tag) {
    const c = tag.knobCanvas.getContext("2d") as CanvasRenderingContext2D;
    const { width: w, height: h } = tag.knobCanvas;
    const state = tag.data.state ?? "PLANNED";
    c.fillStyle = stateColor(state);
    c.fillRect(0, 0, w, h);
    c.fillStyle = palette.dark ? "#141210" : "#fffaf2";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 30px ${palette.fontMeta}`;
    c.fillText(fitText(c, (labels[RACK_STATES.indexOf(state)] ?? "").toUpperCase(), w - 20), w / 2, h / 2 + 2);
    // Grip ridges at the ends.
    c.fillStyle = palette.dark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)";
    for (const gx of [12, 20, w - 24, w - 16]) c.fillRect(gx, 18, 3, h - 36);
    tag.knobTexture.needsUpdate = true;
    tag.knobMaterial.color.copy(toColor(stateColor(state))).multiplyScalar(0.7);
  }

  function paintPegboard() {
    const c = pegCanvas.getContext("2d") as CanvasRenderingContext2D;
    const s = pegCanvas.width;
    c.fillStyle = palette.dark ? "#1e1c19" : "#ddd6cb";
    c.fillRect(0, 0, s, s);
    c.fillStyle = palette.dark ? "#100f0d" : "#b9b0a3";
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.11, 0, Math.PI * 2);
    c.fill();
    pegTexture.needsUpdate = true;
  }

  function paintHeader(index: number) {
    const entry = headerMeshes[index];
    const canvas = entry.texture.image as HTMLCanvasElement;
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = ink();
    const label = (headerLabels[index] ?? "").toUpperCase();
    let size = 44;
    c.font = `700 ${size}px ${palette.fontSans}`;
    while (size > 28 && c.measureText(label).width > canvas.width - 16) {
      size -= 2;
      c.font = `700 ${size}px ${palette.fontSans}`;
    }
    c.textBaseline = "middle";
    c.fillText(fitText(c, label, canvas.width - 16), 6, canvas.height / 2 - 6);
    c.fillStyle = palette.accent;
    c.fillRect(6, canvas.height - 12, 54, 5);
    entry.texture.needsUpdate = true;
  }

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    railMaterial.color.copy(toColor(palette.fg));
    pegMaterial.color.copy(toColor(palette.subtle));
    bodyMaterial.color.copy(palette.dark ? toColor(palette.raised) : toColor(palette.raised).lerp(page, 0.2));
    reticleMaterial.color.copy(toColor(palette.fg));
    paintPegboard();
    // Name sizes follow the font, so the faces may change height.
    rebuild(list.map((t) => t.data));
    headerMeshes.forEach((_, i) => paintHeader(i));
  }

  // --------------------------------------------------------------- tags --
  function disposeTag(tag: Tag) {
    tag.texture.dispose();
    tag.face.dispose();
    tag.knobTexture.dispose();
    tag.knobFace.dispose();
    tag.knobMaterial.dispose();
    tag.group.removeFromParent();
  }

  function makeTag(data: RackTag): Tag {
    const group = new Group();
    const body = new Mesh(box, bodyMaterial);
    body.castShadow = !lowPower;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(TAG_W * PX);
    canvas.height = faceH;
    const texture = makeTexture(canvas, renderer);
    // Unlit, so the name and status read in their true colours under the key light.
    const face = imageMaterial({ map: texture });
    const front = new Mesh(unit, face);
    // The peg the tag hangs from, through a hole at the top.
    const peg = new Mesh(box, pegMaterial);
    peg.scale.set(0.06, 0.06, 0.32);
    peg.position.set(0, -0.12, 0.08);

    const knob = new Group();
    const knobMaterial = new MeshStandardMaterial({ roughness: 0.35 });
    const knobBody = new Mesh(box, knobMaterial);
    knobBody.castShadow = !lowPower;
    const knobCanvas = document.createElement("canvas");
    knobCanvas.width = 320;
    knobCanvas.height = 96;
    const knobTexture = makeTexture(knobCanvas, renderer);
    const knobFace = imageMaterial({ map: knobTexture });
    const knobFront = new Mesh(unit, knobFace);
    knob.add(knobBody, knobFront);
    group.add(body, front, peg, knob);
    tags.add(group);
    const at = data.state ? RACK_STATES.indexOf(data.state) : 0;
    const tag: Tag = {
      data,
      signature: "",
      group,
      body,
      front,
      canvas,
      texture,
      face,
      knob,
      knobBody,
      knobMaterial,
      knobCanvas,
      knobTexture,
      knobFace,
      slide: spring(at),
      swing: spring(0),
      intro: spring(0),
      away: spring(0),
      pop: 0,
      shownState: data.state,
      position: new Vector3(),
      placed: false
    };
    shape(tag);
    return tag;
  }

  /** Body, face and knob sizes for the board's tag height. */
  function shape(tag: Tag) {
    const t = track();
    // The group hangs from the peg: its origin is the top of the tag.
    tag.body.scale.set(TAG_W, tagH, DEPTH);
    tag.body.position.set(0, -tagH / 2, 0);
    tag.front.scale.set(TAG_W, tagH, 1);
    tag.front.position.set(0, -tagH / 2, DEPTH / 2 + 0.002);
    const knobW = t.seg / PX - 0.05;
    const knobH = t.h / PX - 0.06;
    tag.knobBody.scale.set(knobW, knobH, KNOB_DEPTH);
    tag.knobBody.position.z = KNOB_DEPTH / 2;
    (tag.knob.children[1] as Mesh).scale.set(knobW, knobH, 1);
    (tag.knob.children[1] as Mesh).position.z = KNOB_DEPTH + 0.002;
    tag.knob.position.y = -(t.y + t.h / 2) / PX;
    tag.knob.visible = tag.data.state !== null;
  }

  /** Tags for `next`, remade when the board's tag height changes (a canvas can't change size once uploaded). */
  function rebuild(next: RackTag[]) {
    const height = faceHeight(next);
    const resized = height !== faceH;
    faceH = height;
    tagH = faceH / PX;
    const kept = new Map(list.map((t) => [t.data.id, t]));
    list = next.map((data) => {
      let tag = kept.get(data.id);
      kept.delete(data.id);
      if (tag && resized) {
        // Remade in place: same position, swing and knob.
        const fresh = makeTag(data);
        fresh.position.copy(tag.position);
        fresh.placed = tag.placed;
        fresh.slide = tag.slide;
        fresh.swing = tag.swing;
        fresh.intro = tag.intro;
        fresh.away = tag.away;
        fresh.pop = tag.pop;
        fresh.shownState = tag.shownState;
        disposeTag(tag);
        tag = fresh;
      }
      tag ??= makeTag(data);
      if (tag.shownState !== data.state && data.state && tag.shownState) {
        // Switched: the tag swings on its peg as the knob slides over.
        tag.swing.velocity += context.reduced() ? 0 : (RACK_STATES.indexOf(data.state) > RACK_STATES.indexOf(tag.shownState) ? -1 : 1) * 1.6;
      }
      tag.shownState = data.state;
      tag.data = data;
      tag.signature = "";
      paint(tag);
      paintKnob(tag);
      tag.knob.visible = data.state !== null;
      tag.signature = JSON.stringify(data);
      return tag;
    });
    for (const tag of kept.values()) disposeTag(tag);
  }

  // -------------------------------------------------------------- layout --
  function cell(tag: RackTag) {
    return { col: tag.column * lanes + (tag.row % lanes), row: Math.floor(tag.row / lanes) };
  }

  function home(tag: RackTag, target: Vector3) {
    const { col, row } = cell(tag);
    return target.set(col * (TAG_W + GAP_X), -(HEADER + row * (tagH + GAP_Y)), DEPTH / 2);
  }

  const framedColumns = () => (layoutFor(width, height) === "portrait" ? 1 : 2);

  function relayout() {
    lanes = Math.max(1, Math.floor(framedColumns() / Math.max(1, headerLabels.length)));
    columnCount = Math.max(1, headerLabels.length) * lanes;
    rowCount = Math.max(1, ...list.map((t) => cell(t.data).row + 1));
    board.visible = rail.visible = headers.visible = list.length > 0;
    const boardW = columnCount * (TAG_W + GAP_X) - GAP_X + 0.8;
    const boardH = HEADER + rowCount * (tagH + GAP_Y) - GAP_Y + 0.9;
    board.scale.set(boardW, boardH, 0.08);
    board.position.set((columnCount * (TAG_W + GAP_X) - GAP_X) / 2 - TAG_W / 2, -boardH / 2 + 0.4, -0.06);
    pegTexture.repeat.set(boardW / 0.25, boardH / 0.25);
    rail.scale.set(boardW, 0.06, 0.14);
    rail.position.set(board.position.x, 0.4 - 0.03, 0.02);
    headerMeshes.forEach((entry, i) => {
      entry.mesh.scale.set(TAG_W, 0.42, 1);
      entry.mesh.position.set(i * lanes * (TAG_W + GAP_X), -0.26, 0.004);
    });
  }

  function clearHeaders() {
    for (const entry of headerMeshes) {
      entry.texture.dispose();
      entry.material.dispose();
      entry.mesh.removeFromParent();
    }
    headerMeshes = [];
  }

  // -------------------------------------------------------------- camera --
  const viewDirection = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const aim = new Vector3();
  let distance = 12;
  let visibleW = 10;
  let visibleH = 6;
  let halfSpan = 2;

  function area() {
    const a = sceneArea(width, height);
    if (layoutFor(width, height) !== "portrait") return { ...a, half: Math.min(a.y, 1 - a.y) * 0.9 };
    // On phones, between the site header and the bottom sheet.
    const band = stageBand(width, height);
    return { x: 0.5, y: band?.y ?? 0.34, width: 0.94, half: band ? band.half * 0.9 : 0.2 };
  }

  function panTargets() {
    const focus = list[focusIndex]?.data;
    const { col, row } = focus ? cell(focus) : { col: 0, row: 0 };
    const visible = Math.min(columnCount, framedColumns());
    const start = MathUtils.clamp(col - Math.floor((visible - 1) / 2), 0, Math.max(0, columnCount - visible));
    const x = (start + (visible - 1) / 2) * (TAG_W + GAP_X);
    const center0 = 0.55 - halfSpan;
    const rowBottom = -(HEADER + row * (tagH + GAP_Y)) - tagH;
    return { x, y: Math.min(center0, rowBottom - 0.3 + halfSpan) };
  }

  /** The leftmost column in view for a pan position. */
  function firstColumn(x: number) {
    const visible = Math.min(columnCount, framedColumns());
    return Math.round(x / (TAG_W + GAP_X) - (visible - 1) / 2);
  }

  function frame() {
    const a = area();
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * (width / height);
    const span = framedColumns() * (TAG_W + GAP_X) - GAP_X + 0.9;
    distance = span / (a.width * 2 * halfW);
    visibleW = 2 * halfW * distance;
    visibleH = 2 * halfH * distance;
    halfSpan = visibleH * a.half;
    aim.set(panX.value - (a.x - 0.5) * visibleW, panY.value + (a.y - 0.5) * visibleH, 0);
    camera.position.copy(aim).addScaledVector(viewDirection, distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  }

  // -------------------------------------------------------------- motion --
  const target = new Vector3();

  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const rate = (r: number) => (reduced ? 60 : r);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 11);
    let moving = false;

    frame();
    const pan = panTargets();
    damp(panX, pan.x, rate(5), dt);
    damp(panY, pan.y, rate(5), dt);
    if (!settled(panX, pan.x) || !settled(panY, pan.y)) moving = true;
    frame();
    lights.key.position.set(aim.x - 5, aim.y + 9, 8);
    lights.key.target.position.copy(aim);

    const t = track();
    const first = firstColumn(panX.value);
    list.forEach((tag, i) => {
      home(tag.data, target);
      const focused = i === focusIndex;
      const popTarget = focused ? 1 : i === hoverIndex ? 0.45 : 0;
      tag.pop = reduced ? popTarget : MathUtils.lerp(tag.pop, popTarget, k);
      if (Math.abs(tag.pop - popTarget) > 1e-3) moving = true;
      target.z += tag.pop * 0.24;
      // Arriving: tags drop onto their pegs one after another from the focus out.
      const due = clock - introAt > Math.abs(i - focusIndex) * 0.045;
      const introTarget = reduced || due ? 1 : 0;
      damp(tag.intro, introTarget, rate(8), dt);
      if (!settled(tag.intro, introTarget)) moving = true;
      if (!tag.placed) {
        tag.position.copy(target);
        tag.placed = true;
      }
      tag.position.lerp(target, k);
      if (tag.position.distanceToSquared(target) > 1e-6) moving = true;
      tag.group.position.copy(tag.position);
      tag.group.position.y += (1 - tag.intro.value) * 1.8;

      // The swing settles back to hanging straight; the knob slides to its position.
      damp(tag.swing, 0, rate(7), dt);
      if (!settled(tag.swing, 0)) moving = true;
      // Columns panned past the left edge turn away on their pegs rather than sit under the panel.
      const awayTarget = cell(tag.data).col < first ? 1 : 0;
      damp(tag.away, awayTarget, rate(7), dt);
      if (!settled(tag.away, awayTarget)) moving = true;
      const away = MathUtils.clamp(tag.away.value, 0, 1);
      tag.group.position.z -= away * 0.5;
      tag.group.rotation.set(-(1 - tag.intro.value) * 0.35, away * 1.45, tag.swing.value * 0.06);
      tag.group.scale.setScalar((1 + tag.pop * 0.025) * (1 - away * 0.25));
      tag.group.visible = away < 0.97;
      const slideTarget = tag.data.state ? RACK_STATES.indexOf(tag.data.state) : 0;
      damp(tag.slide, slideTarget, rate(16), dt);
      if (!settled(tag.slide, slideTarget)) moving = true;
      tag.knob.position.x = (t.x + t.seg * (tag.slide.value + 0.5)) / PX - TAG_W / 2;
      // Pressed in a little while it travels.
      tag.knob.position.z = DEPTH / 2 + 0.004 - Math.min(0.03, Math.abs(tag.slide.value - slideTarget) * 0.03);
    });

    headerMeshes.forEach((entry, i) => {
      entry.mesh.visible = i * lanes >= first || i * lanes + lanes - 1 >= first;
    });

    // Brackets around the focused tag.
    const focused = list[focusIndex];
    reticle.visible = Boolean(focused);
    if (focused) {
      home(focused.data, target);
      target.y -= tagH / 2;
      target.z += 0.28;
      if (reticleFresh) {
        reticleAt.copy(target);
        reticleFresh = false;
      }
      reticleAt.lerp(target, k);
      if (reticleAt.distanceToSquared(target) > 1e-6) moving = true;
      const arm = 0.22;
      const thick = 0.022;
      const hw = TAG_W / 2 + 0.1;
      const hh = tagH / 2 + 0.1;
      let n = 0;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ]) {
        arms[n].scale.set(arm, thick, 1);
        arms[n].position.set(reticleAt.x + sx * (hw - arm / 2), reticleAt.y + sy * hh, reticleAt.z);
        arms[n + 1].scale.set(thick, arm, 1);
        arms[n + 1].position.set(reticleAt.x + sx * hw, reticleAt.y + sy * (hh - arm / 2), reticleAt.z);
        n += 2;
      }
    }

    const fog = scene.fog as Fog;
    fog.near = distance + 2;
    fog.far = distance + 24;
    return moving;
  }

  // ------------------------------------------------------------- picking --
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  function hit(clientX: number, clientY: number, rect: DOMRect) {
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const found = raycaster.intersectObject(tags, true)[0];
    if (!found) return { index: -1, part: -1 };
    let object = found.object;
    while (object.parent && object.parent !== tags) object = object.parent;
    const index = list.findIndex((t) => t.group === object);
    const tag = list[index];
    if (!tag?.data.state) return { index, part: -1 };
    if (found.object.parent === tag.knob) return { index, part: RACK_STATES.indexOf(tag.data.state) };
    if (found.object !== tag.front || !found.uv) return { index, part: -1 };
    const t = track();
    const px = found.uv.x * TAG_W * PX;
    const py = (1 - found.uv.y) * faceH;
    if (py < t.y || py > t.y + t.h || px < t.x || px > t.x + t.w) return { index, part: -1 };
    return { index, part: Math.min(RACK_STATES.length - 1, Math.floor((px - t.x) / t.seg)) };
  }

  applyPalette();

  return {
    scene,
    camera,
    setTags(nextKey, next, nextHeaders, nextLabels) {
      const changed = nextKey !== key;
      if (changed) {
        for (const tag of list) disposeTag(tag);
        list = [];
        key = nextKey;
        focusIndex = 0;
        reticleFresh = true;
      }
      const relabel = nextLabels.join("\u0000") !== labels.join("\u0000");
      labels = nextLabels;
      const signatures = new Map(list.map((t) => [t.data.id, t.signature]));
      const same = !relabel && next.length === list.length && next.every((d) => signatures.get(d.id) === JSON.stringify(d));
      if (!same) rebuild(next);
      if (nextHeaders.join("\u0000") !== headerLabels.join("\u0000") || changed) {
        clearHeaders();
        headerLabels = nextHeaders;
        headerMeshes = nextHeaders.map(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 96;
          const texture = makeTexture(canvas, renderer);
          const material = new MeshBasicMaterial({ map: texture, transparent: true });
          const mesh = new Mesh(unit, material);
          headers.add(mesh);
          return { mesh, texture, material };
        });
        headerMeshes.forEach((_, i) => paintHeader(i));
      }
      focusIndex = MathUtils.clamp(focusIndex, 0, Math.max(0, list.length - 1));
      relayout();
      if (changed) this.settle();
      invalidate();
    },
    setFocus(index) {
      const next = MathUtils.clamp(index, 0, Math.max(0, list.length - 1));
      if (next === focusIndex) return;
      focusIndex = next;
      invalidate();
    },
    columns: () => lanes,
    pickPart(clientX, clientY, rect) {
      return hit(clientX, clientY, rect).part;
    },
    settle() {
      frame();
      const pan = panTargets();
      panX.value = pan.x;
      panY.value = pan.y;
      panX.velocity = panY.velocity = 0;
      frame();
      const first = firstColumn(panX.value);
      for (const tag of list) {
        home(tag.data, tag.position);
        tag.placed = true;
        tag.away.value = cell(tag.data).col < first ? 1 : 0;
        tag.away.velocity = 0;
        tag.intro.value = 0;
        tag.intro.velocity = 0;
      }
      introAt = clock;
      reticleFresh = true;
      invalidate();
    },
    setHover(index) {
      const part = index >= 0 ? lastPart : -1;
      if (index === hoverIndex && part === hoverPart) return;
      const before = list[hoverIndex];
      hoverIndex = index;
      hoverPart = part;
      if (before) paint(before);
      if (list[index]) paint(list[index]);
      invalidate();
    },
    pick(clientX, clientY, rect) {
      const found = hit(clientX, clientY, rect);
      lastPart = found.part;
      return found.index;
    },
    step,
    resize(w, h) {
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      relayout();
    },
    setPalette(next) {
      palette = next;
      applyPalette();
    },
    dispose() {
      for (const tag of list) disposeTag(tag);
      list = [];
      clearHeaders();
      unit.dispose();
      box.dispose();
      for (const material of [boardMaterial, railMaterial, bodyMaterial, pegMaterial, reticleMaterial]) material.dispose();
      pegTexture.dispose();
      lights.environment.dispose();
    }
  };
}
