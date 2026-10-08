import {
  Color,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
  type WebGLRenderer
} from "three";
import { addLighting, gridTexture, imageMaterial, loadImage, photoTexture, screenPitch } from "./kit";
import { damp, rubber, settled, spring, type Follow, type Spring } from "./motion";
import { photoRect, sceneArea, tableColumns } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The light table: one album's photos laid out as prints on a lit, ruled
 * table. The focused print lifts; opening it raises the print off the table
 * until it fills the box the photo screen's HTML image will cover (see
 * photoRect), so the full-resolution photo fades in exactly over it.
 */

export interface TablePrint {
  thumb: string;
  med: string;
  width: number;
  height: number;
}

export interface LightTable {
  scene: Scene;
  camera: PerspectiveCamera;
  setPrints(key: string, prints: TablePrint[]): void;
  setFocus(index: number): void;
  /** Jump to the current targets, for arriving from another screen. */
  settle(): void;
  setRaised(raised: boolean): void;
  /** The Dashboard's marks: picked prints on an accent mat, and a tab on the cover. */
  setMarks(picked: number[], cover: number): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  focus(): number;
  columns(): number;
  /** The table under a finger dragging it up and down, a row at a time. */
  follow: Follow;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const CELL_W = 1.5;
const CELL_D = 1.3;
const PRINT_MAX_W = 1.22;
const PRINT_MAX_H = 0.98;
const MAT = 0.06;
const ELEVATION = MathUtils.degToRad(56);
const FOV = 30;
/** Rows past each edge of the view that get their prints ahead of a drag. */
const MARGIN_ROWS = 1;
/** How far past the camera's aim the fog hides the table completely. */
const FOG_FAR = 18;

interface Slot {
  group: Group;
  mat: Mesh;
  tab: Mesh;
  photo: Mesh;
  face: MeshBasicMaterial;
  w: number;
  h: number;
  twist: number;
  lift: number;
  /** 0 on the table, 1 raised into the photo box; each print has its own. */
  up: Spring;
  texture: Texture | null;
  loading: boolean;
  used: number;
  /** On screen (or the focused print) at the last feed, so its thumbnail stays. */
  wanted: boolean;
}

export function createLightTable(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
  /** The focused print reached the photo box (true) or started down (false). */
  onRaised?: (raised: boolean) => void;
}): LightTable {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;
  const textureCap = lowPower ? 24 : 48;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 8, 30);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 80);
  const lights = addLighting(renderer, scene, !lowPower);

  const surfaceMaterial = new MeshStandardMaterial({ roughness: 0.92 });
  const surface = new Mesh(new PlaneGeometry(80, 200), surfaceMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = !lowPower;
  scene.add(surface);

  const matMaterial = new MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.75 });
  const pickedMaterial = new MeshStandardMaterial({ roughness: 0.6 });
  const unit = new PlaneGeometry(1, 1);
  const prints = new Group();
  scene.add(prints);

  // Corner brackets that mark the focused print, as the archive marks its
  // selected file. Each arm is a unit box scaled into place every frame.
  const reticleMaterial = new MeshBasicMaterial({ color: 0x1c1a16 });
  const reticle = new Group();
  const arms: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const arm = new Mesh(unit, reticleMaterial);
    arm.rotation.x = -Math.PI / 2;
    arms.push(arm);
    reticle.add(arm);
  }
  scene.add(reticle);
  const reticleAt = new Vector3();
  const reticleSize = new Vector2(1, 1);
  let reticleShown = 0;

  let key = "";
  let slots: Slot[] = [];
  let sources: TablePrint[] = [];
  let focusIndex = 0;
  let hoverIndex = -1;
  let raisedTarget = false;
  let raisedShown = false;
  let picked = new Set<number>();
  let coverIndex = -1;
  const pan = spring(0);
  // A finger holds the table; the row at the middle of the view while it does.
  let held = false;
  let viewRow = -1;
  let columnCount = 5;
  let width = 1;
  let height = 1;
  let clock = 0;
  let raisedToken = 0;
  let raisedTexture: Texture | null = null;
  /** The larger rendition, held until its print stops moving. */
  let pendingImage: { index: number; image: HTMLImageElement } | null = null;

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  let paper = toColor(palette.control);

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    surfaceMaterial.map?.dispose();
    const base = palette.dark ? toColor(palette.surface) : toColor(palette.raised);
    surfaceMaterial.map = gridTexture(
      renderer,
      palette.dark ? "rgba(255,255,255,0.06)" : "rgba(60,50,40,0.08)",
      palette.dark ? "rgba(255,255,255,0.16)" : "rgba(60,50,40,0.22)",
      `#${base.getHexString(SRGBColorSpace)}`
    );
    surfaceMaterial.map.repeat.set(40, 100);
    // A light table glows a little from underneath.
    surfaceMaterial.emissive.copy(base).multiplyScalar(palette.dark ? 0.05 : 0.18);
    surfaceMaterial.needsUpdate = true;
    paper = toColor(palette.control);
    reticleMaterial.color.copy(toColor(palette.fg));
    pickedMaterial.color.copy(toColor(palette.accent));
    for (const slot of slots) if (!slot.texture) slot.face.color.copy(paper);
  }

  const rowOf = (index: number) => Math.floor(index / columnCount);

  function home(index: number, target: Vector3) {
    const row = rowOf(index);
    const col = index % columnCount;
    return target.set((col - (columnCount - 1) / 2) * CELL_W, 0.012, row * CELL_D);
  }

  function clear() {
    for (const slot of slots) {
      slot.texture?.dispose();
      slot.face.dispose();
      slot.group.removeFromParent();
    }
    slots = [];
    raisedTexture?.dispose();
    raisedTexture = null;
  }

  function build() {
    clear();
    slots = sources.map((print, i) => {
      const aspect = print.width / Math.max(1, print.height);
      let w = PRINT_MAX_W;
      let h = PRINT_MAX_W / aspect;
      if (h > PRINT_MAX_H) {
        h = PRINT_MAX_H;
        w = PRINT_MAX_H * aspect;
      }
      const group = new Group();
      const mat = new Mesh(unit, matMaterial);
      mat.scale.set(w + MAT * 2, h + MAT * 2, 1);
      mat.castShadow = !lowPower;
      const face = imageMaterial({ color: paper.clone() });
      const photo = new Mesh(unit, face);
      photo.scale.set(w, h, 1);
      photo.position.z = 0.002;
      // The cover's tab, in the mat's top-left corner.
      const tab = new Mesh(unit, reticleMaterial);
      const size = Math.min(w, h) * 0.16;
      tab.scale.set(size, size, 1);
      tab.position.set(-w / 2 - MAT + size / 2, h / 2 + MAT - size / 2, 0.004);
      group.add(mat, photo, tab);
      group.userData.index = i;
      prints.add(group);
      // A steady, slightly hand-placed twist per print.
      const twist = MathUtils.degToRad(((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2.6);
      return { group, mat, tab, photo, face, w, h, twist, lift: 0, up: spring(0), texture: null, loading: false, used: 0, wanted: false };
    });
    applyMarks();
  }

  function applyMarks() {
    slots.forEach((slot, i) => {
      slot.mat.material = picked.has(i) ? pickedMaterial : matMaterial;
      slot.tab.visible = i === coverIndex;
    });
  }

  /**
   * Thumbnails for every print on screen and the focused one. Up to
   * textureCap stay loaded once they scroll away; a print on screen always
   * keeps its own, however many the view holds.
   */
  function feedTextures() {
    const [first, last] = rowsInView();
    slots.forEach((slot, i) => {
      const row = rowOf(i);
      const near = (row >= first && row <= last) || i === focusIndex;
      slot.group.visible = near;
      slot.wanted = near;
      if (!near) return;
      slot.used = clock;
      if (slot.texture || slot.loading) return;
      slot.loading = true;
      const token = key;
      loadImage(sources[i].thumb)
        .then((image) => {
          slot.loading = false;
          if (token !== key) return;
          slot.texture = photoTexture(image, renderer, slot.w / slot.h);
          slot.face.map = slot.texture;
          slot.face.color.set(0xffffff);
          slot.face.needsUpdate = true;
          evict();
          invalidate();
        })
        .catch(() => {
          slot.loading = false;
        });
    });
  }

  function evict() {
    const loaded = slots.filter((s) => s.texture);
    const budget = Math.max(textureCap, slots.filter((s) => s.wanted).length);
    if (loaded.length <= budget) return;
    // Only prints off screen give theirs up, the longest gone first.
    const spare = loaded.filter((s) => !s.wanted).sort((a, b) => a.used - b.used);
    for (const slot of spare.slice(0, loaded.length - budget)) {
      slot.texture?.dispose();
      slot.texture = null;
      slot.face.map = null;
      slot.face.color.copy(paper);
      slot.face.needsUpdate = true;
    }
  }

  /**
   * The raised print gets the larger rendition. Uploading it is a long task,
   * so it waits until the print has stopped moving rather than stalling the
   * rise halfway.
   */
  function sharpenRaised() {
    const token = ++raisedToken;
    const index = focusIndex;
    const source = sources[index];
    if (!source) return;
    loadImage(source.med)
      .then((image) => {
        if (token !== raisedToken || index !== focusIndex) return;
        pendingImage = { index, image };
        invalidate();
      })
      .catch(() => undefined);
  }

  function applyRaisedTexture() {
    if (!pendingImage) return;
    const { index, image } = pendingImage;
    pendingImage = null;
    const slot = slots[index];
    if (!slot || index !== focusIndex) return;
    raisedTexture?.dispose();
    raisedTexture = photoTexture(image, renderer, slot.w / slot.h);
    renderer.initTexture(raisedTexture);
    slot.face.map = raisedTexture;
    slot.face.color.set(0xffffff);
    slot.face.needsUpdate = true;
  }

  function dropRaisedTexture() {
    raisedToken += 1;
    pendingImage = null;
    if (!raisedTexture) return;
    for (const slot of slots) {
      if (slot.face.map === raisedTexture) {
        slot.face.map = slot.texture;
        if (!slot.texture) slot.face.color.copy(paper);
        slot.face.needsUpdate = true;
      }
    }
    raisedTexture.dispose();
    raisedTexture = null;
  }

  // ------------------------------------------------------------- camera --
  const viewDirection = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const right = new Vector3(1, 0, 0);
  const up = new Vector3().crossVectors(viewDirection, right).normalize();
  const aim = new Vector3();
  let distance = 10;

  function frame() {
    const area = sceneArea(width, height);
    const aspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    const tableWidth = columnCount * CELL_W + 0.4;
    // Fit the table's width into the free side of the screen.
    distance = tableWidth / (area.width * 2 * halfW);
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    aim.set(0, 0, pan.value);
    aim.addScaledVector(right, -(area.x - 0.5) * visibleW);
    aim.addScaledVector(up, (area.y - 0.5) * visibleH);
    camera.position.copy(aim).addScaledVector(viewDirection, distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  }

  const edge = new Vector3();
  const toEdge = new Vector3();
  /** Whether any of a row's band is on screen and nearer than the fog's far end. */
  function rowShown(row: number) {
    let low = Infinity;
    let high = -Infinity;
    for (const side of [-0.5, 0.5]) {
      edge.set(0, 0, (row + side) * CELL_D);
      if (toEdge.subVectors(camera.position, edge).dot(viewDirection) > distance + FOG_FAR) continue;
      edge.project(camera);
      if (edge.z > 1) continue;
      low = Math.min(low, edge.y);
      high = Math.max(high, edge.y);
    }
    return high > -1 && low < 1;
  }

  /** The rows on screen now, out to the margin, as [first, last]. */
  function rowsInView(): [number, number] {
    frame();
    const end = rowOf(Math.max(0, sources.length - 1));
    const middle = MathUtils.clamp(Math.round(pan.value / CELL_D + 0.6), 0, end);
    let first = middle;
    let last = middle;
    while (first > 0 && rowShown(first - 1)) first--;
    while (last < end && rowShown(last + 1)) last++;
    return [Math.max(0, first - MARGIN_ROWS), Math.min(end, last + MARGIN_ROWS)];
  }

  // ------------------------------------------------------------- motion --
  const pose = new Vector3();
  const raisedPosition = new Vector3();
  const flat = new Quaternion();
  const twisted = new Quaternion();
  const facing = new Quaternion();
  const turn = new Quaternion();
  const xAxis = new Vector3(1, 0, 0);
  const yAxis = new Vector3(0, 1, 0);
  flat.setFromAxisAngle(xAxis, -Math.PI / 2);

  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const rate = (r: number) => (reduced ? 40 : r);
    let moving = false;

    // Keep the focused row a little above the middle of the table area.
    const panTarget = Math.max(0, rowOf(focusIndex) - 0.6) * CELL_D;
    if (!held) damp(pan, panTarget, rate(5), dt);
    if (!held && !settled(pan, panTarget)) moving = true;
    // Rows passing under a drag or a fling get their prints on the way.
    const row = Math.round(pan.value / CELL_D + 0.6);
    if (row !== viewRow) {
      viewRow = row;
      feedTextures();
    }
    frame();
    lights.key.position.set(aim.x - 4, 10, aim.z - 3);
    lights.key.target.position.copy(aim);

    // Where a raised print sits: in front of the camera, filling photoRect.
    const rect = photoRect(width, height);
    const depth = 3;
    const halfH = depth * Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * (width / height);
    const ndcX = ((rect.left + rect.right) / width) - 1;
    const ndcY = 1 - ((rect.top + rect.bottom) / height);
    const boxW = ((rect.right - rect.left) / width) * 2 * halfW;
    const boxH = ((rect.bottom - rect.top) / height) * 2 * halfH;
    facing.copy(camera.quaternion);

    slots.forEach((slot, i) => {
      if (!slot.group.visible) return;
      const focused = i === focusIndex;
      const liftTarget = (focused ? (raisedTarget ? 0 : 0.14) : i === hoverIndex ? 0.07 : 0) + (picked.has(i) ? 0.05 : 0);
      const next = reduced ? liftTarget : MathUtils.lerp(slot.lift, liftTarget, 1 - Math.exp(-dt * 12));
      if (Math.abs(next - liftTarget) > 1e-4) moving = true;
      slot.lift = Math.abs(next - liftTarget) > 1e-4 ? next : liftTarget;
      // The print being opened rises while one being put back settles, so
      // stepping between photos trades them rather than cutting.
      const upTarget = focused && raisedTarget ? 1 : 0;
      damp(slot.up, upTarget, rate(4.4), dt);
      if (settled(slot.up, upTarget)) slot.up.value = upTarget;
      else moving = true;
      home(i, pose);
      pose.y += slot.lift;
      twisted.setFromAxisAngle(yAxis, focused ? 0 : slot.twist).multiply(flat);
      const t = MathUtils.clamp(slot.up.value, 0, 1);
      if (t > 1e-4) {
        // Fit the photo (not its mat) into the box, as object-fit: contain.
        const aspect = slot.w / slot.h;
        const fitW = Math.min(boxW, boxH * aspect);
        const scale = fitW / slot.w;
        raisedPosition.set(ndcX * halfW, ndcY * halfH, -depth).applyMatrix4(camera.matrixWorld);
        // Rise first, then travel, so the print leaves the table cleanly.
        const lift = MathUtils.smoothstep(t, 0, 0.35);
        pose.y += lift * 0.6;
        pose.lerp(raisedPosition, MathUtils.smoothstep(t, 0.15, 1));
        turn.slerpQuaternions(twisted, facing, MathUtils.smoothstep(t, 0.1, 0.9));
        slot.group.quaternion.copy(turn);
        slot.group.scale.setScalar(MathUtils.lerp(1, scale, MathUtils.smoothstep(t, 0.15, 1)));
        slot.group.renderOrder = 5;
      } else {
        slot.group.quaternion.copy(twisted);
        slot.group.scale.setScalar(focused && !raisedTarget ? 1.04 : 1);
        slot.group.renderOrder = 0;
      }
      slot.group.position.copy(pose);
    });

    // Once the opened print is in place: sharpen it, and let the photo
    // screen fade its full-size image in over it.
    const focusedSlot = slots[focusIndex];
    // The spring takes a while to settle completely; 99% of the way is
    // already still to the eye.
    const inPlace = raisedTarget && !!focusedSlot && focusedSlot.up.value > 0.99;
    if (inPlace && pendingImage) applyRaisedTexture();
    if (inPlace !== raisedShown) {
      raisedShown = inPlace;
      context.onRaised?.(inPlace);
    }

    // The brackets glide to the focused print and fade out while it is raised.
    if (focusedSlot) {
      home(focusIndex, pose);
      const k = reduced ? 1 : 1 - Math.exp(-dt * 14);
      const w = focusedSlot.w + MAT * 2 + 0.14;
      const h = focusedSlot.h + MAT * 2 + 0.14;
      if (reticleShown === 0) {
        reticleAt.copy(pose);
        reticleSize.set(w, h);
      }
      reticleAt.lerp(pose, k);
      reticleSize.lerp(new Vector2(w, h), k);
      if (reticleAt.distanceTo(pose) > 1e-3 || Math.abs(reticleSize.x - w) > 1e-3) moving = true;
      const shownTarget = raisedTarget ? 0 : 1;
      reticleShown = reduced ? shownTarget : MathUtils.lerp(reticleShown, shownTarget, 1 - Math.exp(-dt * 10));
      if (Math.abs(reticleShown - shownTarget) > 1e-3) moving = true;
      else reticleShown = shownTarget;
      reticle.visible = reticleShown > 0.02;
      const arm = 0.16 * reticleShown;
      const thick = 0.016;
      const hw = reticleSize.x / 2;
      const hh = reticleSize.y / 2;
      let n = 0;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ]) {
        // One arm along x, one along z, meeting at the corner.
        arms[n].scale.set(arm, thick, 1);
        arms[n].position.set(reticleAt.x + sx * (hw - arm / 2), 0.004, reticleAt.z + sz * hh);
        arms[n + 1].scale.set(thick, arm, 1);
        arms[n + 1].position.set(reticleAt.x + sx * hw, 0.004, reticleAt.z + sz * (hh - arm / 2));
        n += 2;
      }
    }

    const fog = scene.fog as Fog;
    fog.near = distance + 2;
    fog.far = distance + FOG_FAR;
    return moving;
  }

  // ----------------------------------------------------------- picking --
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  applyPalette();

  const pitchFrom = new Vector3();
  const pitchTo = new Vector3();
  const lastRow = () => rowOf(Math.max(0, sources.length - 1));
  // Positions are the table's scroll in rows; row r rests at max(0, r - 0.6).
  const follow: Follow = {
    dragAxis: () => (raisedTarget || lastRow() < 1 ? null : "y"),
    pitch: () => screenPitch(camera, pitchFrom.set(0, 0, pan.value), pitchTo.set(0, 0, pan.value + CELL_D), width, height, "y"),
    index: () => focusIndex,
    grab() {
      held = true;
      pan.velocity = 0;
      return pan.value / CELL_D;
    },
    hold(position) {
      pan.value = rubber(position, 0, Math.max(0, lastRow() - 0.6)) * CELL_D;
      invalidate();
    },
    release(landing, velocity, swipe) {
      held = false;
      pan.velocity = velocity * CELL_D;
      const from = rowOf(focusIndex);
      let row = landing < 0.2 ? 0 : Math.round(landing + 0.6);
      if (swipe && row === from) row += swipe;
      row = MathUtils.clamp(row, 0, lastRow());
      const next = MathUtils.clamp(row * columnCount + (focusIndex % columnCount), 0, Math.max(0, sources.length - 1));
      if (next !== focusIndex) {
        dropRaisedTexture();
        focusIndex = next;
      }
      feedTextures();
      invalidate();
      return focusIndex;
    }
  };

  return {
    scene,
    camera,
    setPrints(nextKey, next) {
      if (nextKey === key) return;
      key = nextKey;
      sources = next;
      focusIndex = Math.min(focusIndex, Math.max(0, next.length - 1));
      build();
      pan.value = Math.max(0, rowOf(focusIndex) - 0.6) * CELL_D;
      pan.velocity = 0;
      feedTextures();
      invalidate();
    },
    setFocus(index) {
      const next = MathUtils.clamp(index, 0, Math.max(0, sources.length - 1));
      if (next !== focusIndex) {
        dropRaisedTexture();
        // Stepping photos swaps the raised print in place: the next one takes
        // its place at once while the last settles back onto the table.
        const swap = raisedTarget && slots[focusIndex] && slots[next] ? slots[focusIndex].up.value : 0;
        focusIndex = next;
        if (swap > 0.99) {
          slots[next].up.value = 1;
          slots[next].up.velocity = 0;
        }
        if (raisedTarget) sharpenRaised();
      }
      feedTextures();
      invalidate();
    },
    settle() {
      held = false;
      pan.value = Math.max(0, rowOf(focusIndex) - 0.6) * CELL_D;
      pan.velocity = 0;
      slots.forEach((slot, i) => {
        slot.up.value = i === focusIndex && raisedTarget ? 1 : 0;
        slot.up.velocity = 0;
      });
      invalidate();
    },
    setRaised(next) {
      if (next === raisedTarget) return;
      raisedTarget = next;
      if (next) sharpenRaised();
      else dropRaisedTexture();
      invalidate();
    },
    setMarks(next, cover) {
      picked = new Set(next);
      coverIndex = cover;
      applyMarks();
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
      const hit = raycaster.intersectObject(prints, true)[0];
      const index = hit?.object.parent?.userData.index;
      return typeof index === "number" ? index : -1;
    },
    focus: () => focusIndex,
    columns: () => columnCount,
    follow,
    step,
    resize(w, h) {
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const next = tableColumns(w, h);
      if (next !== columnCount) {
        columnCount = next;
        pan.value = Math.max(0, rowOf(focusIndex) - 0.6) * CELL_D;
      }
      // A taller or narrower view shows more rows.
      feedTextures();
    },
    setPalette(next) {
      palette = next;
      applyPalette();
    },
    dispose() {
      clear();
      unit.dispose();
      matMaterial.dispose();
      pickedMaterial.dispose();
      reticleMaterial.dispose();
      surfaceMaterial.map?.dispose();
      surfaceMaterial.dispose();
      surface.geometry.dispose();
      lights.environment.dispose();
    }
  };
}
