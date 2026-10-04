import {
  BoxGeometry,
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
  type CanvasTexture,
  type WebGLRenderer
} from "three";
import { addLighting, gridTexture, makeTexture } from "./kit";
import { damp, settled, spring } from "./motion";
import { sceneArea } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The poster creators' stage: a poster on a lit easel, painted by the
 * screen into a canvas this module owns, with a print slot at the easel's
 * foot that the poster slides into while the download renders.
 */

export interface PosterStage {
  scene: Scene;
  camera: PerspectiveCamera;
  /**
   * Shape the poster for a width:height ratio and hand back the canvas to
   * paint it on: 2048 px on its long edge, 1024 on low-power devices.
   */
  setPoster(key: string, aspect: number): HTMLCanvasElement;
  /** The canvas was repainted. */
  refresh(): void;
  /** Slide the poster into the print slot, or back up onto the easel. */
  setPrinting(printing: boolean): void;
  /** Resolves once the poster is down in the slot (at once if it isn't printing). */
  whenPrinted(): Promise<void>;
  /** Where a pointer lands on the poster, 0–1 from its top-left, or null. */
  posterPoint(clientX: number, clientY: number, rect: DOMRect): { u: number; v: number } | null;
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

export function createPosterStage(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
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
  const faceMaterial = new MeshStandardMaterial({ roughness: 0.55 });
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
    lampMaterial.color.copy(toColor(palette.accent));
    lampMaterial.emissive.copy(toColor(palette.accent));
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
  }

  // -------------------------------------------------------------- layout --
  const aim = new Vector3();
  function frame() {
    const area = sceneArea(width, height);
    const viewAspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * viewAspect;
    // Room for the poster, the easel's feet and the print slot below it.
    const tall = POSTER_H + 2.1;
    const wide = Math.max(posterW, 2.4) + 0.8;
    // On phones the easel sits between the header and the bottom panel.
    const portrait = viewAspect < 1.05;
    const distance = Math.max(wide / (area.width * 2 * halfW), tall / (2 * halfH * (portrait ? 0.42 : 0.9)));
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    aim.set(-(area.x - 0.5) * visibleW, -0.45 + ((portrait ? 0.33 : area.y) - 0.5) * visibleH, 0);
    camera.position.set(aim.x, aim.y + distance * 0.08, distance);
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
    if (!settled(intro, 1) || !settled(print, printing ? 1 : 0)) moving = true;
    lights.key.position.set(aim.x - 5, 10, 7);
    lights.key.target.position.copy(aim);

    // On the easel: leaning back with the board, lifted a touch on hover.
    // Printing: the poster lifts off, swings flat over the housing and
    // slides down into it until only its top edge shows.
    const p = MathUtils.smootherstep(print.value, 0, 1);
    const lift = hover && !printing ? 0.06 : 0;
    const introDrop = (1 - intro.value) * 1.2;
    const up = MathUtils.smoothstep(p, 0, 0.35);
    const down = MathUtils.smoothstep(p, 0.35, 1);
    posterGroup.position.set(
      0,
      0.05 + lift - introDrop + up * 0.4 - down * (POSTER_H * 0.82 + 1.24),
      MathUtils.lerp(0.06, 1.03, up)
    );
    posterGroup.rotation.set(MathUtils.lerp(LEAN, 0, up), 0, 0);
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
  function hit(clientX: number, clientY: number, rect: DOMRect) {
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(face, false)[0] ?? null;
  }

  applyPalette();
  shape();

  return {
    scene,
    camera,
    setPoster(nextKey, nextAspect) {
      const edge = lowPower ? 1024 : 2048;
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
    posterPoint(clientX, clientY, rect) {
      const found = hit(clientX, clientY, rect);
      return found?.uv ? { u: found.uv.x, v: 1 - found.uv.y } : null;
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
      return hit(clientX, clientY, rect) ? 0 : -1;
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
      for (const thing of [legGeo, ledgeGeo, boardGeo, faceGeo, housingGeo, slotGeo, lampGeo, floor.geometry]) thing.dispose();
      for (const material of [woodMaterial, boardMaterial, faceMaterial, housingMaterial, slotMaterial, lampMaterial]) material.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      lights.environment.dispose();
      canvas.width = canvas.height = 1;
    }
  };
}
