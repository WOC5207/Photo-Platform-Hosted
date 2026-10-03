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
import { addLighting, fitText, gridTexture, loadImage, makeTexture } from "./kit";
import { damp, settled, spring, wrap } from "./motion";
import { sceneArea } from "./types";
import type { EnginePalette } from "./engine";

/**
 * Photographer select, as a character select: one tall card per photographer
 * on a curved rail, the focused one in front and lifted, tilting toward the
 * pointer. On a photographer's own screen the chosen card stands up larger
 * and the rest step back.
 */

export interface CarouselCard {
  name: string;
  username: string;
  /** Label line, e.g. "7 albums · 79 photos". */
  meta: string;
  cover: { thumb: string; med: string } | null;
}

export interface Carousel {
  scene: Scene;
  camera: PerspectiveCamera;
  setFocus(index: number): void;
  /** Jump to the current targets, for arriving from another screen. */
  settle(): void;
  setStanding(standing: boolean): void;
  setPointer(x: number, y: number): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  focus(): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const CARD_W = 2.5;
const CARD_H = 3.6;
const CARD_D = 0.07;
const SPACING = 2.95;
const FLOOR_Y = -CARD_H / 2 - 0.35;
const FOV = 30;
const TEXTURE_W = 600;
const TEXTURE_H = Math.round((TEXTURE_W * CARD_H) / CARD_W);

interface Face {
  group: Group;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  material: MeshStandardMaterial;
  image: HTMLImageElement | null;
  hover: number;
}

export function createCarousel(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  cards: CarouselCard[];
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Carousel {
  const { renderer, cards, lowPower, invalidate } = context;
  let palette = context.palette;
  const count = cards.length;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 12, 30);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 80);
  const lights = addLighting(renderer, scene, !lowPower);

  const floorMaterial = new MeshStandardMaterial({ roughness: 0.95 });
  const floor = new Mesh(new PlaneGeometry(120, 120), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = !lowPower;
  scene.add(floor);

  const bodyGeometry = new BoxGeometry(CARD_W, CARD_H, CARD_D);
  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  const faceGeometry = new PlaneGeometry(CARD_W - 0.08, CARD_H - 0.08);
  const rail = new Group();
  scene.add(rail);

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);

  /** The card face: photo window, code, name, handle and counts. */
  function paint(face: Face, index: number) {
    const card = cards[index];
    const c = face.canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = TEXTURE_W;
    const h = TEXTURE_H;
    const ink = palette.dark ? "#ece6dc" : "#1c1a16";
    const muted = palette.dark ? "rgba(236,230,220,0.6)" : "rgba(28,26,22,0.55)";
    c.fillStyle = palette.dark ? "#26231f" : "#f7f4ef";
    c.fillRect(0, 0, w, h);
    const pad = 34;
    const photoH = Math.round(h * 0.6);
    c.fillStyle = palette.dark ? "#3a352f" : "#e4dfd5";
    c.fillRect(pad, pad, w - pad * 2, photoH);
    if (face.image) {
      // Cover crop into the window.
      const { naturalWidth: iw, naturalHeight: ih } = face.image;
      const box = (w - pad * 2) / photoH;
      const ratio = iw / Math.max(1, ih);
      let sx = 0;
      let sy = 0;
      let sw = iw;
      let sh = ih;
      if (ratio > box) {
        sw = ih * box;
        sx = (iw - sw) / 2;
      } else {
        sh = iw / box;
        sy = (ih - sh) / 2;
      }
      c.drawImage(face.image, sx, sy, sw, sh, pad, pad, w - pad * 2, photoH);
    }
    // Corner fasteners and the amber guide, as on the archive cassettes.
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
    c.fillRect(pad, pad + photoH + 18, 64, 6);

    const top = pad + photoH + 64;
    c.fillStyle = muted;
    c.font = `500 20px ${palette.fontMeta}`;
    c.fillText(`OP-${String(index + 1).padStart(2, "0")}`, pad, top);
    c.fillText("PINHAOSHE", w - pad - c.measureText("PINHAOSHE").width, top);
    c.fillStyle = ink;
    c.font = `800 58px ${palette.fontSans}`;
    c.fillText(fitText(c, card.name.toUpperCase(), w - pad * 2), pad, top + 70);
    c.fillStyle = muted;
    c.font = `400 24px ${palette.fontMeta}`;
    c.fillText(fitText(c, `@${card.username}`, w - pad * 2), pad, top + 112);
    c.fillStyle = ink;
    c.fillRect(pad, top + 140, w - pad * 2, 2);
    c.font = `500 22px ${palette.fontMeta}`;
    c.fillText(fitText(c, card.meta.toUpperCase(), w - pad * 2), pad, top + 182);
    face.texture.needsUpdate = true;
  }

  const faces: Face[] = cards.map((card, i) => {
    const group = new Group();
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = !lowPower;
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_W;
    canvas.height = TEXTURE_H;
    const texture = makeTexture(canvas, renderer);
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.45 });
    const front = new Mesh(faceGeometry, material);
    front.position.z = CARD_D / 2 + 0.002;
    group.add(body, front);
    group.userData.index = i;
    rail.add(group);
    const face: Face = { group, canvas, texture, material, image: null, hover: 0 };
    if (card.cover) {
      loadImage(card.cover.med)
        .then((image) => {
          face.image = image;
          paint(face, i);
          invalidate();
        })
        .catch(() => undefined);
    }
    return face;
  });

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
    floorMaterial.map.repeat.set(60, 60);
    floorMaterial.needsUpdate = true;
    faces.forEach(paint);
  }

  let focusIndex = 0;
  let hoverIndex = -1;
  let standingTarget = false;
  const focusSpring = spring(0);
  const standing = spring(0);
  const tiltX = spring(0);
  const tiltY = spring(0);
  let pointerX = 0;
  let pointerY = 0;
  let width = 1;
  let height = 1;
  let clock = 0;

  /** A card's place on the rail relative to the focus, wrapping when the roster loops. */
  function offset(index: number, focus: number) {
    if (count < 4) return index - focus;
    return wrap(index - focus + count / 2, count) - count / 2;
  }

  const aim = new Vector3();
  const eye = new Vector3();

  function frame() {
    const area = sceneArea(width, height);
    const aspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    // Three cards across the free area; the next ones peek in at the edges.
    const span = SPACING * 2.6 + CARD_W;
    const distance = Math.max(span / (area.width * 2 * halfW), (CARD_H * 1.7) / (2 * halfH * (aspect < 1.05 ? 0.5 : 0.8)));
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    aim.set(-(area.x - 0.5) * visibleW, 0.15 + (area.y - 0.5) * visibleH, 0);
    eye.set(aim.x, aim.y + distance * 0.14, distance);
    camera.position.copy(eye);
    camera.lookAt(aim);
  }

  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const rate = (r: number) => (reduced ? 60 : r);
    let moving = false;
    const target = count < 4 ? focusIndex : focusSpring.value + offset(focusIndex, focusSpring.value);
    damp(focusSpring, target, rate(5.2), dt);
    if (!settled(focusSpring, target)) moving = true;
    const standTarget = standingTarget ? 1 : 0;
    damp(standing, standTarget, rate(4.5), dt);
    if (!settled(standing, standTarget)) moving = true;
    damp(tiltX, pointerY * 0.12, rate(6), dt);
    damp(tiltY, pointerX * 0.16, rate(6), dt);
    if (!settled(tiltX, pointerY * 0.12) || !settled(tiltY, pointerX * 0.16)) moving = true;
    frame();

    const bob = reduced || lowPower ? 0 : Math.sin(clock * 1.6) * 0.04;
    if (bob) moving = true;
    faces.forEach((face, i) => {
      const k = offset(i, focusSpring.value);
      const d = Math.abs(k);
      const near = MathUtils.clamp(1 - d, 0, 1);
      const hoverTarget = i === hoverIndex && i !== focusIndex ? 1 : 0;
      face.hover = reduced ? hoverTarget : MathUtils.lerp(face.hover, hoverTarget, 1 - Math.exp(-dt * 12));
      if (Math.abs(face.hover - hoverTarget) > 1e-3) moving = true;
      const s = standing.value;
      // The rail bends away from the camera; the focused card steps forward.
      const x = Math.sign(k) * Math.min(d, 1) * SPACING + Math.sign(k) * Math.max(0, d - 1) * SPACING * 0.82;
      const z = -Math.pow(d, 1.15) * 1.25 + near * 0.6 - s * (1 - near) * 2.6;
      const y = near * (0.32 + bob) + face.hover * 0.18 - s * (1 - near) * 0.5 + s * near * 0.2;
      face.group.position.set(x, y, z);
      face.group.rotation.set(near * tiltX.value, MathUtils.clamp(-k * 0.38, -0.7, 0.7) + near * tiltY.value, 0);
      face.group.scale.setScalar(1 + s * near * 0.14);
      face.group.visible = d < 4.2;
    });

    lights.key.position.set(aim.x - 6, 12, 6);
    lights.key.target.position.copy(aim);
    const fog = scene.fog as Fog;
    const distance = camera.position.distanceTo(aim);
    fog.near = distance + 1;
    fog.far = distance + 16;
    return moving;
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  applyPalette();

  return {
    scene,
    camera,
    setFocus(index) {
      if (!count) return;
      const next = wrap(index, count);
      if (next === focusIndex) return;
      focusIndex = next;
      invalidate();
    },
    settle() {
      focusSpring.value = focusIndex;
      standing.value = standingTarget ? 1 : 0;
      focusSpring.velocity = standing.velocity = 0;
      invalidate();
    },
    setStanding(next) {
      if (next === standingTarget) return;
      standingTarget = next;
      invalidate();
    },
    setPointer(x, y) {
      pointerX = x;
      pointerY = y;
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
      const hit = raycaster.intersectObject(rail, true)[0];
      const index = hit?.object.parent?.userData.index;
      return typeof index === "number" ? index : -1;
    },
    focus: () => focusIndex,
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
      for (const face of faces) {
        face.texture.dispose();
        face.material.dispose();
      }
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      faceGeometry.dispose();
      floorMaterial.map?.dispose();
      floorMaterial.dispose();
      floor.geometry.dispose();
      lights.environment.dispose();
    }
  };
}
