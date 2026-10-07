import {
  BoxGeometry,
  Color,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type CanvasTexture,
  type WebGLRenderer
} from "three";
import { addLighting, fitText, gridTexture, imageMaterial, makeTexture } from "./kit";
import { damp, settled, spring } from "./motion";
import { LAYER_PICK, RAIL_PICK, sceneArea, stageBand } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The poster creators' stage: a poster on a lit easel, painted by the
 * screen into a canvas this module owns, with a print slot at the easel's
 * foot that the poster slides into while the download renders. A rail of
 * cards (backgrounds, characters, photographs) can rise in front of the
 * easel, and the poster can be taken apart into its layers.
 *
 * The equipment screens swap the easel for an open camera case: the focused
 * item's ID card rises out of the case's foam, and sinks back into it when
 * another is picked.
 */

/** A card on the rail: an image over a label, like the photographer ID cards. */
export interface RailCard {
  key: string;
  image: CanvasImageSource | null;
  label: string;
  sub?: string;
}


/** One layer of the taken-apart poster, painted alone on a transparent canvas. */
export interface PosterLayerPlane {
  key: string;
  canvas: HTMLCanvasElement;
}

export type PosterProp = "easel" | "case";

export interface PosterStage {
  scene: Scene;
  camera: PerspectiveCamera;
  /**
   * Shape the poster for a width:height ratio and hand back the canvas to
   * paint it on: `edge` (2048 by default) px on its long edge, at most 1024
   * on low-power devices.
   */
  setPoster(key: string, aspect: number, edge?: number): HTMLCanvasElement;
  /** The canvas was repainted. */
  refresh(): void;
  /** The site's accent colour as rgb(), for guides painted on the poster. */
  accent(): string;
  /** What the poster stands on: the easel, or the open camera case. */
  setProp(prop: PosterProp): void;
  /** Slide the poster into the print slot, or back up onto the easel. */
  setPrinting(printing: boolean): void;
  /** Resolves once the poster is down in the slot (at once if it isn't printing). */
  whenPrinted(): Promise<void>;
  /**
   * Where a pointer lands on the poster's face, 0–1 from its top-left, or
   * null. `extend` keeps answering past the edges (for a drag that leaves it).
   */
  posterPoint(clientX: number, clientY: number, rect: DOMRect, extend?: boolean): { u: number; v: number } | null;
  /** Raise a rail of cards in front of the easel with `focus` forward, or lower it (null). */
  setRail(cards: RailCard[] | null, focus: number): void;
  /**
   * Take the poster apart: the face keeps what the screen paints on it (the
   * background) and these planes stand off it, first at the back. Null puts
   * it back together.
   */
  setLayers(planes: PosterLayerPlane[] | null, selected: number): void;
  /** The layer canvases were repainted. */
  refreshLayers(): void;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const POSTER_H = 3.2;
const BOARD_D = 0.05;
const FOV = 30;
/** The easel leans back a little, as a real one does. */
const LEAN = MathUtils.degToRad(-6);
const FLOOR_Y = -POSTER_H / 2 - 0.9;
const CARD_W = 0.74;
const CARD_H = 1;
const CARD_GAP = 0.84;
/** The rail stands low in front of the print slot, over the easel's feet. */
const RAIL_Y = FLOOR_Y + 0.58;
const RAIL_Z = 2.05;
// How far the camera climbs with the rail out, per unit of distance, so it
// looks over the cards at the poster's lower edge; phones stand farther back.
const RAIL_RISE = 0.1;
/** Cards built either side of the focus; the rest wait until the rail turns to them. */
const RAIL_REACH = 6;
/** The camera case's height off the floor, to the top of its foam. */
const CASE_H = 0.62;

export function createPosterStage(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  /** The engine's quality tier, 2 being the lowest. */
  tier: () => number;
  invalidate: () => void;
}): PosterStage {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 10, 40);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const floorMaterial = new MeshStandardMaterial({ roughness: 0.95 });
  const floor = new Mesh(new PlaneGeometry(80, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = !lowPower;
  scene.add(floor);

  // The easel: two legs, a back leg, and the ledge the poster stands on.
  const woodMaterial = new MeshStandardMaterial({ roughness: 0.7 });
  const easel = new Group();
  const legGeo = new BoxGeometry(0.09, POSTER_H + 1.5, 0.09);
  const legs = [-1, 1].map((side) => {
    const leg = new Mesh(legGeo, woodMaterial);
    leg.castShadow = !lowPower;
    leg.userData.side = side;
    easel.add(leg);
    return leg;
  });
  const backLeg = new Mesh(legGeo, woodMaterial);
  // Tilted so its top meets the front legs behind the poster and its foot stands back.
  backLeg.position.set(0, -0.15, -1.08);
  backLeg.rotation.x = MathUtils.degToRad(24);
  backLeg.castShadow = !lowPower;
  easel.add(backLeg);
  const ledgeGeo = new BoxGeometry(1, 0.08, 0.26);
  const ledge = new Mesh(ledgeGeo, woodMaterial);
  ledge.castShadow = !lowPower;
  easel.add(ledge);
  scene.add(easel);

  // The poster: a thin board with the painted face on its front.
  const posterGroup = new Group();
  const boardGeo = new BoxGeometry(1, 1, BOARD_D);
  const boardMaterial = new MeshStandardMaterial({ roughness: 0.6 });
  const board = new Mesh(boardGeo, boardMaterial);
  board.castShadow = !lowPower;
  const faceGeo = new PlaneGeometry(1, 1);
  const faceMaterial = imageMaterial();
  const face = new Mesh(faceGeo, faceMaterial);
  face.position.z = BOARD_D / 2 + 0.002;
  posterGroup.add(board, face);
  scene.add(posterGroup);

  // The print slot: a dark housing on the floor in front of the easel.
  const housingMaterial = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 });
  const slotMaterial = new MeshStandardMaterial({ color: 0x0b0a09, roughness: 1 });
  const lampMaterial = new MeshStandardMaterial({ roughness: 0.4 });
  const housing = new Group();
  const housingGeo = new BoxGeometry(1, 0.36, 0.62);
  const housingBody = new Mesh(housingGeo, housingMaterial);
  housingBody.castShadow = !lowPower;
  const slotGeo = new PlaneGeometry(1, 0.06);
  const slotMouth = new Mesh(slotGeo, slotMaterial);
  slotMouth.rotation.x = -Math.PI / 2;
  slotMouth.position.set(0, 0.181, -0.1);
  const lampGeo = new BoxGeometry(0.5, 0.03, 0.02);
  const lamp = new Mesh(lampGeo, lampMaterial);
  lamp.position.set(0, 0.06, 0.311);
  housing.add(housingBody, slotMouth, lamp);
  scene.add(housing);

  // The camera case: a hard shell with a foam insert, its lid swung open
  // behind the card, latches and a handle on the front.
  const shellMaterial = new MeshStandardMaterial({ roughness: 0.42, metalness: 0.35 });
  const rimMaterial = new MeshStandardMaterial({ roughness: 0.3, metalness: 0.8 });
  const foamMaterial = new MeshStandardMaterial({ roughness: 1 });
  const caseGroup = new Group();
  const caseBox = new BoxGeometry(1, 1, 1);
  const caseBase = new Mesh(caseBox, shellMaterial);
  caseBase.castShadow = !lowPower;
  const caseRim = new Mesh(caseBox, rimMaterial);
  const caseFoam = new Mesh(caseBox, foamMaterial);
  // The pocket the focused card stands in, cut darker into the foam.
  const pocket = new Mesh(caseBox, slotMaterial);
  // Smaller cutouts either side, as for lenses and bodies.
  const cutouts = [0, 1, 2, 3].map(() => {
    const cut = new Mesh(caseBox, slotMaterial);
    caseGroup.add(cut);
    return cut;
  });
  const lid = new Group();
  const lidShell = new Mesh(caseBox, shellMaterial);
  lidShell.castShadow = !lowPower;
  const lidFoam = new Mesh(caseBox, foamMaterial);
  const lidRim = new Mesh(caseBox, rimMaterial);
  lid.add(lidShell, lidFoam, lidRim);
  const latches = [-1, 1].map((side) => {
    const latch = new Mesh(caseBox, rimMaterial);
    latch.userData.side = side;
    caseGroup.add(latch);
    return latch;
  });
  const handle = new Mesh(caseBox, rimMaterial);
  caseGroup.add(caseBase, caseRim, caseFoam, pocket, lid, handle);
  caseGroup.visible = false;
  scene.add(caseGroup);
  let prop: PosterProp = "easel";
  const caseOpen = spring(0);

  // The rail: ID cards with a reticle behind the focused one.
  const rail = new Group();
  scene.add(rail);
  const cardGeo = new PlaneGeometry(CARD_W, CARD_H);
  const reticleMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const reticle = new Mesh(new PlaneGeometry(CARD_W + 0.1, CARD_H + 0.1), reticleMaterial);
  rail.add(reticle);
  type BuiltCard = { mesh: Mesh; material: MeshBasicMaterial; canvas: HTMLCanvasElement; texture: CanvasTexture; painted: string };
  const built = new Map<string, BuiltCard>();
  let railCards: RailCard[] = [];
  let railFocus = 0;
  let railOn = false;
  const railShow = spring(0);
  const railPos = spring(0);

  // The layers of a taken-apart poster.
  const layerGeo = new PlaneGeometry(1, 1);
  type BuiltLayer = { mesh: Mesh; material: MeshBasicMaterial; texture: CanvasTexture; width: number; height: number; canvas: HTMLCanvasElement };
  const layerMeshes = new Map<string, BuiltLayer>();
  let layerOrder: string[] = [];
  let layerSelected = -1;
  let layersOn = false;
  const explode = spring(0);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  let texture: CanvasTexture | null = null;
  let key = "";
  let aspect = 0.8;
  let posterW = POSTER_H * aspect;
  let width = 1;
  let height = 1;
  let hover = false;
  let clock = 0;
  const intro = spring(0);
  const print = spring(0);
  let printing = false;
  let printed: (() => void)[] = [];

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    woodMaterial.color.copy(palette.dark ? new Color(0x5a4636) : new Color(0x9c7a58));
    boardMaterial.color.copy(palette.dark ? toColor(palette.raised) : toColor(palette.raised).lerp(page, 0.2));
    housingMaterial.color.copy(palette.dark ? new Color(0x23201c) : new Color(0x34302a));
    shellMaterial.color.copy(palette.dark ? new Color(0x2a2724) : new Color(0x3b3833));
    rimMaterial.color.copy(palette.dark ? new Color(0x8d8880) : new Color(0xb9b4ab));
    foamMaterial.color.copy(palette.dark ? new Color(0x1b1a18) : new Color(0x2b2926));
    lampMaterial.color.copy(toColor(palette.accent));
    lampMaterial.emissive.copy(toColor(palette.accent));
    reticleMaterial.color.copy(toColor(palette.accent));
    reticleMaterial.emissive.copy(toColor(palette.accent));
    reticleMaterial.emissiveIntensity = 0.5;
    for (const card of built.values()) card.painted = "";
    paintCards();
    floorMaterial.map?.dispose();
    floorMaterial.map = gridTexture(
      renderer,
      palette.dark ? "rgba(255,255,255,0.05)" : "rgba(60,50,40,0.07)",
      palette.dark ? "rgba(255,255,255,0.12)" : "rgba(60,50,40,0.18)",
      `#${page.getHexString(SRGBColorSpace)}`
    );
    floorMaterial.map.repeat.set(40, 40);
    floorMaterial.needsUpdate = true;
  }

  function shape() {
    posterW = POSTER_H * aspect;
    board.scale.set(posterW + 0.06, POSTER_H + 0.06, 1);
    face.scale.set(posterW, POSTER_H, 1);
    for (const leg of legs) {
      leg.position.set(leg.userData.side * (posterW / 2 - 0.12), -0.15, -0.12);
    }
    ledge.scale.x = posterW + 0.5;
    ledge.position.set(0, -POSTER_H / 2 - 0.06, 0.04);
    easel.rotation.x = LEAN;
    housing.scale.x = posterW * 0.95 + 0.2;
    housing.position.set(0, FLOOR_Y + 0.18, 1.15);
    shapeCase();
  }

  /** The case sits on the floor under the card, wide enough for the card's pocket and a row of cutouts either side. */
  function shapeCase() {
    const w = posterW + 2.3;
    const d = 1.7;
    const h = CASE_H;
    caseGroup.position.set(0, FLOOR_Y, 0.1);
    caseBase.scale.set(w, h - 0.05, d);
    caseBase.position.set(0, (h - 0.05) / 2, 0);
    caseRim.scale.set(w + 0.04, 0.05, d + 0.04);
    caseRim.position.set(0, h - 0.025, 0);
    caseFoam.scale.set(w - 0.16, 0.04, d - 0.16);
    caseFoam.position.set(0, h - 0.03, 0);
    pocket.scale.set(posterW + 0.16, 0.012, 0.3);
    pocket.position.set(0, h - 0.004, 0);
    const side = (w - posterW) / 2;
    cutouts.forEach((cut, i) => {
      const right = i % 2 === 0 ? 1 : -1;
      const front = i < 2;
      cut.scale.set(side * (front ? 0.62 : 0.46), 0.012, front ? 0.62 : 0.42);
      cut.position.set(right * (posterW / 2 + side / 2 + 0.02), h - 0.004, front ? 0.28 : -0.42);
    });
    // The lid is hinged on the back edge and swung open past upright.
    lid.position.set(0, h, -d / 2);
    lidShell.scale.set(w, d, 0.22);
    lidShell.position.set(0, d / 2, -0.11);
    lidFoam.scale.set(w - 0.16, d - 0.16, 0.05);
    lidFoam.position.set(0, d / 2, 0.02);
    lidRim.scale.set(w + 0.04, d + 0.04, 0.03);
    lidRim.position.set(0, d / 2, -0.005);
    for (const latch of latches) {
      latch.scale.set(0.26, 0.18, 0.06);
      latch.position.set(latch.userData.side * w * 0.3, h - 0.16, d / 2 + 0.03);
    }
    handle.scale.set(0.9, 0.06, 0.12);
    handle.position.set(0, h * 0.5, d / 2 + 0.08);
  }

  // ---------------------------------------------------------------- rail --
  const cardEdge = lowPower ? 256 : 384;
  function paintCard(card: BuiltCard, data: RailCard) {
    const c = card.canvas.getContext("2d");
    if (!c) return;
    const w = card.canvas.width;
    const h = card.canvas.height;
    const pad = w * 0.06;
    c.fillStyle = palette.dark ? "#1f1d1a" : "#f6f2ec";
    c.fillRect(0, 0, w, h);
    const imageH = h - pad * 2 - w * 0.26;
    c.fillStyle = palette.dark ? "#2c2925" : "#e4ddd3";
    c.fillRect(pad, pad, w - pad * 2, imageH);
    const image = data.image as (CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }) | null;
    if (image) {
      const iw = image.naturalWidth || image.width;
      const ih = image.naturalHeight || image.height;
      if (iw > 0 && ih > 0) {
        // Cover the image area, as a print in a card window.
        const box = (w - pad * 2) / imageH;
        const sw = iw / ih > box ? ih * box : iw;
        const sh = iw / ih > box ? ih : iw / box;
        c.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, pad, pad, w - pad * 2, imageH);
      }
    }
    c.fillStyle = palette.dark ? "#f2ede6" : "#1c1a16";
    c.font = `700 ${Math.round(w * 0.075)}px ${palette.fontSans}`;
    c.textBaseline = "top";
    c.fillText(fitText(c, data.label.toUpperCase(), w - pad * 2), pad, pad * 1.6 + imageH);
    if (data.sub) {
      c.fillStyle = palette.dark ? "rgba(242,237,230,0.6)" : "rgba(28,26,22,0.55)";
      c.font = `500 ${Math.round(w * 0.05)}px ${palette.fontMeta}`;
      c.fillText(fitText(c, data.sub.toUpperCase(), w - pad * 2), pad, pad * 1.6 + imageH + w * 0.1);
    }
    card.texture.needsUpdate = true;
  }

  function paintCards() {
    railCards.forEach((data, i) => {
      const card = built.get(data.key);
      if (!card || Math.abs(i - railFocus) > RAIL_REACH) return;
      const signature = `${data.label}|${data.sub ?? ""}|${data.image ? "i" : "-"}`;
      if (card.painted === signature && card.mesh.userData.image === data.image) return;
      card.painted = signature;
      card.mesh.userData.image = data.image;
      paintCard(card, data);
    });
  }

  function buildCards() {
    const wanted = new Set<string>();
    railCards.forEach((data, i) => {
      if (Math.abs(i - railFocus) > RAIL_REACH) return;
      wanted.add(data.key);
      if (built.has(data.key)) return;
      const cardCanvas = document.createElement("canvas");
      cardCanvas.width = cardEdge;
      cardCanvas.height = Math.round((cardEdge * CARD_H) / CARD_W);
      const texture = makeTexture(cardCanvas, renderer);
      const material = imageMaterial({ map: texture, transparent: true });
      const mesh = new Mesh(cardGeo, material);
      mesh.castShadow = !lowPower;
      rail.add(mesh);
      built.set(data.key, { mesh, material, canvas: cardCanvas, texture, painted: "" });
    });
    for (const [key, card] of built) {
      if (wanted.has(key)) continue;
      card.mesh.removeFromParent();
      card.texture.dispose();
      card.material.dispose();
      card.canvas.width = card.canvas.height = 1;
      built.delete(key);
    }
    paintCards();
  }

  function placeRail() {
    const show = MathUtils.smootherstep(railShow.value, 0, 1);
    rail.visible = show > 0.001;
    if (!rail.visible) return;
    rail.position.set(0, RAIL_Y - (1 - show) * 2.2, RAIL_Z);
    railCards.forEach((data, i) => {
      const card = built.get(data.key);
      if (!card) return;
      const offset = i - railPos.value;
      const near = Math.max(0, 1 - Math.abs(i - railPos.value));
      card.mesh.position.set(offset * CARD_GAP, near * 0.12, near * 0.18 - Math.min(1.2, Math.abs(offset) * 0.12));
      card.mesh.rotation.set(-0.08, MathUtils.clamp(-offset * 0.16, -0.5, 0.5), 0);
      card.mesh.scale.setScalar(1 + near * 0.1);
      card.material.opacity = show * MathUtils.clamp(4.2 - Math.abs(offset), 0, 1);
      card.mesh.visible = card.material.opacity > 0.01;
    });
    const focused = railCards[railFocus] ? built.get(railCards[railFocus].key) : undefined;
    reticle.visible = Boolean(focused?.mesh.visible);
    if (focused) {
      reticle.position.copy(focused.mesh.position);
      reticle.position.z -= 0.012;
      reticle.rotation.copy(focused.mesh.rotation);
      reticle.scale.copy(focused.mesh.scale);
    }
  }

  // -------------------------------------------------------------- layers --
  function placeLayers() {
    const e = MathUtils.smootherstep(explode.value, 0, 1);
    const count = layerOrder.length;
    const gap = Math.min(0.42, 2.6 / Math.max(1, count));
    layerOrder.forEach((key, i) => {
      const layer = layerMeshes.get(key);
      if (!layer) return;
      const lift = i === layerSelected ? 1 : 0;
      layer.mesh.visible = e > 0.001;
      layer.mesh.scale.set(posterW, POSTER_H, 1);
      layer.mesh.position.set(lift * 0.12 * e, lift * 0.1 * e, BOARD_D / 2 + 0.004 + (i + 1) * (0.002 + gap * e));
      // The picked layer glows a little brighter than the rest.
      layer.material.color.setScalar(lift ? 1.18 : 1);
    });
  }

  // -------------------------------------------------------------- layout --
  const aim = new Vector3();
  function frame() {
    const base = sceneArea(width, height);
    // The equipment case stands further right, clear of the long form beside it.
    const area = prop === "case" && base.x > 0.5 ? { ...base, x: Math.min(base.x + 0.08, 1 - base.width / 2 + 0.06) } : base;
    const viewAspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * viewAspect;
    // Room for the poster, the easel's feet and the print slot below it.
    const tall = POSTER_H + 2.1;
    const wide = Math.max(posterW, 2.4) + 0.8;
    // On phones the easel sits between the header and the bottom panel.
    const portrait = viewAspect < 1.05;
    const band = stageBand(width, height);
    const distance = Math.max(wide / (area.width * 2 * halfW), tall / (2 * halfH * (portrait ? (band ? band.half * 1.85 : 0.42) : 0.9)));
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    // With a rail out, the camera rises and looks down past the cards, so
    // the poster's lower edge stays in view above them.
    const raised = MathUtils.smootherstep(railShow.value, 0, 1);
    aim.set(-(area.x - 0.5) * visibleW, -0.45 + ((portrait ? band?.y ?? 0.33 : area.y) - 0.5) * visibleH - raised * distance * 0.02, 0);
    camera.position.set(aim.x, aim.y + distance * (0.08 + raised * RAIL_RISE), distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    const fog = scene.fog as Fog;
    fog.near = distance + 2;
    fog.far = distance + 20;
  }

  // -------------------------------------------------------------- motion --
  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    let moving = false;
    frame();
    damp(intro, 1, reduced ? 60 : 4, dt);
    damp(print, printing ? 1 : 0, reduced ? 60 : 3.2, dt);
    damp(railShow, railOn ? 1 : 0, reduced ? 60 : 5, dt);
    damp(railPos, railFocus, reduced ? 60 : 9, dt);
    damp(explode, layersOn ? 1 : 0, reduced ? 60 : 4.5, dt);
    damp(caseOpen, prop === "case" ? 1 : 0, reduced ? 60 : 3, dt);
    if (!settled(caseOpen, prop === "case" ? 1 : 0)) moving = true;
    if (!settled(intro, 1) || !settled(print, printing ? 1 : 0)) moving = true;
    if (!settled(railShow, railOn ? 1 : 0) || !settled(railPos, railFocus) || !settled(explode, layersOn ? 1 : 0)) moving = true;
    lights.key.position.set(aim.x - 5, 10, 7);
    lights.key.target.position.copy(aim);

    // On the easel: leaning back with the board, lifted a touch on hover.
    // Printing: the poster lifts off, swings flat over the housing and
    // slides down into it until only its top edge shows.
    const p = MathUtils.smootherstep(print.value, 0, 1);
    const lift = hover && !printing ? 0.06 : 0;
    const inCase = prop === "case";
    // A new card drops onto the easel, or rises out of the case's pocket.
    const introDrop = (1 - intro.value) * (inCase ? POSTER_H + 0.4 : 1.2);
    easel.visible = housing.visible = !inCase;
    caseGroup.visible = inCase;
    // The lid swings open as the case comes on screen.
    if (inCase) lid.rotation.x = MathUtils.degToRad(50 - 64 * MathUtils.smootherstep(caseOpen.value, 0, 1));
    const up = MathUtils.smoothstep(p, 0, 0.35);
    const down = MathUtils.smoothstep(p, 0.35, 1);
    posterGroup.position.set(
      0,
      0.05 + lift - introDrop + up * 0.4 - down * (POSTER_H * 0.82 + 1.24),
      MathUtils.lerp(0.06, 1.03, up)
    );
    // Taken apart, the poster turns side-on so its layers fan out toward the viewer.
    const apart = MathUtils.smootherstep(explode.value, 0, 1);
    posterGroup.rotation.set(MathUtils.lerp(inCase ? 0 : LEAN, 0, Math.max(up, apart * 0.6)), apart * -0.72, 0);
    // Upright, its foot down in the pocket.
    if (inCase) posterGroup.position.y -= 0.4;
    posterGroup.position.x += apart * -0.35;
    placeLayers();
    placeRail();
    posterGroup.scale.setScalar(1 - down * 0.12);
    // The lamp pulses while a print runs.
    lampMaterial.emissiveIntensity = printing ? 0.6 + Math.sin(clock * 6) * 0.4 : 0.15;
    if (printing) moving = true;
    if (printed.length && (!printing || print.value > 0.97)) {
      for (const resolve of printed) resolve();
      printed = [];
    }
    return moving;
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  function aimAt(clientX: number, clientY: number, rect: DOMRect) {
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function hit(clientX: number, clientY: number, rect: DOMRect) {
    aimAt(clientX, clientY, rect);
    return raycaster.intersectObject(face, false)[0] ?? null;
  }
  // The face's plane, for drags that run off its edge.
  const plane = new Plane();
  const planeHit = new Vector3();
  function faceUv(clientX: number, clientY: number, rect: DOMRect) {
    aimAt(clientX, clientY, rect);
    face.updateMatrixWorld();
    plane.setFromNormalAndCoplanarPoint(new Vector3(0, 0, 1).transformDirection(face.matrixWorld), new Vector3().setFromMatrixPosition(face.matrixWorld));
    if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
    const local = face.worldToLocal(planeHit.clone());
    return { u: local.x + 0.5, v: 0.5 - local.y };
  }

  applyPalette();
  shape();

  return {
    scene,
    camera,
    setPoster(nextKey, nextAspect, longEdge = 2048) {
      // Phones keep the live texture at 1024 px; elsewhere it stays sharp
      // whatever the quality tier, since the poster is what is being made.
      const edge = Math.min(longEdge, lowPower ? 1024 : 2048);
      const w = Math.max(2, Math.round(nextAspect >= 1 ? edge : edge * nextAspect));
      const h = Math.max(2, Math.round(nextAspect >= 1 ? edge / nextAspect : edge));
      if (nextKey !== key) {
        key = nextKey;
        intro.value = 0;
        intro.velocity = 0;
      }
      if (canvas.width !== w || canvas.height !== h || !texture) {
        canvas.width = w;
        canvas.height = h;
        // A texture can't change size once uploaded; make a new one.
        texture?.dispose();
        texture = makeTexture(canvas, renderer);
        faceMaterial.map = texture;
        faceMaterial.needsUpdate = true;
      }
      aspect = nextAspect;
      shape();
      invalidate();
      return canvas;
    },
    refresh() {
      if (texture) texture.needsUpdate = true;
      invalidate();
    },
    accent() {
      return palette.accent;
    },
    setProp(next) {
      if (next === prop) return;
      prop = next;
      invalidate();
    },
    setPrinting(next) {
      if (next === printing) return;
      printing = next;
      invalidate();
    },
    whenPrinted() {
      if (!printing) return Promise.resolve();
      invalidate();
      return new Promise<void>((resolve) => printed.push(resolve));
    },
    posterPoint(clientX, clientY, rect, extend = false) {
      if (extend) return faceUv(clientX, clientY, rect);
      const found = hit(clientX, clientY, rect);
      return found?.uv ? { u: found.uv.x, v: 1 - found.uv.y } : null;
    },
    setRail(cards, focus) {
      const next = Boolean(cards && cards.length);
      if (cards) railCards = cards;
      railFocus = Math.max(0, Math.min(railCards.length - 1, focus));
      if (next && !railOn) {
        // A rising rail starts at its focus rather than sweeping in from the first card.
        railPos.value = railFocus;
        railPos.velocity = 0;
      }
      railOn = next;
      buildCards();
      invalidate();
    },
    setLayers(planes, selected) {
      layersOn = Boolean(planes);
      layerSelected = selected;
      if (planes) {
        layerOrder = planes.map((item) => item.key);
        const keep = new Set(layerOrder);
        for (const [key, layer] of layerMeshes) {
          if (keep.has(key)) continue;
          layer.mesh.removeFromParent();
          layer.texture.dispose();
          layer.material.dispose();
          layerMeshes.delete(key);
        }
        for (const item of planes) {
          let layer = layerMeshes.get(item.key);
          if (layer && (layer.canvas !== item.canvas || layer.width !== item.canvas.width || layer.height !== item.canvas.height)) {
            layer.texture.dispose();
            layer.texture = makeTexture(item.canvas, renderer);
            layer.material.map = layer.texture;
            layer.material.needsUpdate = true;
            layer.canvas = item.canvas;
            layer.width = item.canvas.width;
            layer.height = item.canvas.height;
          }
          if (!layer) {
            const texture = makeTexture(item.canvas, renderer);
            const material = imageMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false });
            const mesh = new Mesh(layerGeo, material);
            posterGroup.add(mesh);
            layer = { mesh, material, texture, width: item.canvas.width, height: item.canvas.height, canvas: item.canvas };
            layerMeshes.set(item.key, layer);
          }
          layer.texture.needsUpdate = true;
        }
      }
      invalidate();
    },
    refreshLayers() {
      for (const layer of layerMeshes.values()) layer.texture.needsUpdate = true;
      invalidate();
    },
    settle() {
      intro.value = 1;
      intro.velocity = 0;
      frame();
      invalidate();
    },
    setHover(index) {
      const next = index === 0;
      if (next === hover) return;
      hover = next;
      invalidate();
    },
    pick(clientX, clientY, rect) {
      aimAt(clientX, clientY, rect);
      if (rail.visible && railOn) {
        const cards = [...built.values()].filter((card) => card.mesh.visible).map((card) => card.mesh);
        const found = raycaster.intersectObjects(cards, false)[0];
        if (found) {
          const index = railCards.findIndex((data) => built.get(data.key)?.mesh === found.object);
          if (index >= 0) return RAIL_PICK + index;
        }
      }
      if (layersOn && explode.value > 0.5) {
        const meshes = layerOrder.map((key) => layerMeshes.get(key)?.mesh).filter((mesh): mesh is Mesh => Boolean(mesh));
        // Nearest first; a transparent corner of a layer still counts, as its card does.
        const found = raycaster.intersectObjects(meshes, false)[0];
        if (found) return LAYER_PICK + meshes.indexOf(found.object as Mesh);
      }
      return raycaster.intersectObject(face, false)[0] ? 0 : -1;
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
      for (const resolve of printed) resolve();
      printed = [];
      texture?.dispose();
      for (const card of built.values()) {
        card.texture.dispose();
        card.material.dispose();
      }
      built.clear();
      for (const layer of layerMeshes.values()) {
        layer.texture.dispose();
        layer.material.dispose();
      }
      layerMeshes.clear();
      for (const thing of [legGeo, ledgeGeo, boardGeo, faceGeo, housingGeo, slotGeo, lampGeo, floor.geometry, cardGeo, reticle.geometry, layerGeo, caseBox]) thing.dispose();
      for (const material of [woodMaterial, boardMaterial, faceMaterial, housingMaterial, slotMaterial, lampMaterial, reticleMaterial, shellMaterial, rimMaterial, foamMaterial]) material.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      lights.environment.dispose();
      canvas.width = canvas.height = 1;
    }
  };
}
