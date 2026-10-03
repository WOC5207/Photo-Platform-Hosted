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
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLRenderer
} from "three";
import { addLighting, fitText, makeTexture } from "./kit";
import { damp, settled, spring } from "./motion";
import { layoutFor, sceneArea } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The booking boards. A photographer's open events hang as cards on a board
 * ("events"), and one event's time slots hang as tabs in day columns
 * ("slots"), each with a row of seat lamps lit for the places left. A tab
 * put in the cart slides down into the amber loadout tray in front of the
 * board; once booked it is stamped with its number and filed away.
 */

export type BoardVariant = "events" | "slots";

export interface BoardTile {
  id: string;
  /** Day column (slots) or grid order (events). */
  column: number;
  row: number;
  /** Small line above the main one: the dates, or the slot's price. */
  kicker: string;
  main: string;
  /** Up to two lines under the main one. */
  detail: string[];
  /** Seats left and seats in total; lamps light for the ones left. */
  left: number;
  total: number;
  /** "3 LEFT", "FULL". */
  status: string;
}

export interface Board {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Tiles for one board; the same ids keep their place and only repaint. */
  setTiles(variant: BoardVariant, key: string, tiles: BoardTile[], headers: string[], trayLabel: string): void;
  setFocus(index: number): void;
  setCart(ids: string[]): void;
  /** Stamp booked tiles with their labels, then file them away. */
  stamp(ids: string[], labels: string[]): void;
  clearStamps(): void;
  /** Columns the events board lays its cards in, for arrow keys. */
  columns(): number;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const FOV = 30;
const ELEVATION = MathUtils.degToRad(7);
const SPEC = {
  events: { w: 3.1, h: 1.78, gx: 0.36, gy: 0.36, header: 0, texW: 768 },
  slots: { w: 2.05, h: 0.9, gx: 0.3, gy: 0.2, header: 0.7, texW: 512 }
} as const;
const DEPTH = 0.07;
const TRAY_SCALE = 0.46;
/** Seconds from the stamp landing to the tile leaving for the file. */
const FILE_AFTER = 1.15;

interface Tile {
  data: BoardTile;
  signature: string;
  group: Group;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  face: MeshStandardMaterial;
  stamp: Mesh;
  stampMaterial: MeshBasicMaterial;
  stampLabel: string;
  stampedAt: number;
  position: Vector3;
  tilt: number;
  scale: number;
  pop: number;
}

export function createBoard(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Board {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 10, 40);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const unit = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);
  const panelMaterial = new MeshStandardMaterial({ roughness: 0.9 });
  const panel = new Mesh(box, panelMaterial);
  panel.receiveShadow = !lowPower;
  scene.add(panel);
  const railMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const rail = new Mesh(box, railMaterial);
  scene.add(rail);
  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.55 });
  const tiles = new Group();
  scene.add(tiles);
  const headers = new Group();
  scene.add(headers);

  // The amber loadout tray and its label plate.
  const trayMaterial = new MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  const tray = new Group();
  const trayBody = new Mesh(box, trayMaterial);
  const trayLip = new Mesh(box, trayMaterial);
  const trayCanvas = document.createElement("canvas");
  trayCanvas.width = 512;
  trayCanvas.height = 48;
  const trayTexture = makeTexture(trayCanvas, renderer);
  const trayLabelMaterial = new MeshBasicMaterial({ map: trayTexture, transparent: true });
  const trayPlate = new Mesh(unit, trayLabelMaterial);
  tray.add(trayBody, trayLip, trayPlate);
  scene.add(tray);
  const trayShown = spring(0);

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
  const reticleSize = new Vector2(1, 1);
  let reticleFresh = true;

  let variant: BoardVariant = "slots";
  let key = "";
  let list: Tile[] = [];
  let headerMeshes: { mesh: Mesh; texture: CanvasTexture; material: MeshBasicMaterial }[] = [];
  let headerLabels: string[] = [];
  let trayText = "";
  let focusIndex = 0;
  let hoverIndex = -1;
  let cart: string[] = [];
  let width = 1;
  let height = 1;
  let clock = 0;
  let columnCount = 1;
  let gridColumns = 1;
  let rowCount = 1;
  const panX = spring(0);
  const panY = spring(0);

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  const ink = () => (palette.dark ? "#ece6dc" : "#1c1a16");
  const muted = () => (palette.dark ? "rgba(236,230,220,0.74)" : "rgba(28,26,22,0.7)");

  // --------------------------------------------------------------- faces --
  function paint(tile: Tile) {
    const c = tile.canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = tile.canvas.width;
    const h = tile.canvas.height;
    const full = tile.data.left <= 0;
    c.fillStyle = palette.dark ? "#26231f" : "#f7f4ef";
    c.fillRect(0, 0, w, h);
    const pad = Math.round(w * 0.055);
    c.fillStyle = full ? muted() : palette.accent;
    c.fillRect(0, 0, Math.round(w * 0.018), h);
    c.textBaseline = "alphabetic";
    const big = variant === "events";
    let y = pad + (big ? 30 : 26);
    c.fillStyle = full ? muted() : palette.accent;
    c.font = `600 ${big ? 26 : 24}px ${palette.fontMeta}`;
    c.fillText(fitText(c, tile.data.kicker.toUpperCase(), w - pad * 2), pad + 8, y);
    y += big ? 66 : 54;
    c.fillStyle = full ? muted() : ink();
    c.font = `${big ? 800 : 600} ${big ? 56 : 50}px ${big ? palette.fontSans : palette.fontMeta}`;
    c.fillText(fitText(c, big ? tile.data.main.toUpperCase() : tile.data.main, w - pad * 2), pad + 8, y);
    c.fillStyle = muted();
    c.font = `400 ${big ? 26 : 22}px ${palette.fontSans}`;
    for (const line of tile.data.detail.slice(0, big ? 2 : 1)) {
      if (!line) continue;
      y += big ? 40 : 32;
      c.fillText(fitText(c, line, w - pad * 2), pad + 8, y);
    }
    // Seat lamps along the bottom, lit for the places left.
    const lampsShown = Math.min(tile.data.total, big ? 16 : 10);
    const lit = Math.min(tile.data.left, lampsShown);
    const lamp = big ? 22 : 18;
    const gap = big ? 9 : 7;
    const base = h - pad - lamp;
    for (let i = 0; i < lampsShown; i++) {
      c.fillStyle = i < lit ? palette.accent : palette.dark ? "rgba(255,255,255,0.12)" : "rgba(28,26,22,0.12)";
      c.fillRect(pad + 8 + i * (lamp + gap), base, lamp, lamp);
    }
    c.fillStyle = full ? muted() : ink();
    c.font = `600 ${big ? 24 : 21}px ${palette.fontMeta}`;
    const status = tile.data.status.toUpperCase();
    c.fillText(status, w - pad - c.measureText(status).width, base + lamp - 2);
    tile.texture.needsUpdate = true;
  }

  function paintStamp(tile: Tile) {
    const canvas = (tile.stampMaterial.map as CanvasTexture).image as HTMLCanvasElement;
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, canvas.width, canvas.height);
    const color = palette.dark ? "#f0b860" : "#b5542c";
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 10;
    c.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    c.lineWidth = 3;
    c.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `800 64px ${palette.fontSans}`;
    c.fillText(tile.stampLabel.toUpperCase(), canvas.width / 2, canvas.height / 2 + 2);
    (tile.stampMaterial.map as CanvasTexture).needsUpdate = true;
  }

  function paintTray() {
    const c = trayCanvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, trayCanvas.width, trayCanvas.height);
    c.fillStyle = palette.dark ? "#1c1a16" : "#fffaf2";
    c.font = `600 26px ${palette.fontMeta}`;
    c.textBaseline = "middle";
    c.fillText(trayText.toUpperCase(), 12, trayCanvas.height / 2);
    trayTexture.needsUpdate = true;
  }

  function paintHeader(index: number) {
    const entry = headerMeshes[index];
    const canvas = entry.texture.image as HTMLCanvasElement;
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = ink();
    c.font = `700 40px ${palette.fontSans}`;
    c.textBaseline = "middle";
    c.fillText(fitText(c, (headerLabels[index] ?? "").toUpperCase(), canvas.width - 16), 6, canvas.height / 2 - 6);
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
    panelMaterial.color.copy(palette.dark ? toColor(palette.surface) : toColor(palette.control).lerp(page, 0.35));
    railMaterial.color.copy(toColor(palette.fg));
    bodyMaterial.color.copy(palette.dark ? toColor(palette.raised) : toColor(palette.raised).lerp(page, 0.2));
    const amber = toColor(palette.accent);
    trayMaterial.color.copy(amber);
    trayMaterial.emissive.copy(amber).multiplyScalar(palette.dark ? 0.25 : 0.12);
    reticleMaterial.color.copy(toColor(palette.fg));
    for (const tile of list) {
      paint(tile);
      if (tile.stampLabel) paintStamp(tile);
    }
    headerMeshes.forEach((_, i) => paintHeader(i));
    paintTray();
  }

  // -------------------------------------------------------------- layout --
  function cell(tile: BoardTile) {
    if (variant === "slots") return { col: tile.column, row: tile.row };
    return { col: tile.row % gridColumns, row: Math.floor(tile.row / gridColumns) };
  }

  function home(tile: BoardTile, target: Vector3) {
    const spec = SPEC[variant];
    const { col, row } = cell(tile);
    return target.set(col * (spec.w + spec.gx), -(spec.header + row * (spec.h + spec.gy)) - spec.h / 2, DEPTH / 2);
  }

  function visibleColumns() {
    const layout = layoutFor(width, height);
    if (variant === "events") return gridColumns;
    return Math.min(columnCount, layout === "portrait" ? 2 : 3);
  }

  function relayout() {
    gridColumns = variant === "events" ? (layoutFor(width, height) === "portrait" ? 1 : 2) : 1;
    columnCount = variant === "slots" ? Math.max(1, headerLabels.length) : gridColumns;
    rowCount = Math.max(1, ...list.map((t) => cell(t.data).row + 1));
    // Nothing open: no empty board behind the panel's notice.
    panel.visible = rail.visible = headers.visible = list.length > 0;
    const spec = SPEC[variant];
    const boardW = columnCount * (spec.w + spec.gx) - spec.gx + 0.7;
    const boardH = spec.header + rowCount * (spec.h + spec.gy) - spec.gy + 0.8;
    panel.scale.set(boardW, boardH, 0.08);
    panel.position.set((columnCount * (spec.w + spec.gx) - spec.gx) / 2 - spec.w / 2, -boardH / 2 + 0.35, -0.04);
    rail.scale.set(boardW, 0.05, 0.12);
    rail.position.set(panel.position.x, 0.35 - 0.025, 0.02);
    headerMeshes.forEach((entry, i) => {
      entry.mesh.scale.set(spec.w, 0.42, 1);
      entry.mesh.position.set(i * (spec.w + spec.gx), -0.26, 0.004);
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

  function disposeTile(tile: Tile) {
    tile.texture.dispose();
    tile.face.dispose();
    (tile.stampMaterial.map as CanvasTexture).dispose();
    tile.stampMaterial.dispose();
    tile.group.removeFromParent();
  }

  function makeTile(data: BoardTile): Tile {
    const spec = SPEC[variant];
    const group = new Group();
    const body = new Mesh(box, bodyMaterial);
    body.scale.set(spec.w, spec.h, DEPTH);
    body.castShadow = !lowPower;
    const canvas = document.createElement("canvas");
    canvas.width = spec.texW;
    canvas.height = Math.round((spec.texW * spec.h) / spec.w);
    const texture = makeTexture(canvas, renderer);
    const face = new MeshStandardMaterial({ map: texture, roughness: 0.5 });
    const front = new Mesh(unit, face);
    front.scale.set(spec.w - 0.04, spec.h - 0.04, 1);
    front.position.z = DEPTH / 2 + 0.002;
    const stampCanvas = document.createElement("canvas");
    stampCanvas.width = 420;
    stampCanvas.height = 150;
    const stampMaterial = new MeshBasicMaterial({ map: makeTexture(stampCanvas, renderer), transparent: true, opacity: 0, depthWrite: false });
    const stamp = new Mesh(unit, stampMaterial);
    const stampW = Math.min(spec.w * 0.78, 1.9);
    stamp.scale.set(stampW, (stampW * 150) / 420, 1);
    stamp.position.z = DEPTH / 2 + 0.01;
    stamp.rotation.z = MathUtils.degToRad(-9);
    stamp.visible = false;
    group.add(body, front, stamp);
    tiles.add(group);
    const tile: Tile = {
      data,
      signature: "",
      group,
      canvas,
      texture,
      face,
      stamp,
      stampMaterial,
      stampLabel: "",
      stampedAt: -1,
      position: new Vector3(),
      tilt: 0,
      scale: 1,
      pop: 0
    };
    return tile;
  }

  // -------------------------------------------------------------- camera --
  const viewDirection = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const aim = new Vector3();
  let distance = 12;
  let visibleW = 10;
  let visibleH = 6;
  let halfSpan = 2;
  let reserve = 0;

  function panTargets() {
    const spec = SPEC[variant];
    const focus = list[focusIndex]?.data;
    const { col, row } = focus ? cell(focus) : { col: 0, row: 0 };
    const visible = visibleColumns();
    const start = MathUtils.clamp(col - Math.floor((visible - 1) / 2), 0, Math.max(0, columnCount - visible));
    const x = (start + (visible - 1) / 2) * (spec.w + spec.gx);
    const top = 0.5;
    const center0 = top - halfSpan;
    const rowBottom = -(spec.header + row * (spec.h + spec.gy)) - spec.h;
    const y = Math.min(center0, rowBottom - 0.25 + halfSpan - reserve);
    return { x, y };
  }

  // On phones the board sits between the site header and the bottom sheet.
  function boardArea() {
    const area = sceneArea(width, height);
    return layoutFor(width, height) === "portrait" ? { x: 0.5, y: 0.34, width: 0.94, half: 0.2 } : { ...area, half: Math.min(area.y, 1 - area.y) * 0.9 };
  }

  function frame() {
    const area = boardArea();
    const aspect = width / height;
    const spec = SPEC[variant];
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    const span = visibleColumns() * (spec.w + spec.gx) - spec.gx + 0.9;
    distance = span / (area.width * 2 * halfW);
    visibleW = 2 * halfW * distance;
    visibleH = 2 * halfH * distance;
    halfSpan = visibleH * area.half;
    reserve = variant === "slots" ? Math.min(1.25 + halfSpan * 0.14, halfSpan * 0.56) * trayShown.value : 0;
    aim.set(panX.value - (area.x - 0.5) * visibleW, panY.value + (area.y - 0.5) * visibleH, 0);
    camera.position.copy(aim).addScaledVector(viewDirection, distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  }

  // -------------------------------------------------------------- motion --
  const target = new Vector3();
  const trayAt = new Vector3();

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

    // The tray sits at the bottom of the scene area, in front of the board.
    const area = boardArea();
    const areaCenterY = aim.y - (area.y - 0.5) * visibleH;
    const areaCenterX = aim.x + (area.x - 0.5) * visibleW;
    const trayW = Math.min(visibleColumns() * (SPEC.slots.w + SPEC.slots.gx), area.width * visibleW * 0.94);
    // Tiles filed after booking leave the tray, and the tray goes with them.
    const filed = (tile: Tile) => tile.stampedAt >= 0 && clock - tile.stampedAt > FILE_AFTER;
    const inTray = list.filter((t) => cart.includes(t.data.id) && !filed(t)).map((t) => t.data.id);
    const trayTarget = variant === "slots" && inTray.length > 0 ? 1 : 0;
    damp(trayShown, trayTarget, rate(6), dt);
    if (!settled(trayShown, trayTarget)) moving = true;
    trayAt.set(areaCenterX, areaCenterY - halfSpan * 0.86 + 0.32 - (1 - trayShown.value) * 1.6, 1.1);
    tray.position.copy(trayAt);
    tray.visible = trayShown.value > 0.01;
    trayBody.scale.set(trayW, 0.08, 0.62);
    trayLip.scale.set(trayW, 0.16, 0.05);
    trayLip.position.set(0, 0.04, 0.31);
    trayPlate.scale.set(Math.min(trayW * 0.6, 2.6), 0.24, 1);
    trayPlate.position.set(-trayW / 2 + Math.min(trayW * 0.6, 2.6) / 2 + 0.06, 0.04, 0.34);

    const spec = SPEC[variant];
    const slotW = spec.w * TRAY_SCALE;
    const spacing = inTray.length > 1 ? Math.min(slotW + 0.06, (trayW - slotW - 0.2) / (inTray.length - 1)) : 0;

    list.forEach((tile, i) => {
      const trayIndex = inTray.indexOf(tile.data.id);
      const stampAge = tile.stampedAt >= 0 ? clock - tile.stampedAt : -1;
      let scaleTarget = 1;
      let tiltTarget = 0;
      let visible = true;
      if (stampAge > FILE_AFTER) {
        // Filed: up and out past the top of the board.
        home(tile.data, target);
        target.set(trayAt.x + trayW * 0.7, areaCenterY + halfSpan + 1.2, 0.8);
        scaleTarget = 0.3;
        tiltTarget = -0.4;
        visible = stampAge < FILE_AFTER + 1.4 && !reduced;
      } else if (trayIndex >= 0) {
        target.set(trayAt.x - trayW / 2 + 0.1 + slotW / 2 + trayIndex * spacing, trayAt.y + 0.06 + (spec.h * TRAY_SCALE) / 2 * 0.62, trayAt.z - 0.05 + trayIndex * 0.002);
        scaleTarget = TRAY_SCALE;
        tiltTarget = -0.9;
      } else {
        home(tile.data, target);
        const focused = i === focusIndex;
        const popTarget = focused ? 1 : i === hoverIndex ? 0.5 : 0;
        tile.pop = reduced ? popTarget : MathUtils.lerp(tile.pop, popTarget, k);
        if (Math.abs(tile.pop - popTarget) > 1e-3) moving = true;
        target.z += tile.pop * 0.22 - (tile.data.left <= 0 ? 0.03 : 0);
        scaleTarget = 1 + tile.pop * 0.03;
      }
      tile.group.visible = visible;
      if (!visible) return;
      if (!tile.group.userData.placed) {
        tile.position.copy(target);
        tile.group.userData.placed = true;
      }
      tile.position.lerp(target, k);
      tile.scale = MathUtils.lerp(tile.scale, scaleTarget, k);
      tile.tilt = MathUtils.lerp(tile.tilt, tiltTarget, k);
      if (tile.position.distanceToSquared(target) > 1e-6 || Math.abs(tile.scale - scaleTarget) > 1e-4 || Math.abs(tile.tilt - tiltTarget) > 1e-4) moving = true;
      tile.group.position.copy(tile.position);
      tile.group.scale.setScalar(tile.scale);
      tile.group.rotation.x = tile.tilt;

      if (stampAge >= 0) {
        // The stamp drops onto the tab and the tab dips under it.
        const t = reduced ? 1 : MathUtils.clamp(stampAge / 0.22, 0, 1);
        tile.stamp.visible = true;
        tile.stampMaterial.opacity = MathUtils.smoothstep(t, 0, 1);
        const s = MathUtils.lerp(1.7, 1, MathUtils.smoothstep(t, 0, 1));
        tile.stamp.scale.set(Math.min(spec.w * 0.78, 1.9) * s, ((Math.min(spec.w * 0.78, 1.9) * 150) / 420) * s, 1);
        tile.group.position.z -= Math.sin(Math.PI * MathUtils.clamp((stampAge - 0.18) / 0.2, 0, 1)) * 0.06;
        if (stampAge < FILE_AFTER + 1.5) moving = true;
      } else {
        tile.stamp.visible = false;
      }
    });

    // Brackets around the focused tile while it is on the board.
    const focused = list[focusIndex];
    const onBoard = focused && !cart.includes(focused.data.id) && focused.stampedAt < 0;
    reticle.visible = Boolean(onBoard);
    if (focused && onBoard) {
      home(focused.data, target);
      target.z += 0.26;
      const w = spec.w + 0.16;
      const h = spec.h + 0.16;
      if (reticleFresh) {
        reticleAt.copy(target);
        reticleSize.set(w, h);
        reticleFresh = false;
      }
      reticleAt.lerp(target, k);
      reticleSize.lerp(new Vector2(w, h), k);
      if (reticleAt.distanceToSquared(target) > 1e-6) moving = true;
      const arm = 0.2;
      const thick = 0.022;
      const hw = reticleSize.x / 2;
      const hh = reticleSize.y / 2;
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

  applyPalette();

  return {
    scene,
    camera,
    setTiles(nextVariant, nextKey, next, nextHeaders, nextTrayLabel) {
      const changedBoard = nextVariant !== variant || nextKey !== key;
      if (changedBoard) {
        for (const tile of list) disposeTile(tile);
        list = [];
        variant = nextVariant;
        key = nextKey;
        focusIndex = 0;
        reticleFresh = true;
      }
      const kept = new Map(list.map((t) => [t.data.id, t]));
      list = next.map((data) => {
        const tile = kept.get(data.id) ?? makeTile(data);
        kept.delete(data.id);
        tile.data = data;
        const signature = JSON.stringify(data);
        if (signature !== tile.signature) {
          tile.signature = signature;
          paint(tile);
        }
        return tile;
      });
      for (const tile of kept.values()) disposeTile(tile);
      if (nextHeaders.join("\u0000") !== headerLabels.join("\u0000") || changedBoard) {
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
      if (nextTrayLabel !== trayText) {
        trayText = nextTrayLabel;
        paintTray();
      }
      focusIndex = MathUtils.clamp(focusIndex, 0, Math.max(0, list.length - 1));
      relayout();
      if (changedBoard) this.settle();
      invalidate();
    },
    setFocus(index) {
      const next = MathUtils.clamp(index, 0, Math.max(0, list.length - 1));
      if (next === focusIndex) return;
      focusIndex = next;
      invalidate();
    },
    setCart(ids) {
      cart = ids.slice();
      invalidate();
    },
    stamp(ids, labels) {
      ids.forEach((id, i) => {
        const tile = list.find((t) => t.data.id === id);
        if (!tile) return;
        tile.stampLabel = labels[i] ?? "";
        tile.stampedAt = clock + i * 0.16;
        paintStamp(tile);
      });
      invalidate();
    },
    clearStamps() {
      for (const tile of list) {
        if (tile.stampedAt < 0) continue;
        tile.stampedAt = -1;
        tile.stampLabel = "";
        tile.stampMaterial.opacity = 0;
        // Back onto the board from where it was filed.
        tile.scale = 0.3;
      }
      invalidate();
    },
    columns: () => (variant === "events" ? gridColumns : 1),
    settle() {
      frame();
      const pan = panTargets();
      panX.value = pan.x;
      panY.value = pan.y;
      panX.velocity = panY.velocity = 0;
      frame();
      for (const tile of list) {
        home(tile.data, tile.position);
        tile.group.userData.placed = true;
      }
      reticleFresh = true;
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
      const hit = raycaster.intersectObject(tiles, true)[0];
      const group = hit?.object.parent;
      return group ? list.findIndex((t) => t.group === group) : -1;
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
      for (const tile of list) disposeTile(tile);
      list = [];
      clearHeaders();
      unit.dispose();
      box.dispose();
      for (const material of [panelMaterial, railMaterial, bodyMaterial, trayMaterial, trayLabelMaterial, reticleMaterial]) material.dispose();
      trayTexture.dispose();
      lights.environment.dispose();
    }
  };
}
