import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  FramebufferTexture,
  Fog,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type MeshBasicMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type IUniform
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { addLighting, fitText, forgetShadowLights, imageMaterial, loadImage, makeTexture, photoTexture, setShadows } from "./kit";
import { createCarousel, type Carousel, type CarouselCard } from "./carousel";
import { createLightTable, type LightTable, type TablePrint } from "./lightTable";
import type { Board } from "./board";
import type { Deck } from "./deck";
import type { PosterStage } from "./poster";
import {
  columnStrength,
  damp,
  idleWave,
  nearestOccurrence,
  selectionWave,
  settled,
  settlingWave,
  smooth,
  spring,
  stairDrop,
  wrap,
  type Spring
} from "./motion";

/**
 * The three.js side of the 3D album, built on the RhineLabUI archive
 * (https://github.com/LBEILC/RhineLabUI, MIT, Copyright (c) 2026 LBEILC): its
 * card proportions, long-lens camera, studio lighting and selection motion,
 * with each archive card carrying an album instead of a lore file.
 *
 * Two views share one renderer. The archive is a looping field of cards
 * (columns are photographers, rows are their albums) where the selected card
 * lifts a little in preview and rises out for the detail view, its frosted
 * cover clearing to show the album cover. The study is a 360° view of one
 * album's cassette that can be taken apart along its thickness.
 *
 * It renders on demand: nothing is drawn while everything is at rest.
 */

export interface EnginePrint {
  thumb: string;
  med: string;
  width: number;
  height: number;
}

export interface EngineFile {
  column: number;
  title: string;
  owner: string;
  prints: EnginePrint[];
}

/** Palette tokens, resolved to `rgb()` strings. */
export interface EnginePalette {
  page: string;
  surface: string;
  raised: string;
  control: string;
  fg: string;
  subtle: string;
  accent: string;
  dark: boolean;
  fontMeta: string;
  fontSans: string;
}

export type EngineMove = { axis: "file" | "column"; direction: 1 | -1 };

/** Taps, swipes and the wheel on the booking board or the prize deck, for the screen to act on. */
export type StageInput =
  | { kind: "pick"; index: number }
  | { kind: "swipe"; x: -1 | 0 | 1; y: -1 | 0 | 1 }
  | { kind: "wheel"; direction: 1 | -1 };

/**
 * Raw pointers and the wheel on the stage, for screens that edit what is on
 * it (the poster creators). A screen that answers true to "down" or "wheel"
 * takes that pointer, or that wheel step, and the engine's taps and swipes
 * leave it alone.
 */
export type StageDrag =
  | { phase: "down" | "move" | "up" | "cancel"; id: number; clientX: number; clientY: number; rect: DOMRect }
  | { phase: "wheel"; deltaY: number; clientX: number; clientY: number; rect: DOMRect };

/** What the engine needs from a scene module it loads on demand. */
interface StageModule {
  scene: Scene;
  camera: PerspectiveCamera;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

export interface EngineOptions {
  files: EngineFile[];
  columns: number[][];
  palette: EnginePalette;
  reducedMotion: boolean;
  /** Phones and other coarse pointers: no shadows, no idle drift. */
  lowPower: boolean;
  /** Printed on labels. */
  archiveLabel: string;
  onPick: (fileIndex: number) => void;
  onOpen: (fileIndex: number) => void;
  onStep: (move: EngineMove) => void;
  /** Photographer select cards, in column order. */
  cards: CarouselCard[];
  /** A photographer card was tapped: focus it, or open it when already focused. */
  onCard: (index: number, open: boolean) => void;
  /** A print on the light table was tapped, or the wheel moved the focus. */
  onPrint: (index: number, open: boolean) => void;
  /** The opened print reached the photo box (true) or started back down. */
  onRaised?: (raised: boolean) => void;
  /**
   * The scene can't carry on well: "slow" once frames stay slow at the lowest
   * quality, "lost" when the browser dropped WebGL and didn't give it back.
   */
  onTrouble: (kind: "slow" | "lost") => void;
}

export interface ArchiveEngine {
  /** The file next to the selected card on the endless grid; select it next. */
  neighbour(move: EngineMove): number;
  select(fileIndex: number, move?: EngineMove): void;
  setDetail(detail: boolean): void;
  /** Title and menu screens: pull back and let the field idle behind the HUD. */
  setOverview(overview: boolean): void;
  openStudy(fileIndex: number): void;
  closeStudy(): void;
  setExploded(exploded: boolean): void;
  setClear(clear: boolean): void;
  resetView(): void;
  setPalette(palette: EnginePalette): void;
  setReducedMotion(reduced: boolean): void;
  /** Back to the archive field from the carousel, the light table or the study. */
  showField(): void;
  /** Photographer select; `standing` raises the focused card for its own screen. */
  showCarousel(focus: number, standing: boolean): void;
  /** One album's prints on the light table; `raised` lifts the focused one for the photo screen. */
  showTable(key: string, prints: TablePrint[], focus: number, raised: boolean): void;
  /** The booking board, loaded the first time it is shown. */
  showBoard(): Promise<Board | null>;
  /** The prize deck, loaded the first time it is shown. */
  showDeck(): Promise<Deck | null>;
  /** The poster creators' easel, loaded the first time it is shown. */
  showPoster(): Promise<PosterStage | null>;
  /** Where taps, swipes and the wheel on the board or the deck go. */
  setStageHandler(handler: ((input: StageInput) => void) | null): void;
  /** Where raw pointers on the stage go first (see StageDrag). */
  setStageDrag(handler: ((input: StageDrag) => boolean) | null): void;
  dispose(): void;
}

// Reference geometry, in world units.
const CARD_W = 5;
const CARD_H = 3.7;
const CARD_D = 0.31;
const COLUMN_SPACING = 5.2;
const ROW_SPACING = 0.62;
const BASE_Y = -4.6;
const SLOT_Z = -2.17;
const ROW_ORIGIN = 12;
// The selected album stands far enough out of the stack to show most of its
// cover; the reference's 0.4 left only a sliver of it above the next card.
const PREVIEW_LIFT = 2.3;
const DETAIL_LIFT = 4.05;
const HOVER_LIFT = 0.28;
const MAX_ROTATION = 0.8;
const PHOTO_W = 4.25;
const PHOTO_H = 3.0;

// Reference camera: a long lens, 59° azimuth and 19° elevation in the
// archive, turning to an almost frontal view of the raised card.
const direction = (yawDeg: number, elevationDeg: number) => {
  const yaw = MathUtils.degToRad(yawDeg);
  const elevation = MathUtils.degToRad(elevationDeg);
  return new Vector3(
    -Math.sin(yaw) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(yaw) * Math.cos(elevation)
  );
};
const ARCHIVE_DIRECTION = direction(59, 19);
const DETAIL_DIRECTION = new Vector3(-0.277, 0.238, 0.931).normalize();
const ARCHIVE_AIM = new Vector3(-1.091, -0.045, 0.481);
const ARCHIVE_RAISE = 1.4;
const ARCHIVE_DISTANCE = 140;
const DETAIL_DISTANCE = 72;
const ARCHIVE_SPAN = 7.33;
const DETAIL_SPAN = 5.9;
const DESKTOP_DETAIL_SPAN = 7.6;

// Study view.
const STUDY_HOME = new Vector3(7.2, 3.8, 12);
const STUDY_EXPLODED = new Vector3(9.8, 4.6, 14.5);

type Cell = { lane: number; row: number };
const cellKey = (c: Cell) => `${c.lane}:${c.row}`;

/** The card body: origin at the bottom centre, darkening toward its base. */
function cardGeometry() {
  const geometry = new BoxGeometry(CARD_W, CARD_H, CARD_D, 1, 6, 1);
  geometry.translate(0, CARD_H / 2, 0);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const low = new Color(0.4, 0.3, 0.2);
  const high = new Color(1, 0.98, 0.94);
  const mixed = new Color();
  for (let i = 0; i < position.count; i++) {
    const t = smooth((position.getY(i) / CARD_H - 0.1) / 0.9);
    mixed.copy(low).lerp(high, 0.35 + 0.65 * t);
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/**
 * One album cassette, front to back: fasteners, a frosted optical cover with
 * its label, the print stack, a substrate with the light guide, and the
 * carrier. Origin at the bottom centre; `layout` moves the parts along the
 * thickness axis.
 */
interface Cassette {
  group: Group;
  parts: { screws: Group; cover: Group; prints: Mesh[]; substrate: Group; carrier: Mesh };
  clarity: IUniform<number>;
  setPhoto(index: number, image: HTMLImageElement): void;
  layout(explode: number, printOffsets?: number[]): void;
  dispose(): void;
}

function buildCassette(
  renderer: WebGLRenderer,
  palette: EnginePalette,
  archiveLabel: string,
  carrierMaterial: MeshStandardMaterial,
  carrierGeometry: BoxGeometry,
  file: EngineFile,
  prints: EnginePrint[]
): Cassette {
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(thing: T) => {
    owned.push(thing);
    return thing;
  };
  const color = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  const group = new Group();
  const front = CARD_D / 2;

  const carrier = new Mesh(carrierGeometry, carrierMaterial);
  group.add(carrier);

  // Substrate and its amber light guide.
  const substrate = new Group();
  const plate = new Mesh(
    own(new BoxGeometry(CARD_W - 0.24, CARD_H - 0.24, 0.02)),
    own(new MeshStandardMaterial({ color: color(palette.raised), roughness: 0.8 }))
  );
  plate.position.y = CARD_H / 2;
  const guideMaterial = own(new MeshStandardMaterial({ color: color(palette.accent), roughness: 0.35, metalness: 0.15 }));
  guideMaterial.emissive.copy(guideMaterial.color).multiplyScalar(0.18);
  // The guide sits a hair from the cover in the reference; offset the depth
  // test rather than the geometry so it never stripes at grazing angles.
  guideMaterial.polygonOffset = true;
  guideMaterial.polygonOffsetFactor = -1;
  guideMaterial.polygonOffsetUnits = -2;
  const guide = new Mesh(own(new BoxGeometry(0.07, CARD_H - 0.42, 0.03)), guideMaterial);
  guide.position.set(-CARD_W / 2 + 0.2, CARD_H / 2, 0.02);
  substrate.add(plate, guide);
  group.add(substrate);

  // Prints: the first fills the window, the rest fit inside it.
  const photoMaterials: MeshBasicMaterial[] = [];
  const photoAspects: number[] = [];
  const printEdge = own(new MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.7 }));
  const printMeshes = prints.map((print, j) => {
    const aspect = print.width / Math.max(1, print.height);
    let w = PHOTO_W;
    let h = PHOTO_H;
    if (j > 0) {
      if (aspect > PHOTO_W / PHOTO_H) h = PHOTO_W / aspect;
      else w = PHOTO_H * aspect;
    }
    const face = own(imageMaterial({ color: color(palette.control) }));
    photoMaterials.push(face);
    photoAspects.push(w / h);
    const mesh = new Mesh(own(new BoxGeometry(w, h, 0.006)), [printEdge, printEdge, printEdge, printEdge, face, printEdge]);
    mesh.position.set(0.12, CARD_H / 2 + 0.02, 0);
    group.add(mesh);
    return mesh;
  });

  // Frosted cover; clarity sweeps it clear from the top down.
  const clarity: IUniform<number> = { value: 0 };
  const coverCanvas = document.createElement("canvas");
  coverCanvas.width = 1000;
  coverCanvas.height = 740;
  const coverMap = own(makeTexture(coverCanvas, renderer));
  const coverMaterial = own(
    new MeshStandardMaterial({ map: coverMap, transparent: true, roughness: 0.32, depthWrite: false })
  );
  coverMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uClarity = clarity;
    shader.fragmentShader = `uniform float uClarity;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float sweep = uClarity * 1.3 - 0.15;
      float frost = smoothstep(sweep - 0.12, sweep + 0.12, 1.0 - vMapUv.y);
      diffuseColor.a *= mix(0.0, 0.88, frost);`
    );
  };
  coverMaterial.customProgramCacheKey = () => "album-archive-cover";
  const cover = new Group();
  const coverPlane = new Mesh(own(new PlaneGeometry(CARD_W - 0.06, CARD_H - 0.06)), coverMaterial);
  coverPlane.position.y = CARD_H / 2;
  coverPlane.renderOrder = 2;
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 220;
  const labelMap = own(makeTexture(labelCanvas, renderer));
  const label = new Mesh(
    own(new PlaneGeometry(1.1, 0.473)),
    own(new MeshStandardMaterial({ map: labelMap, roughness: 0.55 }))
  );
  // The reference prints its label top left; here it sits in the bottom
  // corner so it covers as little of the photograph as possible.
  label.position.set(-CARD_W / 2 + 0.92, 0.62, 0.004);
  label.renderOrder = 3;
  cover.add(coverPlane, label);
  group.add(cover);

  // Fasteners at the four corners.
  const screws = new Group();
  const screwMaterial = own(new MeshStandardMaterial({ color: color(palette.subtle), roughness: 0.3, metalness: 0.6 }));
  const screwGeometry = own(new CylinderGeometry(0.075, 0.075, 0.03, 16));
  for (const [x, y] of [
    [-CARD_W / 2 + 0.22, 0.22],
    [CARD_W / 2 - 0.22, 0.22],
    [-CARD_W / 2 + 0.22, CARD_H - 0.22],
    [CARD_W / 2 - 0.22, CARD_H - 0.22]
  ]) {
    const screw = new Mesh(screwGeometry, screwMaterial);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, 0);
    screws.add(screw);
  }
  group.add(screws);

  // Engraved circuit lines and the hatch block, as on the reference cover.
  const c = coverCanvas.getContext("2d") as CanvasRenderingContext2D;
  const w = coverCanvas.width;
  const h = coverCanvas.height;
  c.fillStyle = "#f7f4ef";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(90, 80, 68, 0.35)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(70, 210);
  c.lineTo(70, h - 140);
  c.lineTo(120, h - 90);
  c.lineTo(w - 330, h - 90);
  c.moveTo(w - 70, 120);
  c.lineTo(w - 70, h - 200);
  c.lineTo(w - 110, h - 160);
  c.stroke();
  c.fillStyle = "rgba(90, 80, 68, 0.4)";
  for (let i = 0; i < 12; i++) {
    c.save();
    c.translate(w - 300 + i * 13, h - 70);
    c.rotate(-0.35);
    c.fillRect(0, -18, 3, 36);
    c.restore();
  }

  const l = labelCanvas.getContext("2d") as CanvasRenderingContext2D;
  l.fillStyle = "#f9f7f2";
  l.fillRect(0, 0, 512, 220);
  l.strokeStyle = "rgba(30, 28, 24, 0.25)";
  l.strokeRect(1, 1, 510, 218);
  l.fillStyle = "#1c1a16";
  l.font = `600 30px ${palette.fontSans}`;
  l.fillText(fitText(l, archiveLabel.toUpperCase(), 330), 26, 52);
  l.fillRect(390, 26, 90, 12);
  l.font = `600 18px ${palette.fontSans}`;
  l.fillText("INFO", 420, 64);
  // The album's name where the reference prints its file number, as large
  // as fits beside the aperture mark.
  let size = 56;
  l.font = `600 ${size}px ${palette.fontSans}`;
  while (size > 30 && l.measureText(file.title).width > 390) {
    size -= 2;
    l.font = `600 ${size}px ${palette.fontSans}`;
  }
  l.fillText(fitText(l, file.title, 390), 24, 154);
  l.font = `500 22px ${palette.fontSans}`;
  l.fillStyle = "#5a5349";
  l.fillText(fitText(l, file.owner.toUpperCase(), 380), 26, 200);
  // An aperture mark where the reference prints its infinity sign.
  l.strokeStyle = "#1c1a16";
  l.lineWidth = 5;
  for (const r of [24, 9]) {
    l.beginPath();
    l.arc(452, 136, r, 0, Math.PI * 2);
    l.stroke();
  }

  function layout(explode: number, printOffsets?: number[]) {
    const n = printMeshes.length;
    const at = (assembled: number, exploded: number) => MathUtils.lerp(assembled, exploded, explode);
    const printTop = front + 0.024 + n * 0.004;
    const explodedPrintTop = 0.3 + Math.max(0, n - 1) * 0.42;
    carrier.position.z = at(0, -1.5);
    substrate.position.z = at(front + 0.01, -0.55);
    printMeshes.forEach((mesh, j) => {
      const depth = n - 1 - j;
      mesh.position.z = printOffsets?.[j] ?? at(front + 0.024 + depth * 0.004, 0.3 + depth * 0.42);
    });
    cover.position.z = at(printTop + 0.012, explodedPrintTop + 0.95);
    screws.position.z = at(printTop + 0.028, explodedPrintTop + 1.85);
  }
  layout(0);

  return {
    group,
    parts: { screws, cover, prints: printMeshes, substrate, carrier },
    clarity,
    setPhoto(index, image) {
      const material = photoMaterials[index];
      if (!material) return;
      material.map?.dispose();
      material.map = photoTexture(image, renderer, photoAspects[index]);
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    layout,
    dispose() {
      for (const material of photoMaterials) material.map?.dispose();
      for (const thing of owned) thing.dispose();
    }
  };
}

export function createArchiveEngine(canvas: HTMLCanvasElement, options: EngineOptions): ArchiveEngine {
  const { files, columns } = options;
  let palette = options.palette;
  let reduced = options.reducedMotion;
  const lowPower = options.lowPower;

  // Quality tiers, dropped one at a time while frames run slow: 0 has
  // shadows and up to 2x pixels, 1 no shadows and 1.5x, 2 1x and no idle
  // drift. Phones and small screens start at 1.
  let tier = lowPower ? 1 : 0;
  const TIER_PIXELS = [2, 1.5, 1];
  const TIER_SLOW_MS = [20, 26, 45];
  setShadows(tier === 0);
  // Shown on the canvas for checking a device in the browser's inspector.
  canvas.dataset.tier = String(tier);
  // Stage wipes and WebGL context loss (see below); declared early because
  // invalidate() reads them during setup.
  let wipe = 1;
  let rendered = false;
  let lost = false;
  let lostTimer = 0;

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = PCFShadowMap;

  // ---------------------------------------------------------------- field --
  const field = new Scene();
  field.fog = new Fog(0xeae5e1, 22, 47);
  const camera = new PerspectiveCamera(3, 16 / 9, 5, 300);
  const cameraAim = ARCHIVE_AIM.clone();
  camera.position.copy(ARCHIVE_AIM).addScaledVector(ARCHIVE_DIRECTION, ARCHIVE_DISTANCE);
  camera.lookAt(cameraAim);
  const fieldLights = addLighting(renderer, field, !lowPower);

  const cardGeo = cardGeometry();
  const cardMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  const MAX_INSTANCES = 2600;
  const cards = new InstancedMesh(cardGeo, cardMaterial, MAX_INSTANCES);
  cards.castShadow = !lowPower;
  cards.receiveShadow = !lowPower;
  cards.frustumCulled = false;
  const screwGeo = new CylinderGeometry(0.07, 0.07, 0.03, 12);
  screwGeo.rotateX(Math.PI / 2);
  const screwMaterial = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
  const cardScrews = new InstancedMesh(screwGeo, screwMaterial, MAX_INSTANCES);
  cardScrews.frustumCulled = false;
  field.add(cards, cardScrews);
  let instanceCells: Cell[] = [];

  // Every other card shows its album's cover, so the
  // field reads as albums and any of them can be found by its picture. The
  // covers share one atlas, filled as their cards come into view; when it is
  // full, the cover seen longest ago gives up its cell.
  const ATLAS_COLUMNS = 10;
  const ATLAS_ROWS = 14;
  const cellW = lowPower ? 102 : 204;
  const cellH = Math.round((cellW * PHOTO_H) / PHOTO_W);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS_COLUMNS * cellW;
  atlasCanvas.height = ATLAS_ROWS * cellH;
  const atlasContext = atlasCanvas.getContext("2d") as CanvasRenderingContext2D;
  const atlas = makeTexture(atlasCanvas, renderer);
  const slotOf = new Map<number, number>();
  const slotFile: number[] = [];
  const slotSeen: number[] = [];
  const slotReady: boolean[] = [];
  let atlasDirty = false;
  let atlasUploaded = 0;
  function coverSlot(index: number): number {
    const known = slotOf.get(index);
    if (known !== undefined) {
      slotSeen[known] = clock;
      return slotReady[known] ? known : -1;
    }
    const cover = files[index]?.prints[0];
    if (!cover) return -1;
    let slot = slotFile.length;
    if (slot >= ATLAS_COLUMNS * ATLAS_ROWS) {
      slot = -1;
      let oldest = clock;
      for (let i = 0; i < slotSeen.length; i++) {
        if (slotSeen[i] < oldest) {
          oldest = slotSeen[i];
          slot = i;
        }
      }
      if (slot < 0) return -1;
      slotOf.delete(slotFile[slot]);
    }
    slotOf.set(index, slot);
    slotFile[slot] = index;
    slotSeen[slot] = clock;
    slotReady[slot] = false;
    loadImage(cover.thumb)
      .then((image) => {
        if (disposed || slotFile[slot] !== index) return;
        // Cover crop into the cell, as photoTexture does on the cassette.
        const x = (slot % ATLAS_COLUMNS) * cellW;
        const y = Math.floor(slot / ATLAS_COLUMNS) * cellH;
        const scale = Math.max(cellW / image.naturalWidth, cellH / image.naturalHeight);
        const sw = cellW / scale;
        const sh = cellH / scale;
        atlasContext.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, cellW, cellH);
        slotReady[slot] = true;
        atlasDirty = true;
        invalidate();
      })
      .catch(() => undefined);
    return -1;
  }
  const faceGeo = new PlaneGeometry(PHOTO_W, PHOTO_H);
  const faceCells = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
  faceGeo.setAttribute("aCell", faceCells);
  const veil = { value: 0 };
  const veilColor = { value: new Color() };
  const faceMaterial = imageMaterial({ map: atlas });
  // Just in front of the card face; offset the depth test, not the geometry.
  faceMaterial.polygonOffset = true;
  faceMaterial.polygonOffsetFactor = -1;
  faceMaterial.polygonOffsetUnits = -2;
  faceMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uVeil = veil;
    shader.uniforms.uVeilColor = veilColor;
    shader.vertexShader = `attribute vec4 aCell;\n${shader.vertexShader}`.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n  vMapUv = aCell.xy + uv * aCell.zw;"
    );
    shader.fragmentShader = `uniform float uVeil;\nuniform vec3 uVeilColor;\n${shader.fragmentShader}`.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uVeilColor, uVeil);"
    );
  };
  faceMaterial.customProgramCacheKey = () => "album-archive-faces";
  const faces = new InstancedMesh(faceGeo, faceMaterial, MAX_INSTANCES);
  faces.frustumCulled = false;
  faces.count = 0;
  field.add(faces);

  // Files lie on an endless grid: lanes wrap over photographers and rows wrap
  // over that photographer's albums.
  const columnCount = Math.max(1, columns.length);
  const fileAt = ({ lane, row }: Cell) => {
    const list = columns[wrap(lane, columnCount)] ?? [];
    return list.length ? list[wrap(row - ROW_ORIGIN, list.length)] : 0;
  };
  const homeCell = (index: number): Cell => {
    const file = files[index];
    const list = columns[file?.column ?? 0] ?? [];
    return { lane: file?.column ?? 0, row: ROW_ORIGIN + Math.max(0, list.indexOf(index)) };
  };

  let selectedIndex = -1;
  let selectedCell: Cell = homeCell(0);
  let pendingCell: Cell | null = null;
  const lift = spring(0);
  const shoulder = spring(selectedCell.row);
  const laneFocus = spring(selectedCell.lane);
  const trackX = spring(selectedCell.lane * COLUMN_SPACING);
  const rail = spring(SLOT_Z - selectedCell.row * ROW_SPACING);
  const rotation = spring(0);
  let targetRotation = 0;
  const outgoing = new Map<string, { cell: Cell; lift: Spring }>();
  const hoverLifts = new Map<string, number>();
  let hoverCell: Cell | null = null;
  let pulses: { row: number; lane: number; time: number }[] = [];
  let pulseGain = 1;
  let idleGain = 0;
  let lastInteraction = 0;
  let detailTarget = false;
  let detail = 0;
  let overviewTarget = false;
  let overview = 0;
  let clock = performance.now() / 1000;

  // The selected card is a full cassette; every other card is an instance.
  let selected: Cassette | null = null;
  let selectedToken = 0;
  let sharpenSelected: (() => void) | null = null;
  function buildSelected(index: number) {
    selected?.group.removeFromParent();
    selected?.dispose();
    const file = files[index];
    const cassette = buildCassette(renderer, palette, options.archiveLabel, cardMaterial, cardGeo, file, file.prints.slice(0, 1));
    cassette.parts.carrier.castShadow = !lowPower;
    field.add(cassette.group);
    selected = cassette;
    const token = ++selectedToken;
    const cover = file.prints[0];
    sharpenSelected = null;
    if (!cover) return;
    const show = (image: HTMLImageElement) => {
      if (token !== selectedToken) return;
      cassette.setPhoto(0, image);
      invalidate();
    };
    const sharpen = () => loadImage(cover.med).then(show).catch(() => undefined);
    // The larger rendition only matters once the card is raised.
    loadImage(cover.thumb)
      .then((image) => {
        show(image);
        if (detailTarget) sharpen();
        else if (token === selectedToken) sharpenSelected = sharpen;
      })
      .catch(() => undefined);
  }

  function select(index: number, move?: EngineMove) {
    if (!files[index]) return;
    lastInteraction = clock;
    let cell: Cell;
    const nextRow = { lane: selectedCell.lane, row: selectedCell.row + (move?.direction ?? 0) };
    if (pendingCell && fileAt(pendingCell) === index) cell = pendingCell;
    else if (move?.axis === "file" && fileAt(nextRow) === index) cell = nextRow;
    else {
      const home = homeCell(index);
      const period = Math.max(1, (columns[files[index].column] ?? [index]).length);
      const lane = move?.axis === "column" && wrap(selectedCell.lane + move.direction, columnCount) === home.lane
        ? selectedCell.lane + move.direction
        : nearestOccurrence(home.lane, selectedCell.lane, columnCount);
      cell = { lane, row: nearestOccurrence(home.row, selectedCell.row, period) };
    }
    pendingCell = null;
    const first = selectedIndex < 0;
    const changed = cell.lane !== selectedCell.lane || cell.row !== selectedCell.row;
    if (changed) {
      if (lift.value > 1e-3) outgoing.set(cellKey(selectedCell), { cell: selectedCell, lift: { ...lift } });
      const back = outgoing.get(cellKey(cell));
      outgoing.delete(cellKey(cell));
      lift.value = back?.lift.value ?? 0;
      lift.velocity = back?.lift.velocity ?? 0;
      rotation.value = rotation.velocity = targetRotation = 0;
      if (!reduced) {
        pulses.push({ ...cell, time: clock });
        pulses = pulses.slice(-6);
      }
    }
    selectedCell = cell;
    if (first) {
      // Arrive settled: no sweep across the archive on page load.
      shoulder.value = cell.row;
      laneFocus.value = cell.lane;
      trackX.value = cell.lane * COLUMN_SPACING;
      rail.value = SLOT_Z - cell.row * ROW_SPACING;
    }
    if (changed || index !== selectedIndex) {
      selectedIndex = index;
      buildSelected(index);
    }
    invalidate();
  }

  function setDetail(next: boolean) {
    detailTarget = next;
    lastInteraction = clock;
    if (next) {
      sharpenSelected?.();
      sharpenSelected = null;
    } else targetRotation = 0;
    invalidate();
  }

  // -------------------------------------------------------------- framing --
  let width = 1;
  let height = 1;

  /** The reference's viewport framing for desktop, compact and portrait. */
  function framing(d: number) {
    const aspect = width / height;
    const portrait = aspect < 1.05;
    const compact = !portrait && width < 1100;
    // Wide screens keep the raised card clear of the text on either side,
    // so it is framed a little smaller and nearer the middle than the
    // reference's 5.9 span at 550 x 560.
    const detailSpan = portrait || compact ? DETAIL_SPAN : DESKTOP_DETAIL_SPAN;
    const baseSpan = ARCHIVE_SPAN + (detailSpan - ARCHIVE_SPAN) * d;
    const portraitDetailSpan = Math.max(6.3 / aspect, (3.7 * height) / Math.max(100, 0.54 * height - 156));
    const span = portrait
      ? Math.max(baseSpan, 8.4 / aspect + (portraitDetailSpan - 8.4 / aspect) * d)
      : Math.max(baseSpan, (baseSpan * (16 / 9)) / aspect);
    return {
      span,
      portrait,
      previewY: portrait ? 0.34 : 0.5,
      detailX: portrait ? 0.5 : compact ? 0.27 : 0.375,
      detailY: portrait ? 0.27 + 34 / height : compact ? 0.49 : 0.535
    };
  }

  // ---------------------------------------------------------------- study --
  const study = new Scene();
  study.fog = new Fog(0xeae5e1, 10, 30);
  const studyCamera = new PerspectiveCamera(34, 1, 0.3, 120);
  studyCamera.position.copy(STUDY_HOME);
  const studyLights = addLighting(renderer, study, false);
  const controls = new OrbitControls(studyCamera, canvas);
  controls.enabled = false;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 28;
  controls.keyPanSpeed = 14;
  let studyCassette: Cassette | null = null;
  let studyFile = -1;
  let studyToken = 0;
  let sharpeners: (() => void)[] = [];
  const explode = spring(0);
  let exploded = false;
  let studyClear = true;
  let cameraGoal: Vector3 | null = null;
  let mode: "field" | "study" | "carousel" | "table" | "stage" = "field";
  let carousel: Carousel | null = null;
  let table: LightTable | null = null;
  // The booking board, the prize deck and the poster easel: loaded on demand, one shown at a time.
  let stage: StageModule | null = null;
  const stages: { board?: Board; deck?: Deck; poster?: PosterStage } = {};
  let stageToken = 0;
  let stageHandler: ((input: StageInput) => void) | null = null;
  let stageDrag: ((input: StageDrag) => boolean) | null = null;
  /** Pointers a screen took on "down"; their moves and release go to it. */
  const dragged = new Set<number>();
  const stageContext = () => ({ renderer, palette, reduced: () => reduced, lowPower, tier: () => tier, invalidate });

  function buildStudy(index: number) {
    studyCassette?.group.removeFromParent();
    studyCassette?.dispose();
    const file = files[index];
    const token = ++studyToken;
    const cassette = buildCassette(renderer, palette, options.archiveLabel, cardMaterial, cardGeo, file, file.prints);
    cassette.group.position.y = -CARD_H / 2;
    cassette.clarity.value = studyClear ? 1 : 0;
    study.add(cassette.group);
    studyCassette = cassette;
    sharpeners = [];
    file.prints.forEach((print, j) => {
      const show = (image: HTMLImageElement) => {
        if (token !== studyToken) return;
        cassette.setPhoto(j, image);
        invalidate();
      };
      // Only the front print is fully visible while assembled; the others
      // start as thumbnails and sharpen when the cassette is taken apart.
      if (j === 0 || exploded) loadImage(print.med).then(show).catch(() => undefined);
      else {
        loadImage(print.thumb).then(show).catch(() => undefined);
        sharpeners.push(() => loadImage(print.med).then(show).catch(() => undefined));
      }
    });
  }

  function openStudy(index: number) {
    if (!files[index]) return;
    if (mode === "study" && studyFile === index) return;
    if (mode !== "study") enter("study");
    studyFile = index;
    exploded = false;
    explode.value = explode.velocity = 0;
    buildStudy(index);
    mode = "study";
    studyCamera.position.copy(STUDY_HOME);
    controls.target.set(0, 0, 0);
    cameraGoal = null;
    controls.enabled = true;
    controls.listenToKeyEvents(window);
    controls.update();
    invalidate();
  }

  function closeStudy() {
    if (mode !== "study") return;
    snapshot();
    leaveStudy();
    mode = "field";
    snapCamera = true;
    invalidate();
  }

  function leaveStudy() {
    controls.enabled = false;
    controls.stopListenToKeyEvents();
    studyToken += 1;
    studyCassette?.group.removeFromParent();
    studyCassette?.dispose();
    studyCassette = null;
    studyFile = -1;
  }

  /** Switch the rendered stage, tidying up the one being left. */
  function enter(next: typeof mode) {
    if (mode === next) return false;
    snapshot();
    settleUntil = performance.now() + 1000;
    if (mode === "study") leaveStudy();
    if (mode === "carousel") carousel?.setHover(-1);
    if (mode === "table") table?.setHover(-1);
    if (mode === "stage") stage?.setHover(-1);
    // A board or deck still loading must not take over another screen.
    if (next !== "stage") stageToken += 1;
    mode = next;
    canvas.style.cursor = "";
    if (next === "field") snapCamera = true;
    invalidate();
    return true;
  }

  let disposed = false;
  const loading: Partial<Record<keyof typeof stages, Promise<StageModule>>> = {};
  /** Load (once) and show the board or the deck, unless another screen took over meanwhile. */
  function showStage<K extends keyof typeof stages>(name: K, create: () => Promise<NonNullable<(typeof stages)[K]>>) {
    const token = ++stageToken;
    let ready = loading[name] as Promise<NonNullable<(typeof stages)[K]>> | undefined;
    if (!ready) {
      ready = create().then((module) => {
        if (disposed) module.dispose();
        else {
          stages[name] = module;
          module.resize(width, height);
        }
        return module;
      });
      loading[name] = ready as Promise<StageModule>;
    }
    return ready.then((module) => {
      if (disposed || token !== stageToken) return null;
      const switching = stage !== module;
      if (switching && mode === "stage") snapshot();
      stage = module;
      if (enter("stage") || switching) module.settle();
      invalidate();
      return module;
    });
  }

  controls.addEventListener("start", () => {
    cameraGoal = null;
  });
  controls.addEventListener("change", () => invalidate());

  // ------------------------------------------------------------- palette --
  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  function applyPalette() {
    const page = toColor(palette.page);
    renderer.setClearColor(page);
    for (const scene of [field, study]) {
      scene.background = page;
      (scene.fog as Fog).color.copy(page);
      scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    }
    const card = palette.dark
      ? toColor(palette.raised).lerp(toColor(palette.surface), 0.3)
      : toColor(palette.raised).lerp(page, 0.25);
    cardMaterial.color.copy(card);
    veilColor.value.copy(card);
    screwMaterial.color.copy(toColor(palette.subtle)).lerp(card, 0.3);
    for (const lights of [fieldLights, studyLights]) {
      lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
      lights.key.intensity = palette.dark ? 1.1 : 1.4;
    }
    if (selectedIndex >= 0) buildSelected(selectedIndex);
    if (studyFile >= 0) buildStudy(studyFile);
    carousel?.setPalette(palette);
    table?.setPalette(palette);
    stages.board?.setPalette(palette);
    stages.deck?.setPalette(palette);
    stages.poster?.setPalette(palette);
  }

  // --------------------------------------------------------------- sizing --
  let snapCamera = true;
  function resize() {
    const rect = canvas.parentElement?.getBoundingClientRect();
    width = Math.max(1, Math.round(rect?.width ?? canvas.clientWidth));
    height = Math.max(1, Math.round(rect?.height ?? canvas.clientHeight));
    renderer.setPixelRatio(tierPixels());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    studyCamera.aspect = width / height;
    studyCamera.fov = width / height < 0.8 ? 52 : 34;
    studyCamera.updateProjectionMatrix();
    carousel?.resize(width, height);
    table?.resize(width, height);
    stages.board?.resize(width, height);
    stages.deck?.resize(width, height);
    stages.poster?.resize(width, height);
    snapCamera = true;
    invalidate();
  }

  const tierPixels = () => Math.min(window.devicePixelRatio || 1, TIER_PIXELS[tier]);
  const restPixels = () => Math.min(window.devicePixelRatio || 1, TIER_PIXELS[0]);
  function setPixels(ratio: number) {
    if (renderer.getPixelRatio() === ratio) return;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
  }

  // ----------------------------------------------------------------- loop --
  let raf = 0;
  let last = 0;
  function invalidate() {
    if (!raf && !lost) raf = requestAnimationFrame(frame);
  }

  const dummy = new Object3D();
  const worldUp = new Vector3(0, 1, 0);
  const right = new Vector3();
  const up = new Vector3();
  const viewDirection = new Vector3();
  const aim = new Vector3();
  const detailAim = new Vector3();
  const cardPosition = new Vector3();
  const cameraPosition = new Vector3();
  const origin = new Vector3();

  function height3(row: number, lane: number) {
    const ridge = (settlingWave(row - shoulder.value) - stairDrop(row - shoulder.value)) * columnStrength(lane, laneFocus.value);
    let ripple = 0;
    for (const p of pulses) ripple += selectionWave(Math.hypot(row - p.row, (lane - p.lane) * 2.2), clock - p.time);
    const breathing = idleGain > 0 ? idleWave(row, lane, clock) * idleGain : 0;
    return ridge + MathUtils.clamp(ripple, -0.6, 0.6) * pulseGain + breathing;
  }

  function stepField(dt: number): boolean {
    let moving = false;
    const rate = (r: number) => (reduced ? 35 : r);
    const railTarget = SLOT_Z - selectedCell.row * ROW_SPACING;
    damp(shoulder, selectedCell.row, rate(5), dt);
    damp(laneFocus, selectedCell.lane, rate(4), dt);
    damp(trackX, selectedCell.lane * COLUMN_SPACING, rate(3.7), dt);
    damp(rail, railTarget, rate(3.7), dt);
    damp(rotation, targetRotation, rate(9), dt);
    // Turn back to face the slot before descending, as the reference does.
    const liftTarget = overviewTarget ? 0 : detailTarget ? DETAIL_LIFT : Math.abs(rotation.value) < 0.02 ? PREVIEW_LIFT : lift.value;
    damp(lift, liftTarget, rate(4.2), dt);
    moving ||= !settled(shoulder, selectedCell.row) || !settled(laneFocus, selectedCell.lane);
    moving ||= !settled(trackX, selectedCell.lane * COLUMN_SPACING) || !settled(rail, railTarget);
    moving ||= !settled(lift, liftTarget) || !settled(rotation, targetRotation);

    for (const [key, o] of outgoing) {
      damp(o.lift, 0, rate(4.5), dt);
      if (settled(o.lift, 0)) outgoing.delete(key);
      else moving = true;
    }
    const hoverKey = hoverCell ? cellKey(hoverCell) : null;
    if (hoverKey && !hoverLifts.has(hoverKey)) hoverLifts.set(hoverKey, 0);
    for (const [key, value] of hoverLifts) {
      const target = key === hoverKey ? HOVER_LIFT : 0;
      const next = reduced ? target : MathUtils.lerp(value, target, 1 - Math.exp(-dt * 14));
      if (Math.abs(next - target) > 1e-3) moving = true;
      if (target === 0 && next < 1e-3) hoverLifts.delete(key);
      else hoverLifts.set(key, next);
    }

    pulses = pulses.filter((p) => clock - p.time < 3.2);
    if (pulses.length) moving = true;
    pulseGain = MathUtils.lerp(pulseGain, detailTarget ? 0 : 1, 1 - Math.exp(-dt * 8));
    // Idle breathing after 2.5 s, on full-power devices only.
    const idle = !lowPower && tier < 2 && !reduced && !detailTarget && detail < 0.01 && (overviewTarget || clock - lastInteraction > 2.5);
    idleGain = MathUtils.lerp(idleGain, idle ? 1 : 0, 1 - Math.exp(-dt * (idle ? 0.8 : 4)));
    if (idleGain > 1e-3) moving = true;
    else idleGain = 0;

    const detailGoal = detailTarget
      ? smooth((lift.value - PREVIEW_LIFT) / (DETAIL_LIFT - 0.85 - PREVIEW_LIFT))
      : smooth((lift.value - PREVIEW_LIFT) / (DETAIL_LIFT - PREVIEW_LIFT));
    detail = reduced ? detailGoal : MathUtils.lerp(detail, detailGoal, 1 - Math.exp(-dt * 10));
    if (Math.abs(detail - detailGoal) > 1e-3) moving = true;
    else detail = detailGoal;

    // The frosted cover clears from the top down once the card stands out of
    // the stack, and frosts again as it sinks back.
    const clarityTarget = !overviewTarget && lift.value > PREVIEW_LIFT - 0.5 ? 1 : 0;
    if (selected) {
      const c = selected.clarity;
      const next = reduced ? clarityTarget : MathUtils.lerp(c.value, clarityTarget, 1 - Math.exp(-dt * (clarityTarget ? 3.2 : 9)));
      if (Math.abs(next - clarityTarget) > 1e-3) {
        c.value = next;
        moving = true;
      } else c.value = clarityTarget;
    }

    // Menus pull the camera back so the field reads as a backdrop.
    const overviewGoal = overviewTarget ? 1 : 0;
    overview = reduced ? overviewGoal : MathUtils.lerp(overview, overviewGoal, 1 - Math.exp(-dt * 3));
    if (Math.abs(overview - overviewGoal) > 1e-3) moving = true;
    else overview = overviewGoal;

    // Lay out the visible window of the endless grid.
    const f = framing(detail);
    const span = f.span * (1 + 0.85 * overview);
    const lanesHalf = Math.min(8, Math.ceil((span * 1.15) / COLUMN_SPACING) + 2);
    const rowsHalf = Math.min(46, Math.ceil((span * 2.6) / ROW_SPACING) + 6);
    const centerLane = Math.round(trackX.value / COLUMN_SPACING);
    const centerRow = Math.round((SLOT_Z - rail.value) / ROW_SPACING);
    let count = 0;
    let faceCount = 0;
    instanceCells = [];
    // Nearest first (the camera sits on the -x, +z side), so the depth test
    // rejects the hidden faces of the dense stack instead of shading them.
    for (let lane = centerLane - lanesHalf; lane <= centerLane + lanesHalf; lane++) {
      for (let row = centerRow + rowsHalf; row >= centerRow - rowsHalf && count < MAX_INSTANCES; row--) {
        if (lane === selectedCell.lane && row === selectedCell.row) continue;
        const key = `${lane}:${row}`;
        const x = lane * COLUMN_SPACING - trackX.value;
        const y = BASE_Y + height3(row, lane) + (outgoing.get(key)?.lift.value ?? 0) + (hoverLifts.get(key) ?? 0);
        const z = row * ROW_SPACING + rail.value;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        cards.setMatrixAt(count, dummy.matrix);
        dummy.position.set(x + CARD_W / 2 - 0.24, y + CARD_H - 0.2, z + CARD_D / 2);
        dummy.updateMatrix();
        cardScrews.setMatrixAt(count, dummy.matrix);
        instanceCells.push({ lane, row });
        count += 1;
        const slot = coverSlot(fileAt({ lane, row }));
        if (slot >= 0) {
          // Where the cassette holds its front print.
          dummy.position.set(x + 0.12, y + CARD_H / 2 + 0.02, z + CARD_D / 2);
          dummy.updateMatrix();
          faces.setMatrixAt(faceCount, dummy.matrix);
          // The cell, inset half a pixel against bleeding from its neighbours.
          const u = ((slot % ATLAS_COLUMNS) * cellW + 0.5) / atlasCanvas.width;
          const v = 1 - ((Math.floor(slot / ATLAS_COLUMNS) + 1) * cellH - 0.5) / atlasCanvas.height;
          faceCells.setXYZW(faceCount, u, v, (cellW - 1) / atlasCanvas.width, (cellH - 1) / atlasCanvas.height);
          faceCount += 1;
        }
      }
    }
    cards.count = cardScrews.count = count;
    cards.instanceMatrix.needsUpdate = true;
    cardScrews.instanceMatrix.needsUpdate = true;
    faces.count = faceCount;
    faces.instanceMatrix.needsUpdate = true;
    faceCells.needsUpdate = true;
    // Covers arrive one by one; upload the atlas a few times a second at most.
    if (atlasDirty) {
      if (clock - atlasUploaded > 0.25) {
        atlas.needsUpdate = true;
        atlasDirty = false;
        atlasUploaded = clock;
      }
      moving = true;
    }
    // Covers show as they are; menus quiet them down to plain cards
    // behind their text.
    veil.value = overview;
    faces.visible = overview < 0.99;

    cardPosition.set(
      selectedCell.lane * COLUMN_SPACING - trackX.value,
      BASE_Y + height3(selectedCell.row, selectedCell.lane) + lift.value,
      selectedCell.row * ROW_SPACING + rail.value
    );
    if (selected) {
      selected.group.position.copy(cardPosition);
      selected.group.rotation.y = rotation.value;
    }

    // The camera holds still in the archive (the array moves under it), then
    // turns toward the raised card and keeps it at the framing anchor.
    viewDirection.copy(ARCHIVE_DIRECTION).lerp(DETAIL_DIRECTION, detail).normalize();
    const distance = MathUtils.lerp(ARCHIVE_DISTANCE, DETAIL_DISTANCE, detail);
    right.crossVectors(worldUp, viewDirection).normalize();
    up.crossVectors(viewDirection, right).normalize();
    const pixelScale = height / span;
    if (f.portrait) {
      aim.set(0, BASE_Y + settlingWave(0) + PREVIEW_LIFT + CARD_H / 2, SLOT_Z);
      aim.addScaledVector(up, ((f.previewY - 0.5) * height) / pixelScale);
    } else {
      // Look a little higher than the reference so the standing card keeps
      // its top in frame; menus drop back to the reference view.
      aim.copy(ARCHIVE_AIM);
      aim.y += ARCHIVE_RAISE * (1 - overview);
    }
    detailAim.copy(cardPosition).setY(cardPosition.y + CARD_H / 2);
    detailAim.addScaledVector(right, ((0.5 - f.detailX) * width) / pixelScale);
    detailAim.addScaledVector(up, ((f.detailY - 0.5) * height) / pixelScale);
    aim.lerp(detailAim, detail);
    // Leave the left side of wide screens to the menu.
    if (!f.portrait) aim.addScaledVector(right, (-0.17 * width * overview) / pixelScale);
    cameraPosition.copy(aim).addScaledVector(viewDirection, distance);
    const blend = reduced || snapCamera ? 1 : 1 - Math.exp(-dt * 5);
    snapCamera = false;
    camera.position.lerp(cameraPosition, blend);
    cameraAim.lerp(aim, blend);
    camera.lookAt(cameraAim);
    const fov = MathUtils.radToDeg(2 * Math.atan(span / (2 * distance)));
    camera.fov = MathUtils.lerp(camera.fov, fov, blend);
    camera.updateProjectionMatrix();
    if (camera.position.distanceTo(cameraPosition) > 1e-3 || Math.abs(camera.fov - fov) > 1e-5) moving = true;
    const fog = field.fog as Fog;
    const rendered = camera.position.distanceTo(cameraAim);
    fog.near = rendered + MathUtils.lerp(5, -1, detail);
    fog.far = rendered + MathUtils.lerp(25, 12, detail) + 18 * overview;
    fieldLights.key.position.set(cameraAim.x - 6, cameraAim.y + 14, cameraAim.z - 5);
    fieldLights.key.target.position.copy(cameraAim);
    return moving;
  }

  function stepStudy(dt: number): boolean {
    let moving = false;
    const target = exploded ? 1 : 0;
    damp(explode, target, reduced ? 35 : 3.6, dt);
    if (!settled(explode, target)) moving = true;
    if (studyCassette) {
      const n = studyCassette.parts.prints.length;
      // Prints peel off one after another rather than as a block.
      const offsets = studyCassette.parts.prints.map((_, j) => {
        const depth = n - 1 - j;
        const t = reduced
          ? explode.value
          : MathUtils.clamp(explode.value * (1 + n * 0.06) - (exploded ? j : depth) * 0.06, 0, 1);
        return MathUtils.lerp(CARD_D / 2 + 0.024 + depth * 0.004, 0.3 + depth * 0.42, smooth(t));
      });
      studyCassette.layout(explode.value, offsets);
      // Keep the exploded stack centred on the orbit target.
      const front = 0.3 + Math.max(0, n - 1) * 0.42 + 1.85;
      studyCassette.group.position.z = MathUtils.lerp(0, -(front - 1.5) / 2, explode.value);
      const c = studyCassette.clarity;
      const goalClarity = studyClear ? 1 : 0;
      c.value = reduced ? goalClarity : MathUtils.lerp(c.value, goalClarity, 1 - Math.exp(-dt * 6));
      if (Math.abs(c.value - goalClarity) > 1e-3) moving = true;
      else c.value = goalClarity;
    }
    if (cameraGoal) {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 5.5);
      studyCamera.position.lerp(cameraGoal, k);
      controls.target.lerp(origin, k);
      if (studyCamera.position.distanceTo(cameraGoal) < 0.01) cameraGoal = null;
      moving = true;
    }
    if (controls.update()) moving = true;
    const fog = study.fog as Fog;
    const distance = studyCamera.position.distanceTo(controls.target);
    fog.near = distance - 1;
    fog.far = distance + 12;
    return moving;
  }

  /** The scene and camera on screen now. */
  function view(): [Scene, PerspectiveCamera] {
    if (mode === "carousel" && carousel) return [carousel.scene, carousel.camera];
    if (mode === "table" && table) return [table.scene, table.camera];
    if (mode === "stage" && stage) return [stage.scene, stage.camera];
    if (mode === "study") return [study, studyCamera];
    return [field, camera];
  }

  function frame(now: number) {
    raf = 0;
    const ms = last ? now - last : 0;
    const dt = last ? Math.min(0.05, ms / 1000) : 1 / 60;
    last = now;
    clock = now / 1000;
    let moving: boolean;
    if (mode === "carousel" && carousel) moving = carousel.step(dt);
    else if (mode === "table" && table) moving = table.step(dt);
    else if (mode === "stage" && stage) moving = stage.step(dt);
    else if (mode === "study") moving = stepStudy(dt);
    else moving = stepField(dt);
    // The tier's pixel ratio holds while things move; the frame things come
    // to rest on is drawn at the screen's own, so a still poster, cover or
    // print is never left upscaled and soft.
    setPixels(moving || wipe < 1 ? tierPixels() : restPixels());
    renderer.render(...view());
    rendered = true;
    if (wipe < 1) {
      wipe = reduced ? 1 : Math.min(1, wipe + dt / WIPE_SECONDS);
      wipeUniforms.progress.value = smooth(wipe);
      renderer.autoClear = false;
      renderer.render(wipeScene, wipeCamera);
      renderer.autoClear = true;
      moving = true;
    }
    if (ms) measure(ms, now);
    if (moving) invalidate();
    else last = 0;
  }

  // ------------------------------------------------------------- quality --
  let samples = 0;
  let sampleMs = 0;
  let slowReported = false;
  // Shader compiles and texture uploads stall the first frames of a stage.
  let settleUntil = performance.now() + 2000;
  /** Average frame times while things move; a slow run drops a tier. */
  function measure(ms: number, now: number) {
    if (document.hidden || now < settleUntil) {
      samples = sampleMs = 0;
      return;
    }
    // A stalled frame counts as 250 ms, so one long task can't decide alone.
    samples += 1;
    sampleMs += Math.min(ms, 250);
    if (samples < 40 && (samples < 6 || sampleMs < 1500)) return;
    const average = sampleMs / samples;
    samples = sampleMs = 0;
    if (average <= TIER_SLOW_MS[tier]) return;
    if (tier < 2) {
      tier += 1;
      canvas.dataset.tier = String(tier);
      setShadows(false);
      resize();
      settleUntil = now + 500;
    } else if (!slowReported) {
      slowReported = true;
      options.onTrouble("slow");
    }
  }

  // --------------------------------------------------------- transitions --
  // Moving between stages wipes the old stage's last frame away along a
  // diagonal with an accent edge, instead of cutting. Reduced motion cuts.
  const WIPE_SECONDS = 0.5;
  let wipeTexture: FramebufferTexture | null = null;
  const bufferSize = new Vector2();
  const wipeUniforms = { map: { value: null as FramebufferTexture | null }, progress: { value: 1 }, edge: { value: new Color() } };
  const wipeScene = new Scene();
  const wipeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const wipeQuad = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: wipeUniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D map;
        uniform float progress;
        uniform vec3 edge;
        varying vec2 vUv;
        void main() {
          float k = vUv.x * 0.82 + (1.0 - vUv.y) * 0.18 - (progress * 1.3 - 0.15);
          if (k < 0.0) discard;
          vec3 old = texture2D(map, vUv).rgb;
          float band = 1.0 - smoothstep(0.0, 0.012, k);
          float shade = 1.0 - smoothstep(0.0, 0.08, k);
          gl_FragColor = vec4(mix(old * (1.0 - shade * 0.18), edge, band), 1.0);
        }`
    })
  );
  wipeQuad.frustumCulled = false;
  wipeScene.add(wipeQuad);

  /** Keep the frame on screen now, to wipe away once the next stage draws. */
  function snapshot() {
    if (reduced || !rendered || lost) return;
    renderer.render(...view());
    renderer.getDrawingBufferSize(bufferSize);
    if (!wipeTexture || wipeTexture.image.width !== bufferSize.x || wipeTexture.image.height !== bufferSize.y) {
      wipeTexture?.dispose();
      wipeTexture = new FramebufferTexture(bufferSize.x, bufferSize.y);
    }
    renderer.copyFramebufferToTexture(wipeTexture);
    wipeUniforms.map.value = wipeTexture;
    wipeUniforms.edge.value.setStyle(palette.accent, SRGBColorSpace).convertLinearToSRGB();
    wipe = 0;
    invalidate();
  }

  // ---------------------------------------------------------- context loss --
  // Mobile Safari drops WebGL under memory pressure. three.js keeps the
  // context restorable; if it isn't back soon, the site offers the classic page.
  function onContextLost() {
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    lostTimer = window.setTimeout(() => options.onTrouble("lost"), 3000);
  }
  function onContextRestored() {
    lost = false;
    clearTimeout(lostTimer);
    wipeTexture?.dispose();
    wipeTexture = null;
    wipe = 1;
    resize();
  }
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  // ------------------------------------------------------------- pointers --
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let down: { x: number; y: number; t: number; id: number; rotation: number } | null = null;
  let hoverFrame = 0;

  function pick(clientX: number, clientY: number): { cell: Cell; selected: boolean } | null {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets: Object3D[] = [cards];
    if (selected) targets.push(selected.group);
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    if (hit.object === cards && hit.instanceId !== undefined) {
      const cell = instanceCells[hit.instanceId];
      return cell ? { cell, selected: false } : null;
    }
    return { cell: selectedCell, selected: true };
  }

  /** Taps and swipes on the carousel and the light table. */
  function stagePointerUp(e: PointerEvent, dx: number, dy: number, elapsed: number) {
    if (e.type === "pointercancel") return;
    const rect = canvas.getBoundingClientRect();
    const tap = Math.hypot(dx, dy) < 8 && elapsed < 600;
    if (mode === "carousel" && carousel) {
      if (tap) {
        const index = carousel.pick(e.clientX, e.clientY, rect);
        if (index >= 0) options.onCard(index, index === carousel.focus());
      } else if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3 && elapsed < 1400) {
        options.onCard(carousel.focus() + (dx < 0 ? 1 : -1), false);
      }
    } else if (mode === "table" && table && !tableRaised) {
      if (tap) {
        const index = table.pick(e.clientX, e.clientY, rect);
        if (index >= 0) options.onPrint(index, true);
      } else if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx) * 1.3 && elapsed < 1400) {
        options.onPrint(table.focus() + (dy < 0 ? 1 : -1) * table.columns(), false);
      }
    } else if (mode === "stage" && stage) {
      if (tap) {
        const index = stage.pick(e.clientX, e.clientY, rect);
        if (index >= 0) stageHandler?.({ kind: "pick", index });
        return;
      }
      const major = Math.max(Math.abs(dx), Math.abs(dy));
      if (major < 36 || major < Math.min(Math.abs(dx), Math.abs(dy)) * 1.3 || elapsed > 1400) return;
      if (Math.abs(dx) > Math.abs(dy)) stageHandler?.({ kind: "swipe", x: dx < 0 ? 1 : -1, y: 0 });
      else stageHandler?.({ kind: "swipe", x: 0, y: dy < 0 ? 1 : -1 });
    }
  }

  function stagePointerMove(e: PointerEvent) {
    if (e.pointerType !== "mouse" || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const rect = canvas.getBoundingClientRect();
      if (mode === "carousel" && carousel) {
        carousel.setPointer(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1);
        const index = carousel.pick(e.clientX, e.clientY, rect);
        carousel.setHover(index);
        canvas.style.cursor = index >= 0 ? "pointer" : "";
      } else if (mode === "table" && table) {
        const index = tableRaised ? -1 : table.pick(e.clientX, e.clientY, rect);
        table.setHover(index);
        canvas.style.cursor = index >= 0 ? "pointer" : "";
      } else if (mode === "stage" && stage) {
        const index = stage.pick(e.clientX, e.clientY, rect);
        stage.setHover(index);
        canvas.style.cursor = index >= 0 ? "pointer" : "";
      }
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (mode === "stage" && stageDrag?.({ phase: "down", id: e.pointerId, clientX: e.clientX, clientY: e.clientY, rect: canvas.getBoundingClientRect() })) {
      dragged.add(e.pointerId);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (mode === "carousel" || mode === "table" || mode === "stage") {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, rotation: 0 };
      return;
    }
    if (mode !== "field") return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, rotation: targetRotation };
    if (detailTarget) canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragged.has(e.pointerId)) {
      stageDrag?.({ phase: "move", id: e.pointerId, clientX: e.clientX, clientY: e.clientY, rect: canvas.getBoundingClientRect() });
      return;
    }
    if (mode === "carousel" || mode === "table" || mode === "stage") return stagePointerMove(e);
    if (mode !== "field") return;
    if (down && down.id === e.pointerId && detailTarget && lift.value > 3.3) {
      // Drag to inspect the raised card, within the reference's ±0.8 rad.
      targetRotation = MathUtils.clamp(down.rotation + (e.clientX - down.x) * 0.006, -MAX_ROTATION, MAX_ROTATION);
      lastInteraction = clock;
      invalidate();
      return;
    }
    if (e.pointerType !== "mouse" || detailTarget || overviewTarget || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const hit = pick(e.clientX, e.clientY);
      canvas.style.cursor = hit ? "pointer" : "";
      const next = hit && !hit.selected ? hit.cell : null;
      if (next?.lane !== hoverCell?.lane || next?.row !== hoverCell?.row) {
        hoverCell = next;
        invalidate();
      }
    });
  }

  function onPointerUp(e: PointerEvent) {
    if (dragged.delete(e.pointerId)) {
      const phase = e.type === "pointercancel" ? "cancel" : "up";
      stageDrag?.({ phase, id: e.pointerId, clientX: e.clientX, clientY: e.clientY, rect: canvas.getBoundingClientRect() });
      return;
    }
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const elapsed = performance.now() - down.t;
    down = null;
    if (mode === "carousel" || mode === "table" || mode === "stage") return stagePointerUp(e, dx, dy, elapsed);
    if (mode !== "field") return;
    if (detailTarget || overviewTarget || e.type === "pointercancel") return;
    if (Math.hypot(dx, dy) < 8 && elapsed < 600) {
      const hit = pick(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.selected) options.onOpen(selectedIndex);
      else {
        pendingCell = hit.cell;
        options.onPick(fileAt(hit.cell));
      }
      return;
    }
    // Reference swipe rules: 36 px, a clear main direction, within 1.4 s.
    const major = Math.max(Math.abs(dx), Math.abs(dy));
    const minor = Math.min(Math.abs(dx), Math.abs(dy));
    if (major < 36 || major < minor * 1.3 || elapsed > 1400) return;
    if (Math.abs(dx) > Math.abs(dy)) options.onStep({ axis: "column", direction: dx < 0 ? 1 : -1 });
    else options.onStep({ axis: "file", direction: dy < 0 ? 1 : -1 });
  }

  function onPointerLeave() {
    carousel?.setHover(-1);
    carousel?.setPointer(0, 0);
    table?.setHover(-1);
    stage?.setHover(-1);
    if (!hoverCell) return;
    hoverCell = null;
    invalidate();
  }

  let wheelAt = 0;
  let tableRaised = false;
  function onWheel(e: WheelEvent) {
    if (mode === "study") return;
    e.preventDefault();
    if (mode === "stage" && stageDrag?.({ phase: "wheel", deltaY: e.deltaY, clientX: e.clientX, clientY: e.clientY, rect: canvas.getBoundingClientRect() })) return;
    if (mode === "carousel" || mode === "table" || mode === "stage") {
      const now = performance.now();
      if (now - wheelAt < 260 || Math.abs(e.deltaY) < 4) return;
      wheelAt = now;
      const direction = e.deltaY > 0 ? 1 : -1;
      if (mode === "stage") {
        stageHandler?.({ kind: "wheel", direction });
        return;
      }
      if (mode === "carousel" && carousel) options.onCard(carousel.focus() + direction, false);
      else if (table && !tableRaised) options.onPrint(table.focus() + direction * table.columns(), false);
      return;
    }
    if (detailTarget || overviewTarget) return;
    const now = performance.now();
    if (now - wheelAt < 260 || Math.abs(e.deltaY) < 4) return;
    wheelAt = now;
    options.onStep({ axis: "file", direction: e.deltaY > 0 ? 1 : -1 });
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const observer = new ResizeObserver(resize);
  if (canvas.parentElement) observer.observe(canvas.parentElement);

  applyPalette();
  resize();

  return {
    neighbour(move) {
      const cell = move.axis === "file"
        ? { lane: selectedCell.lane, row: selectedCell.row + move.direction }
        : { lane: selectedCell.lane + move.direction, row: selectedCell.row };
      pendingCell = cell;
      return fileAt(cell);
    },
    select,
    setDetail,
    setOverview(next) {
      overviewTarget = next;
      if (next) hoverCell = null;
      lastInteraction = clock;
      invalidate();
    },
    openStudy,
    closeStudy,
    setExploded(next) {
      if (mode !== "study") return;
      exploded = next;
      if (next) {
        for (const sharpen of sharpeners) sharpen();
        sharpeners = [];
      }
      cameraGoal = (exploded ? STUDY_EXPLODED : STUDY_HOME).clone();
      invalidate();
    },
    setClear(next) {
      studyClear = next;
      invalidate();
    },
    resetView() {
      if (mode !== "study") return;
      cameraGoal = (exploded ? STUDY_EXPLODED : STUDY_HOME).clone();
      invalidate();
    },
    setPalette(next) {
      palette = next;
      applyPalette();
      invalidate();
    },
    setReducedMotion(next) {
      reduced = next;
      controls.enableDamping = !next;
      if (next) pulses = [];
      invalidate();
    },
    showField() {
      enter("field");
    },
    showCarousel(focus, standing) {
      if (!carousel) {
        carousel = createCarousel({ ...stageContext(), cards: options.cards });
        carousel.resize(width, height);
      }
      carousel.setFocus(focus);
      carousel.setStanding(standing);
      if (enter("carousel")) carousel.settle();
      invalidate();
    },
    showTable(key, prints, focus, raised) {
      if (!table) {
        table = createLightTable({ ...stageContext(), onRaised: options.onRaised });
        table.resize(width, height);
      }
      table.setPrints(key, prints);
      table.setFocus(focus);
      table.setRaised(raised);
      tableRaised = raised;
      if (raised) table.setHover(-1);
      if (enter("table")) table.settle();
      invalidate();
    },
    showBoard() {
      return showStage("board", () => import("./board").then((m) => m.createBoard(stageContext())));
    },
    showDeck() {
      return showStage("deck", () => import("./deck").then((m) => m.createDeck(stageContext())));
    },
    showPoster() {
      return showStage("poster", () => import("./poster").then((m) => m.createPosterStage(stageContext())));
    },
    setStageHandler(handler) {
      stageHandler = handler;
    },
    setStageDrag(handler) {
      stageDrag = handler;
      if (!handler) dragged.clear();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(lostTimer);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      wipeTexture?.dispose();
      wipeQuad.geometry.dispose();
      (wipeQuad.material as ShaderMaterial).dispose();
      forgetShadowLights();
      cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      controls.stopListenToKeyEvents();
      controls.dispose();
      selected?.dispose();
      studyCassette?.dispose();
      carousel?.dispose();
      table?.dispose();
      stages.board?.dispose();
      stages.deck?.dispose();
      stages.poster?.dispose();
      for (const thing of [cardGeo, screwGeo, cardMaterial, screwMaterial, faceGeo, faceMaterial, atlas, fieldLights.environment, studyLights.environment])
        thing.dispose();
      cards.dispose();
      cardScrews.dispose();
      faces.dispose();
      renderer.dispose();
    }
  };
}
