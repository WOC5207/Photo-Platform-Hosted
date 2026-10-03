import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DirectionalLight,
  HemisphereLight,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type Scene,
  type WebGLRenderer
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * Pieces shared by the 3D site's scenes (the archive field, the cassette
 * study, the photographer carousel and the light table).
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

export function makeTexture(canvas: HTMLCanvasElement, renderer: WebGLRenderer) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

export function photoTexture(image: HTMLImageElement, renderer: WebGLRenderer, planeAspect: number) {
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  // Cover crop onto the plane.
  const imageAspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  if (imageAspect > planeAspect) {
    texture.repeat.set(planeAspect / imageAspect, 1);
    texture.offset.set((1 - texture.repeat.x) / 2, 0);
  } else {
    texture.repeat.set(1, imageAspect / planeAspect);
    texture.offset.set(0, (1 - texture.repeat.y) / 2);
  }
  texture.needsUpdate = true;
  return texture;
}

// Reference studio lighting: a room environment plus warm key, cool fill
// and a hemisphere, generated for this renderer.
export function addLighting(renderer: WebGLRenderer, scene: Scene, shadows: boolean) {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.48;
  const hemi = new HemisphereLight("#fffaf5", "#b4a18c", 0.65);
  const key = new DirectionalLight("#fff7ed", 1.4);
  key.position.set(-6, 14, -5);
  const fill = new DirectionalLight("#ffffff", 0.6);
  fill.position.set(7, 8, -10);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0003;
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  }
  scene.add(hemi, key, key.target, fill);
  return { environment, hemi, key };
}

/**
 * A ruled surface for the light table and the carousel floor: a fine grid
 * with registration ticks, tiled across the plane.
 */
export function gridTexture(renderer: WebGLRenderer, line: string, tick: string, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d") as CanvasRenderingContext2D;
  c.fillStyle = background;
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = line;
  c.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    c.beginPath();
    c.moveTo(i + 0.5, 0);
    c.lineTo(i + 0.5, 256);
    c.moveTo(0, i + 0.5);
    c.lineTo(256, i + 0.5);
    c.stroke();
  }
  c.strokeStyle = tick;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(118, 128);
  c.lineTo(138, 128);
  c.moveTo(128, 118);
  c.lineTo(128, 138);
  c.stroke();
  const texture = makeTexture(canvas, renderer);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
