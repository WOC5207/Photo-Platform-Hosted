import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * The three.js side of the 3D album: an isometric field of archive bars with
 * one upright panel per album, and a 360° study of a single album whose prints
 * can be pulled apart and stacked back together.
 *
 * Everything here is imperative and React-free. The page component owns which
 * album is selected and tells the engine; the engine only reports picks,
 * swipes and wheel steps back. It renders on demand: nothing is drawn while
 * the scene is at rest, which is most of the time on a phone.
 */

export interface EnginePrint {
  thumb: string;
  med: string;
  width: number;
  height: number;
}

export interface EngineFile {
  number: number;
  column: number;
  title: string;
  owner: string;
  meta: string;
  prints: EnginePrint[];
}

/** Palette tokens, already resolved to `rgb(r g b)` strings. */
export interface EnginePalette {
  page: string;
  surface: string;
  raised: string;
  control: string;
  fg: string;
  subtle: string;
  accent: string;
  fontMeta: string;
  fontSans: string;
}

export interface EngineOptions {
  files: EngineFile[];
  columns: number[][];
  palette: EnginePalette;
  reducedMotion: boolean;
  compact: boolean;
  /** Text printed on panels and the album's file card. */
  archiveLabel: string;
  onPick: (fileIndex: number) => void;
  onOpen: (fileIndex: number) => void;
  onStep: (axis: "file" | "column", direction: 1 | -1) => void;
}

export interface ArchiveEngine {
  select(fileIndex: number): void;
  openObject(fileIndex: number): void;
  closeObject(): void;
  setExploded(exploded: boolean): void;
  resetView(): void;
  setPalette(palette: EnginePalette): void;
  setCompact(compact: boolean): void;
  dispose(): void;
}

// Field layout, in world units.
const COLUMN_SPACING = 4.4;
const FILE_SPACING = 1;
const ROW_SPACING = FILE_SPACING / 2;
const BAR_DEPTH = 0.36;
const PANEL_W = 2.4;
const PANEL_H = 3.2;
const PANEL_D = 0.1;
/** Panels sit in the gap between two bar rows. */
const PANEL_Z_OFFSET = ROW_SPACING / 2;
const PANEL_TILT = -0.5;
const CAMERA_OFFSET = new Vector3(-11, 10.5, 14);

// Panel face texture, in pixels (3:4 like the panel).
const FACE_W = 360;
const FACE_H = 480;
const FACE_CACHE = 14;

// Album study.
const PRINT_MAX = 3;
const BOARD = 3.7;
const STACK_GAP = 0.032;
const EXPLODE_GAP = 0.6;

type Damped = { value: number; goal: number };

interface Panel {
  index: number;
  mesh: Mesh;
  x: number;
  z: number;
  y: Damped;
  tilt: Damped;
  face: { texture: CanvasTexture; material: MeshStandardMaterial; image: HTMLImageElement | null } | null;
  lastUsed: number;
}

interface PrintPlate {
  mesh: Mesh;
  pos: { x: Damped; y: Damped; z: Damped; ry: Damped };
  delayUntil: number;
  texture: Texture | null;
  /** Swaps in the larger rendition; set until it has been asked for. */
  sharpen: (() => void) | null;
}

function damped(value: number): Damped {
  return { value, goal: value };
}

/** Moves toward the goal frame-rate independently; true while still moving. */
function stepDamped(d: Damped, factor: number): boolean {
  const delta = d.goal - d.value;
  if (Math.abs(delta) < 1e-4) {
    d.value = d.goal;
    return false;
  }
  d.value += delta * factor;
  return true;
}

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Draws `image` into the rectangle like CSS object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(
    image,
    (image.naturalWidth - sw) / 2,
    (image.naturalHeight - sh) / 2,
    sw,
    sh,
    x,
    y,
    w,
    h
  );
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

function fileCode(n: number): string {
  return `NO.${String(n).padStart(3, "0")}`;
}

export function createArchiveEngine(
  canvas: HTMLCanvasElement,
  options: EngineOptions
): ArchiveEngine {
  const { files, columns } = options;
  let palette = options.palette;
  let compact = options.compact;
  const reducedMotion = options.reducedMotion;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = SRGBColorSpace;
  const shadows = !compact;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = PCFShadowMap;

  // ---------------------------------------------------------------- field --
  const field = new Scene();
  field.fog = new Fog(0xffffff, 20, 46);
  const fieldCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 120);

  const hemi = new HemisphereLight(0xffffff, 0xffffff, 1.9);
  field.add(hemi);
  const sun = new DirectionalLight(0xffffff, 2.1);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  field.add(sun, sun.target);
  const sunOffset = new Vector3(-12, 16, 4);

  const groundMaterial = new MeshStandardMaterial({ roughness: 1 });
  const ground = new Mesh(new PlaneGeometry(400, 400), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  field.add(ground);

  // Bars run along X in rows along Z; panels stand in the gaps between rows.
  const columnCount = Math.max(1, columns.length);
  const deepest = Math.max(1, ...columns.map((c) => c.length));
  const margin = compact ? 10 : 15;
  const xMin = -margin;
  const xMax = (columnCount - 1) * COLUMN_SPACING + margin;
  const zMin = -margin;
  const zMax = (deepest - 1) * FILE_SPACING + margin;
  const random = seeded(20261003);
  const bars: { x: number; z: number; length: number; height: number }[] = [];
  for (let z = zMin; z <= zMax; z += ROW_SPACING) {
    let x = xMin + random() * 2;
    while (x < xMax) {
      const length = 1.4 + random() * 5.2;
      // Smooth terraces with a little per-bar noise, like a filled drawer.
      const terrace = 0.5 + 0.22 * Math.sin(x * 0.21 + z * 0.13) + 0.16 * Math.sin(z * 0.37 - x * 0.08);
      const height = MathUtils.clamp(terrace + (random() - 0.5) * 0.22, 0.22, 0.95);
      bars.push({ x: x + length / 2, z, length, height });
      x += length + 0.06 + random() * 0.22;
    }
  }

  const barMaterial = new MeshStandardMaterial({ roughness: 0.82 });
  const barMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), barMaterial, bars.length);
  const dotMaterial = new MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 });
  const dotGeometry = new CylinderGeometry(0.038, 0.038, 0.02, 10);
  const dotMesh = new InstancedMesh(dotGeometry, dotMaterial, bars.length);
  const dummy = new Object3D();
  let dotCount = 0;
  bars.forEach((bar, i) => {
    dummy.position.set(bar.x, bar.height / 2, bar.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(bar.length, bar.height, BAR_DEPTH);
    dummy.updateMatrix();
    barMesh.setMatrixAt(i, dummy.matrix);
    if (bar.length > 2.2) {
      dummy.position.set(bar.x + bar.length / 2 - 0.3, bar.height + 0.01, bar.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dotMesh.setMatrixAt(dotCount++, dummy.matrix);
    }
  });
  dotMesh.count = dotCount;
  barMesh.castShadow = shadows;
  barMesh.receiveShadow = shadows;
  field.add(barMesh, dotMesh);

  // One upright panel per album. Its front face is drawn on demand.
  // Two material slots instead of BoxGeometry's six: everything but the
  // front face shares one, which halves the draw calls per panel.
  const panelGeometry = new BoxGeometry(PANEL_W, PANEL_H, PANEL_D);
  panelGeometry.clearGroups();
  panelGeometry.addGroup(0, 24, 0);
  panelGeometry.addGroup(24, 6, 1);
  panelGeometry.addGroup(30, 6, 0);
  const panelEdge = new MeshStandardMaterial({ roughness: 0.55 });
  const restY = (rank: number) => {
    // Top edge height for a panel `rank` files away from the selection.
    const top = rank === 0 ? PANEL_H + 1.7 : rank === 1 ? 1.15 : rank === 2 ? 0.9 : 0.68;
    return top - PANEL_H / 2;
  };
  const panels: Panel[] = files.map((file, index) => {
    const column = columns[file.column] ?? [];
    const slot = column.indexOf(index);
    const mesh = new Mesh(panelGeometry, [panelEdge, panelEdge]);
    const x = file.column * COLUMN_SPACING;
    const z = slot * FILE_SPACING + PANEL_Z_OFFSET;
    mesh.position.set(x, restY(9), z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.userData.fileIndex = index;
    field.add(mesh);
    return { index, mesh, x, z, y: damped(restY(9)), tilt: damped(0), face: null, lastUsed: 0 };
  });

  // ---------------------------------------------------------------- study --
  const study = new Scene();
  const studyCamera = new PerspectiveCamera(32, 1, 0.1, 100);
  const studyHome = new Vector3(2.6, 1.2, 10.5);
  const studyExplodedHome = new Vector3(9.6, 3.6, 11);
  studyCamera.position.copy(studyHome);
  const studyHemi = new HemisphereLight(0xffffff, 0xffffff, 2);
  const studyKey = new DirectionalLight(0xffffff, 1.8);
  studyKey.position.set(-4, 6, 8);
  const studyRim = new DirectionalLight(0xffffff, 0.8);
  studyRim.position.set(6, 2, -6);
  study.add(studyHemi, studyKey, studyRim);
  const studyGroup = new Group();
  study.add(studyGroup);

  const controls = new OrbitControls(studyCamera, canvas);
  controls.enabled = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 22;
  controls.keyPanSpeed = 14;

  let boardMesh: Mesh | null = null;
  let boardTextures: Texture[] = [];
  let boardZ = damped(0);
  let plates: PrintPlate[] = [];
  let studyFile = -1;
  let exploded = false;
  let cameraGoal: Vector3 | null = null;
  let studyToken = 0;

  // ------------------------------------------------------------- palette --
  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);

  function applyPalette() {
    const page = toColor(palette.page);
    renderer.setClearColor(page);
    field.background = page;
    (field.fog as Fog).color.copy(page);
    study.background = page;
    groundMaterial.color.copy(page).offsetHSL(0, 0, -0.025);
    barMaterial.color.copy(toColor(palette.surface));
    panelEdge.color.copy(toColor(palette.raised));
    dotMaterial.color.copy(toColor(palette.subtle)).lerp(toColor(palette.surface), 0.35);
    const sky = toColor(palette.raised).lerp(new Color(0xffffff), 0.6);
    hemi.color.copy(sky);
    hemi.groundColor.copy(page).offsetHSL(0, 0, -0.12);
    studyHemi.color.copy(sky);
    studyHemi.groundColor.copy(page).offsetHSL(0, 0, -0.1);
    for (const panel of panels) if (panel.face) drawFace(panel);
    if (studyFile >= 0) rebuildBoardTexture();
  }

  // ---------------------------------------------------------- panel faces --
  function drawFace(panel: Panel) {
    const face = panel.face;
    if (!face) return;
    const file = files[panel.index];
    const ctx = face.texture.image.getContext("2d") as CanvasRenderingContext2D;
    const w = FACE_W;
    const h = FACE_H;
    ctx.fillStyle = palette.raised;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, 12, h);
    ctx.globalAlpha = 1;

    const px = 36;
    const py = 30;
    const pw = w - px - 26;
    const ph = Math.round(h * 0.66);
    ctx.fillStyle = palette.control;
    ctx.fillRect(px, py, pw, ph);
    if (face.image) drawCover(ctx, face.image, px, py, pw, ph);
    ctx.strokeStyle = palette.subtle;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.globalAlpha = 1;

    const labelTop = py + ph + 26;
    ctx.fillStyle = palette.subtle;
    ctx.font = `600 11px ${palette.fontMeta}`;
    ctx.fillText(fitText(ctx, options.archiveLabel.toUpperCase(), pw), px, labelTop);
    ctx.fillStyle = palette.fg;
    ctx.font = `700 34px ${palette.fontMeta}`;
    ctx.fillText(fileCode(file.number), px, labelTop + 40);
    ctx.font = `600 17px ${palette.fontSans}`;
    ctx.fillText(fitText(ctx, file.title, pw), px, labelTop + 70);
    ctx.fillStyle = palette.subtle;
    ctx.font = `500 13px ${palette.fontSans}`;
    ctx.fillText(fitText(ctx, file.owner, pw), px, labelTop + 92);

    // Ruler ticks and corner screws.
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 14; i++) ctx.fillRect(w - 26 - i * 6, h - 30, 2, i % 5 === 0 ? 12 : 7);
    for (const [cx, cy] of [[24, 16], [w - 14, 16], [24, h - 14], [w - 14, h - 14]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    face.texture.needsUpdate = true;
  }

  let clock = 0;
  function ensureFace(panel: Panel) {
    panel.lastUsed = ++clock;
    if (panel.face) return;
    const surface = document.createElement("canvas");
    surface.width = FACE_W;
    surface.height = FACE_H;
    const texture = new CanvasTexture(surface);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.62 });
    panel.face = { texture, material, image: null };
    (panel.mesh.material as Material[])[1] = material;
    drawFace(panel);
    const cover = files[panel.index].prints[0];
    if (cover) {
      loadImage(cover.thumb)
        .then((image) => {
          if (!panel.face) return;
          panel.face.image = image;
          drawFace(panel);
          invalidate();
        })
        .catch(() => undefined);
    }
    // Keep GPU memory flat on long archives: forget the least recent faces.
    const live = panels.filter((p) => p.face);
    if (live.length > FACE_CACHE) {
      live.sort((a, b) => a.lastUsed - b.lastUsed);
      for (const stale of live.slice(0, live.length - FACE_CACHE)) releaseFace(stale);
    }
  }

  function releaseFace(panel: Panel) {
    if (!panel.face) return;
    panel.face.texture.dispose();
    panel.face.material.dispose();
    panel.face = null;
    (panel.mesh.material as Material[])[1] = panelEdge;
  }

  // ------------------------------------------------------------ selection --
  let selected = -1;
  const cameraTarget = { x: damped(0), y: damped(0), z: damped(0) };
  let mode: "field" | "study" = "field";

  function frameOffset(): { x: number; y: number } {
    // Where the selected panel sits on screen, in NDC: left of the info
    // column on wide screens, above the info sheet on phones.
    return compact ? { x: 0, y: 0.3 } : { x: -0.32, y: 0.02 };
  }

  const tmpRight = new Vector3();
  const tmpUp = new Vector3();
  function aimAt(panel: Panel) {
    const center = new Vector3(panel.x, restY(0), panel.z);
    const offset = frameOffset();
    fieldCamera.updateMatrixWorld();
    tmpRight.setFromMatrixColumn(fieldCamera.matrixWorld, 0);
    tmpUp.setFromMatrixColumn(fieldCamera.matrixWorld, 1);
    const halfW = (fieldCamera.right - fieldCamera.left) / 2;
    const halfH = (fieldCamera.top - fieldCamera.bottom) / 2;
    center.addScaledVector(tmpRight, -offset.x * halfW);
    center.addScaledVector(tmpUp, -offset.y * halfH);
    cameraTarget.x.goal = center.x;
    cameraTarget.y.goal = center.y;
    cameraTarget.z.goal = center.z;
  }

  function select(fileIndex: number) {
    const panel = panels[fileIndex];
    if (!panel) return;
    const firstSelection = selected < 0;
    selected = fileIndex;
    const file = files[fileIndex];
    const column = columns[file.column] ?? [];
    const slot = column.indexOf(fileIndex);
    for (const other of panels) {
      const otherFile = files[other.index];
      const rank =
        otherFile.column === file.column
          ? Math.abs((columns[otherFile.column] ?? []).indexOf(other.index) - slot)
          : 9;
      other.y.goal = restY(rank);
      other.tilt.goal = rank === 0 ? PANEL_TILT : 0;
      if (rank <= 2) ensureFace(other);
    }
    aimAt(panel);
    if (firstSelection || reducedMotion) snapField();
    invalidate();
  }

  function snapField() {
    for (const p of panels) {
      p.y.value = p.y.goal;
      p.tilt.value = p.tilt.goal;
    }
    cameraTarget.x.value = cameraTarget.x.goal;
    cameraTarget.y.value = cameraTarget.y.goal;
    cameraTarget.z.value = cameraTarget.z.goal;
  }

  // ---------------------------------------------------------------- study --
  function rebuildBoardTexture() {
    if (!boardMesh || studyFile < 0) return;
    for (const t of boardTextures) t.dispose();
    const file = files[studyFile];
    const size = 512;
    const make = (draw: (ctx: CanvasRenderingContext2D) => void) => {
      const surface = document.createElement("canvas");
      surface.width = size;
      surface.height = size;
      const ctx = surface.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillStyle = palette.raised;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(0, 0, 16, size);
      draw(ctx);
      const texture = new CanvasTexture(surface);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return texture;
    };
    const front = make((ctx) => {
      ctx.fillStyle = palette.subtle;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 22; i++) ctx.fillRect(size - 40 - i * 7, size - 34, 2, i % 5 === 0 ? 14 : 8);
      ctx.globalAlpha = 1;
      ctx.font = `700 22px ${palette.fontMeta}`;
      ctx.fillText(fileCode(file.number), 40, 52);
    });
    const back = make((ctx) => {
      const x = 52;
      ctx.fillStyle = palette.subtle;
      ctx.font = `600 15px ${palette.fontMeta}`;
      ctx.fillText(fitText(ctx, options.archiveLabel.toUpperCase(), size - 100), x, 74);
      ctx.fillStyle = palette.fg;
      ctx.font = `700 64px ${palette.fontMeta}`;
      ctx.fillText(fileCode(file.number), x, 160);
      ctx.font = `600 30px ${palette.fontSans}`;
      ctx.fillText(fitText(ctx, file.title, size - 100), x, 228);
      ctx.fillStyle = palette.subtle;
      ctx.font = `500 22px ${palette.fontSans}`;
      ctx.fillText(fitText(ctx, file.owner, size - 100), x, 268);
      ctx.fillText(fitText(ctx, file.meta, size - 100), x, 302);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, 340, size - 100, 1);
      ctx.globalAlpha = 1;
    });
    // The back is seen mirrored from behind; flip it so it reads.
    back.repeat.x = -1;
    back.offset.x = 1;
    boardTextures = [front, back];
    const materials = boardMesh.material as MeshStandardMaterial[];
    materials[4].map = front;
    materials[5].map = back;
    materials[4].needsUpdate = true;
    materials[5].needsUpdate = true;
  }

  function clearStudy() {
    studyToken += 1;
    for (const plate of plates) {
      plate.texture?.dispose();
      for (const m of plate.mesh.material as Material[]) m.dispose();
      plate.mesh.geometry.dispose();
    }
    plates = [];
    if (boardMesh) {
      for (const m of boardMesh.material as Material[]) m.dispose();
      boardMesh.geometry.dispose();
      boardMesh = null;
    }
    for (const t of boardTextures) t.dispose();
    boardTextures = [];
    studyGroup.clear();
    studyFile = -1;
  }

  function layoutPlates(now: number) {
    const n = plates.length;
    const spread = (n - 1) * EXPLODE_GAP;
    boardZ.goal = exploded ? -spread / 2 - 0.55 : 0;
    plates.forEach((plate, j) => {
      const depth = n - 1 - j;
      if (exploded) {
        plate.pos.z.goal = depth * EXPLODE_GAP - spread / 2 + 0.2;
        plate.pos.x.goal = (j - (n - 1) / 2) * -0.16;
        plate.pos.y.goal = Math.sin(j * 1.3) * 0.12;
        plate.pos.ry.goal = 0;
      } else {
        plate.pos.z.goal = 0.1 + depth * STACK_GAP;
        plate.pos.x.goal = 0;
        plate.pos.y.goal = 0;
        plate.pos.ry.goal = 0;
      }
      // Stagger so the stack peels from the front when opening and settles
      // from the back when closing.
      plate.delayUntil = reducedMotion ? 0 : now + (exploded ? j : depth) * 45;
    });
  }

  function openObject(fileIndex: number) {
    const file = files[fileIndex];
    if (!file) return;
    clearStudy();
    const token = studyToken;
    studyFile = fileIndex;
    exploded = false;
    mode = "study";

    const boardMaterials = [0, 1, 2, 3, 4, 5].map(
      (i) =>
        new MeshStandardMaterial({
          color: i >= 4 ? 0xffffff : toColor(palette.raised),
          roughness: 0.5
        })
    );
    boardMesh = new Mesh(new BoxGeometry(BOARD, BOARD, 0.14), boardMaterials);
    studyGroup.add(boardMesh);
    rebuildBoardTexture();
    boardZ = damped(0);

    plates = file.prints.map((print, j) => {
      const aspect = print.width / Math.max(1, print.height);
      const w = aspect >= 1 ? PRINT_MAX : PRINT_MAX * aspect;
      const h = aspect >= 1 ? PRINT_MAX / aspect : PRINT_MAX;
      const edge = new MeshStandardMaterial({ color: toColor(palette.raised), roughness: 0.7 });
      const face = new MeshStandardMaterial({ color: toColor(palette.control), roughness: 0.55 });
      const back = new MeshStandardMaterial({ color: toColor(palette.surface), roughness: 0.8 });
      const mesh = new Mesh(new BoxGeometry(w, h, 0.022), [edge, edge, edge, edge, face, back]);
      const depth = file.prints.length - 1 - j;
      // A hand-stacked pile is never perfectly square.
      mesh.rotation.z = j === 0 ? 0 : (Math.sin(j * 12.9898) * 0.5) * 0.035;
      studyGroup.add(mesh);
      const plate: PrintPlate = {
        mesh,
        pos: { x: damped(0), y: damped(0), z: damped(0.1 + depth * STACK_GAP), ry: damped(0) },
        delayUntil: 0,
        texture: null,
        sharpen: null
      };
      const show = (image: HTMLImageElement) => {
        if (token !== studyToken) return;
        // Always a fresh texture: GPU storage is immutable once uploaded and
        // cannot grow from the thumbnail to the larger rendition.
        const texture = new Texture(image);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        plate.texture?.dispose();
        plate.texture = texture;
        face.color.set(0xffffff);
        face.map = texture;
        face.needsUpdate = true;
        invalidate();
      };
      // Only the front print is fully visible while the stack is closed, so
      // the rest start as thumbnails and sharpen when the stack is opened.
      plate.sharpen = () => {
        plate.sharpen = null;
        loadImage(print.med).then(show).catch(() => undefined);
      };
      if (j === 0) plate.sharpen();
      else loadImage(print.thumb).then(show).catch(() => undefined);
      return plate;
    });
    layoutPlates(0);

    studyCamera.position.copy(studyHome);
    controls.target.set(0, 0, 0);
    cameraGoal = null;
    controls.enabled = true;
    controls.listenToKeyEvents(window);
    controls.update();
    canvas.style.touchAction = "none";
    invalidate();
  }

  function closeObject() {
    if (mode !== "study") return;
    mode = "field";
    controls.enabled = false;
    controls.stopListenToKeyEvents();
    clearStudy();
    invalidate();
  }

  function setExploded(next: boolean) {
    if (mode !== "study") return;
    exploded = next;
    if (exploded) for (const plate of plates) plate.sharpen?.();
    layoutPlates(performance.now());
    cameraGoal = (exploded ? studyExplodedHome : studyHome).clone();
    invalidate();
  }

  function resetView() {
    if (mode !== "study") return;
    cameraGoal = (exploded ? studyExplodedHome : studyHome).clone();
    invalidate();
  }

  controls.addEventListener("start", () => {
    cameraGoal = null;
  });
  controls.addEventListener("change", () => invalidate());

  // ---------------------------------------------------------- sizing/loop --
  let width = 1;
  let height = 1;
  function resize() {
    const rect = canvas.parentElement?.getBoundingClientRect();
    width = Math.max(1, Math.round(rect?.width ?? canvas.clientWidth));
    height = Math.max(1, Math.round(rect?.height ?? canvas.clientHeight));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    // Show a little more of the field on narrow screens so a whole panel fits.
    const viewHeight = compact ? Math.max(9.5, 5.2 / aspect) : 9;
    fieldCamera.top = viewHeight / 2;
    fieldCamera.bottom = -viewHeight / 2;
    fieldCamera.left = (-viewHeight * aspect) / 2;
    fieldCamera.right = (viewHeight * aspect) / 2;
    fieldCamera.updateProjectionMatrix();
    studyCamera.aspect = aspect;
    studyCamera.fov = aspect < 0.8 ? 46 : 32;
    studyCamera.updateProjectionMatrix();
    if (selected >= 0) {
      aimAt(panels[selected]);
      cameraTarget.x.value = cameraTarget.x.goal;
      cameraTarget.y.value = cameraTarget.y.goal;
      cameraTarget.z.value = cameraTarget.z.goal;
    }
    invalidate();
  }

  let raf = 0;
  let last = 0;
  function invalidate() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const factor = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    let moving = false;

    if (mode === "field") {
      moving = stepDamped(cameraTarget.x, factor) || moving;
      moving = stepDamped(cameraTarget.y, factor) || moving;
      moving = stepDamped(cameraTarget.z, factor) || moving;
      const target = new Vector3(cameraTarget.x.value, cameraTarget.y.value, cameraTarget.z.value);
      fieldCamera.position.copy(target).add(CAMERA_OFFSET);
      fieldCamera.lookAt(target);
      sun.position.copy(target).add(sunOffset);
      sun.target.position.copy(target);
      for (const panel of panels) {
        const a = stepDamped(panel.y, factor);
        const b = stepDamped(panel.tilt, factor);
        if (a || b) moving = true;
        panel.mesh.position.y = panel.y.value;
        panel.mesh.rotation.y = panel.tilt.value;
      }
      renderer.render(field, fieldCamera);
    } else {
      const plateFactor = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      moving = stepDamped(boardZ, plateFactor) || moving;
      if (boardMesh) boardMesh.position.z = boardZ.value;
      for (const plate of plates) {
        if (now < plate.delayUntil) {
          moving = true;
          continue;
        }
        for (const d of Object.values(plate.pos)) moving = stepDamped(d, plateFactor) || moving;
        plate.mesh.position.set(plate.pos.x.value, plate.pos.y.value, plate.pos.z.value);
        plate.mesh.rotation.y = plate.pos.ry.value;
      }
      if (cameraGoal) {
        studyCamera.position.lerp(cameraGoal, reducedMotion ? 1 : factor);
        controls.target.lerp(new Vector3(), reducedMotion ? 1 : factor);
        if (studyCamera.position.distanceTo(cameraGoal) < 0.01) cameraGoal = null;
        moving = true;
      }
      if (controls.update()) moving = true;
      renderer.render(study, studyCamera);
    }

    if (moving) invalidate();
    else last = 0;
  }

  // ------------------------------------------------------------- pointers --
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let down: { x: number; y: number; t: number; id: number } | null = null;

  function panelAt(clientX: number, clientY: number): number {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, fieldCamera);
    const hits = raycaster.intersectObjects(panels.map((p) => p.mesh), false);
    const hit = hits.find((h) => h.object.position.y + PANEL_H / 2 > 0.3);
    return hit ? (hit.object.userData.fileIndex as number) : -1;
  }

  function onPointerDown(e: PointerEvent) {
    if (mode !== "field") return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  }

  function onPointerUp(e: PointerEvent) {
    if (mode !== "field" || !down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const elapsed = performance.now() - down.t;
    down = null;
    if (Math.hypot(dx, dy) < 8 && elapsed < 600) {
      const hit = panelAt(e.clientX, e.clientY);
      if (hit < 0) return;
      if (hit === selected) options.onOpen(hit);
      else options.onPick(hit);
      return;
    }
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
    if (Math.abs(dx) > Math.abs(dy)) options.onStep("column", dx < 0 ? 1 : -1);
    else options.onStep("file", dy < 0 ? 1 : -1);
  }

  let hoverFrame = 0;
  function onPointerMove(e: PointerEvent) {
    if (mode !== "field" || e.pointerType !== "mouse" || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      canvas.style.cursor = panelAt(e.clientX, e.clientY) >= 0 ? "pointer" : "";
    });
  }

  let wheelAt = 0;
  function onWheel(e: WheelEvent) {
    if (mode !== "field") return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 260 || Math.abs(e.deltaY) < 4) return;
    wheelAt = now;
    options.onStep("file", e.deltaY > 0 ? 1 : -1);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const observer = new ResizeObserver(resize);
  if (canvas.parentElement) observer.observe(canvas.parentElement);

  applyPalette();
  resize();

  return {
    select,
    openObject,
    closeObject,
    setExploded,
    resetView,
    setPalette(next) {
      palette = next;
      applyPalette();
      invalidate();
    },
    setCompact(next) {
      if (next === compact) return;
      compact = next;
      resize();
    },
    dispose() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("wheel", onWheel);
      controls.stopListenToKeyEvents();
      controls.dispose();
      clearStudy();
      for (const panel of panels) releaseFace(panel);
      panelGeometry.dispose();
      barMesh.geometry.dispose();
      dotGeometry.dispose();
      ground.geometry.dispose();
      for (const m of [barMaterial, dotMaterial, groundMaterial, panelEdge]) m.dispose();
      renderer.dispose();
    }
  };
}
