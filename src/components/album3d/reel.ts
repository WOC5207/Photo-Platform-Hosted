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
import { damp, settled, smooth, spring, type Spring } from "./motion";
import { layoutFor, sceneArea } from "./types";
import type { EnginePalette } from "./engine";

/**
 * The Dashboard's events as a reel of instant prints along a ruled track,
 * oldest on the left. Each print is the event's cover with its caption in
 * the bottom margin; a draft's print is still developing, its picture faint.
 * The focused print stands square to the viewer and the rest turn away down
 * the track, ticked on the ruler under them, with a year marker where the
 * year changes and a "today" line between what has happened and what is
 * coming. Arriving, the prints drop onto the track one by one; opening one
 * draws it up toward the viewer before the event's page takes over.
 */

export interface ReelEntry {
  id: string;
  /** The dates, or the no-date label. */
  kicker: string;
  title: string;
  /** Place and photo count. */
  detail: string;
  /** "Published", "Draft". */
  status: string;
  published: boolean;
  /** The cover as a thumbnail, and larger for prints near the focus. */
  thumb: string;
  large: string;
  /** The first day, YYYY-MM-DD, or "" for an event without dates. */
  day: string;
}

export interface Reel {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Prints for one list; the same ids keep their place and only repaint. `today` is YYYY-MM-DD. */
  setEntries(key: string, entries: ReelEntry[], today: string, todayLabel: string): void;
  setFocus(index: number): void;
  /** Draw the print up toward the viewer, then call `done`; at once with reduced motion. */
  launch(index: number, done: () => void): void;
  settle(): void;
  setHover(index: number): void;
  pick(clientX: number, clientY: number, rect: DOMRect): number;
  step(dt: number): boolean;
  resize(width: number, height: number): void;
  setPalette(palette: EnginePalette): void;
  dispose(): void;
}

const FOV = 30;
const ELEVATION = MathUtils.degToRad(13);
const PHOTO_H = 2.3;
const CAPTION_H = 0.66;
const BORDER = 0.1;
const DEPTH = 0.04;
const TRACK_TOP = -1.62;
/** From the focused print to its neighbours, and between the prints further out. */
const NEAR_GAP = 2.95;
const FAR_GAP = 1.3;
const TURN = 0.7;
/** The ruler: the track's front face, ticked under each print. */
const RULER_H = 0.36;
const RULER_Z = 0.451;
/** Prints this close to the focus load the larger cover. */
const SHARP_RANGE = 2;
const CAPTION_W = 1024;
const LAUNCH_SECONDS = 0.5;

interface Print {
  data: ReelEntry;
  signature: string;
  group: Group;
  body: Mesh;
  photo: Mesh;
  photoMaterial: MeshBasicMaterial;
  photoTexture: Texture | null;
  /** The cover size now on the print: "" (none yet), "thumb" or "large". */
  loaded: "" | "thumb" | "large";
  caption: Mesh;
  captionCanvas: HTMLCanvasElement;
  captionTexture: CanvasTexture;
  captionMaterial: MeshBasicMaterial;
  tick: Mesh;
  /** The print's first day on the ruler, under its tick. */
  date: Mesh;
  dateTexture: CanvasTexture;
  dateMaterial: MeshBasicMaterial;
  /** Width of the picture window, from the cover's shape. */
  width: number;
  intro: Spring;
  hover: number;
}

export function createReel(context: {
  renderer: WebGLRenderer;
  palette: EnginePalette;
  reduced: () => boolean;
  lowPower: boolean;
  invalidate: () => void;
}): Reel {
  const { renderer, lowPower, invalidate } = context;
  let palette = context.palette;

  const scene = new Scene();
  scene.fog = new Fog(0xeae5e1, 10, 30);
  const camera = new PerspectiveCamera(FOV, 16 / 9, 0.1, 120);
  const lights = addLighting(renderer, scene, !lowPower);

  const unit = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);

  // The track: a long ruled bench the prints stand on, its front edge the ruler.
  const trackMaterial = new MeshStandardMaterial({ roughness: 0.85 });
  const track = new Mesh(box, trackMaterial);
  track.scale.set(400, RULER_H, 3.4);
  track.position.set(0, TRACK_TOP - RULER_H / 2, -1.25);
  track.receiveShadow = !lowPower;
  scene.add(track);
  let matTexture = gridTexture(renderer, "rgba(0,0,0,0.1)", "rgba(0,0,0,0.25)", "#e8e3db");
  const matMaterial = new MeshStandardMaterial({ map: matTexture, roughness: 0.95 });
  const mat = new Mesh(unit, matMaterial);
  mat.rotation.x = -Math.PI / 2;
  mat.scale.set(400, 3.4, 1);
  mat.position.set(0, TRACK_TOP + 0.001, -1.25);
  mat.receiveShadow = !lowPower;
  scene.add(mat);
  const edgeMaterial = new MeshBasicMaterial({ color: 0x1c1a16 });
  const edge = new Mesh(unit, edgeMaterial);
  edge.scale.set(400, RULER_H, 1);
  edge.position.set(0, TRACK_TOP - RULER_H / 2, RULER_Z);
  scene.add(edge);

  const bodyMaterial = new MeshStandardMaterial({ roughness: 0.6 });
  const tickMaterial = new MeshBasicMaterial({ color: 0xffffff });
  const accentMaterial = new MeshBasicMaterial({ color: 0xc8742f });
  const prints = new Group();
  scene.add(prints);

  // Year markers and the "today" line: a plate on the ruler each.
  type Marker = { mesh: Mesh; bar: Mesh; beam: Mesh | null; texture: CanvasTexture; material: MeshBasicMaterial; after: number; label: string; today: boolean };
  // Today's line also rises above the track as a faint beam, so it reads from across the reel.
  const beamMaterial = new MeshBasicMaterial({ color: 0xc8742f, transparent: true, opacity: 0.35, depthWrite: false });
  let markers: Marker[] = [];

  let key = "";
  let list: Print[] = [];
  let focusIndex = 0;
  let hoverIndex = -1;
  const reelAt = spring(0);
  let width = 1;
  let height = 1;
  let clock = 0;
  let introAt = 0;
  let launching = -1;
  let launchAt = 0;
  let launchDone: (() => void) | null = null;

  const toColor = (css: string) => new Color().setStyle(css, SRGBColorSpace);
  const paper = () => (palette.dark ? "#24211d" : "#fbf8f2");
  const ink = () => (palette.dark ? "#ece6dc" : "#1c1a16");
  const muted = () => (palette.dark ? "rgba(236,230,220,0.66)" : "rgba(28,26,22,0.62)");
  // The ruler is the page's ink in light mode and a raised dark strip in dark mode.
  const rulerInk = () => (palette.dark ? "rgba(236,230,220,0.72)" : "rgba(247,244,239,0.8)");

  // --------------------------------------------------------------- faces --
  function paintCaption(print: Print) {
    const canvas = print.captionCanvas;
    const h = Math.round((CAPTION_W * CAPTION_H) / print.width);
    if (canvas.height !== h) {
      // A texture keeps the size it was first sent to the GPU at, so a new shape needs a new one.
      canvas.height = h;
      print.captionTexture.dispose();
      print.captionTexture = makeTexture(canvas, renderer);
      print.captionMaterial.map = print.captionTexture;
      print.captionMaterial.needsUpdate = true;
    }
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    const w = CAPTION_W;
    // Type is sized to the margin, which is shorter on a wide print.
    const s = h / 290;
    c.fillStyle = paper();
    c.fillRect(0, 0, w, h);
    const pad = Math.round(30 * s);
    c.textBaseline = "alphabetic";
    c.fillStyle = print.data.published ? palette.accent : muted();
    c.font = `600 ${Math.round(32 * s)}px ${palette.fontMeta}`;
    const status = print.data.status.toUpperCase();
    const statusW = c.measureText(status).width;
    c.fillText(status, w - pad - statusW, pad + 30 * s);
    c.fillText(fitText(c, print.data.kicker.toUpperCase(), w - pad * 3 - statusW), pad, pad + 30 * s);
    c.fillStyle = ink();
    c.font = `800 ${Math.round(72 * s)}px ${palette.fontSans}`;
    c.fillText(fitText(c, print.data.title.toUpperCase(), w - pad * 2), pad, pad + 118 * s);
    if (print.data.detail) {
      c.fillStyle = muted();
      c.font = `500 ${Math.round(34 * s)}px ${palette.fontSans}`;
      c.fillText(fitText(c, print.data.detail, w - pad * 2), pad, pad + 176 * s);
    }
    print.captionTexture.needsUpdate = true;
  }

  /** No cover yet: the print's window holds the event's initial on the paper's shade. */
  function paintBlank(print: Print) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = Math.round((512 * PHOTO_H) / print.width);
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.fillStyle = palette.dark ? "#191714" : "#e4ded4";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = palette.dark ? "rgba(236,230,220,0.16)" : "rgba(28,26,22,0.14)";
    c.font = `800 ${Math.round(canvas.width * 0.5)}px ${palette.fontSans}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(Array.from(print.data.title.trim())[0]?.toUpperCase() ?? "·", canvas.width / 2, canvas.height / 2);
    setPhoto(print, makeTexture(canvas, renderer), "");
  }

  function setPhoto(print: Print, texture: Texture, loaded: Print["loaded"]) {
    print.photoTexture?.dispose();
    print.photoTexture = texture;
    print.photoMaterial.map = texture;
    print.photoMaterial.needsUpdate = true;
    print.loaded = loaded;
  }

  /** Size the print to its cover: portrait and landscape both, within limits. */
  function shape(print: Print, aspect: number) {
    const next = MathUtils.clamp(PHOTO_H * aspect, 1.7, 3.1);
    if (Math.abs(next - print.width) < 1e-3) return;
    print.width = next;
    layoutPrint(print);
    paintCaption(print);
  }

  function layoutPrint(print: Print) {
    const w = print.width;
    const totalH = PHOTO_H + CAPTION_H + BORDER * 2;
    print.body.scale.set(w + BORDER * 2, totalH, DEPTH);
    print.body.position.set(0, totalH / 2, 0);
    print.photo.scale.set(w, PHOTO_H, 1);
    print.photo.position.set(0, CAPTION_H + BORDER + PHOTO_H / 2, DEPTH / 2 + 0.002);
    print.caption.scale.set(w, CAPTION_H, 1);
    print.caption.position.set(0, BORDER + CAPTION_H / 2 - 0.02, DEPTH / 2 + 0.002);
  }

  const images = new Map<string, Promise<HTMLImageElement>>();
  function image(src: string) {
    let known = images.get(src);
    if (!known) {
      known = loadImage(src);
      images.set(src, known);
    }
    return known;
  }

  /** The thumbnail first; the larger cover once the print comes near the focus. */
  function sharpen(print: Print, near: boolean) {
    const want = near && print.data.large ? "large" : print.data.thumb ? "thumb" : "";
    if (!want || print.loaded === "large" || print.loaded === want) return;
    const src = want === "large" ? print.data.large : print.data.thumb;
    if (print.group.userData.loading === src) return;
    print.group.userData.loading = src;
    image(src).then(
      (img) => {
        if (!list.includes(print) || print.group.userData.loading !== src) return;
        print.group.userData.loading = "";
        if (print.loaded === "large") return;
        shape(print, img.naturalWidth / Math.max(1, img.naturalHeight));
        setPhoto(print, photoTexture(img, renderer, print.width / PHOTO_H), want);
        invalidate();
      },
      () => {
        print.group.userData.loading = "";
      }
    );
  }

  function makePrint(data: ReelEntry): Print {
    const group = new Group();
    const body = new Mesh(box, bodyMaterial);
    body.castShadow = !lowPower;
    const photoMaterial = imageMaterial({ transparent: true });
    const photo = new Mesh(unit, photoMaterial);
    const captionCanvas = document.createElement("canvas");
    captionCanvas.width = CAPTION_W;
    captionCanvas.height = Math.round((CAPTION_W * CAPTION_H) / 1.84);
    const captionTexture = makeTexture(captionCanvas, renderer);
    const captionMaterial = imageMaterial({ map: captionTexture });
    const caption = new Mesh(unit, captionMaterial);
    group.add(body, photo, caption);
    prints.add(group);
    const tick = new Mesh(unit, tickMaterial);
    const dateCanvas = document.createElement("canvas");
    dateCanvas.width = 256;
    dateCanvas.height = 64;
    const dateTexture = makeTexture(dateCanvas, renderer);
    const dateMaterial = new MeshBasicMaterial({ map: dateTexture, transparent: true, depthWrite: false });
    const date = new Mesh(unit, dateMaterial);
    date.scale.set(0.72, 0.18, 1);
    scene.add(tick, date);
    const print: Print = {
      data,
      signature: "",
      group,
      body,
      photo,
      photoMaterial,
      photoTexture: null,
      loaded: "",
      caption,
      captionCanvas,
      captionTexture,
      captionMaterial,
      tick,
      date,
      dateTexture,
      dateMaterial,
      width: 1.84,
      intro: spring(0),
      hover: 0
    };
    layoutPrint(print);
    return print;
  }

  function disposePrint(print: Print) {
    print.photoTexture?.dispose();
    print.photoMaterial.dispose();
    print.captionTexture.dispose();
    print.captionMaterial.dispose();
    print.dateTexture.dispose();
    print.dateMaterial.dispose();
    print.group.removeFromParent();
    print.tick.removeFromParent();
    print.date.removeFromParent();
  }

  /** The day under the print's tick: month and day, the year being on its marker. */
  function paintDate(print: Print, focused: boolean) {
    const canvas = print.dateTexture.image as HTMLCanvasElement;
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = focused ? palette.accent : rulerInk();
    c.font = `${focused ? 700 : 500} 40px ${palette.fontMeta}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(print.data.day ? print.data.day.slice(5).replace("-", ".") : "--.--", canvas.width / 2, canvas.height / 2);
    print.dateTexture.needsUpdate = true;
    print.group.userData.dateFocused = focused;
  }

  function paintMarker(marker: Marker) {
    const canvas = marker.texture.image as HTMLCanvasElement;
    const c = canvas.getContext("2d") as CanvasRenderingContext2D;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = marker.today ? palette.accent : rulerInk();
    c.font = `700 56px ${palette.fontMeta}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(fitText(c, marker.label.toUpperCase(), canvas.width - 12), canvas.width / 2, canvas.height / 2);
    marker.texture.needsUpdate = true;
  }

  function clearMarkers() {
    for (const marker of markers) {
      marker.texture.dispose();
      marker.material.dispose();
      marker.mesh.removeFromParent();
      marker.bar.removeFromParent();
      marker.beam?.removeFromParent();
    }
    markers = [];
  }

  /** A marker after print `after` (between it and the next): each new year, and today. */
  function buildMarkers(today: string, todayLabel: string) {
    clearMarkers();
    const add = (after: number, label: string, isToday: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 96;
      const texture = makeTexture(canvas, renderer);
      const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const mesh = new Mesh(unit, material);
      const bar = new Mesh(unit, isToday ? accentMaterial : tickMaterial);
      const beam = isToday ? new Mesh(unit, beamMaterial) : null;
      scene.add(mesh, bar);
      if (beam) scene.add(beam);
      const marker = { mesh, bar, beam, texture, material, after, label, today: isToday };
      paintMarker(marker);
      markers.push(marker);
    };
    const days = list.map((p) => p.data.day);
    for (let i = 1; i < days.length; i++) {
      const year = days[i].slice(0, 4);
      if (year && year !== days[i - 1].slice(0, 4)) add(i - 1, year, false);
    }
    const dated = days.filter(Boolean).length;
    if (dated > 0 && today) {
      // After the last event that started before today.
      let last = -1;
      days.forEach((day, i) => {
        if (day && day < today) last = i;
      });
      add(last, todayLabel, true);
    }
  }

  function applyPalette() {
    const page = toColor(palette.page);
    scene.background = page;
    (scene.fog as Fog).color.copy(page);
    scene.environmentIntensity = palette.dark ? 0.22 : 0.48;
    lights.hemi.intensity = palette.dark ? 0.35 : 0.65;
    lights.key.intensity = palette.dark ? 1.1 : 1.4;
    trackMaterial.color.copy(palette.dark ? toColor(palette.surface) : toColor(palette.control).lerp(page, 0.3));
    matTexture.dispose();
    matTexture = palette.dark
      ? gridTexture(renderer, "rgba(255,255,255,0.06)", "rgba(255,255,255,0.16)", "#1d1b18")
      : gridTexture(renderer, "rgba(28,26,22,0.08)", "rgba(28,26,22,0.22)", "#ebe6de");
    matTexture.repeat.set(400 / 1.2, 3.4 / 1.2);
    matMaterial.map = matTexture;
    matMaterial.needsUpdate = true;
    edgeMaterial.color.copy(palette.dark ? toColor(palette.raised).lerp(toColor(palette.fg), 0.08) : toColor(palette.fg));
    tickMaterial.color.copy(palette.dark ? toColor(palette.fg) : toColor(palette.page));
    accentMaterial.color.copy(toColor(palette.accent));
    beamMaterial.color.copy(toColor(palette.accent));
    bodyMaterial.color.copy(toColor(paper()));
    for (const print of list) {
      paintCaption(print);
      paintDate(print, Boolean(print.group.userData.dateFocused));
      if (!print.loaded) paintBlank(print);
    }
    for (const marker of markers) paintMarker(marker);
  }

  // -------------------------------------------------------------- layout --
  /** Where a print stands for a reel position `at`: square on in front at the focus, turned away beside it. */
  function pose(i: number, at: number) {
    const d = i - at;
    const near = Math.min(1, Math.abs(d));
    const far = Math.max(0, Math.abs(d) - 1);
    const side = Math.sign(d);
    return {
      x: side * (near * NEAR_GAP + far * FAR_GAP),
      z: 0.2 - near * 0.95 - far * 0.32,
      turn: -side * near * TURN,
      lift: (1 - near) * 0.06
    };
  }

  // -------------------------------------------------------------- camera --
  const viewDirection = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const aim = new Vector3();
  let distance = 12;

  function frame() {
    const portrait = layoutFor(width, height) === "portrait";
    const area = sceneArea(width, height);
    const aspect = width / height;
    const halfH = Math.tan(MathUtils.degToRad(FOV / 2));
    const halfW = halfH * aspect;
    // The focused print and a neighbour each side; tall enough for a print and the ruler.
    const span = portrait ? 4.2 : 7.4;
    const tall = PHOTO_H + CAPTION_H + BORDER * 2 + 1.1;
    distance = Math.max(span / (area.width * 2 * halfW), tall / (2 * halfH * (portrait ? 0.4 : 0.74)));
    const visibleW = 2 * halfW * distance;
    const visibleH = 2 * halfH * distance;
    const middle = TRACK_TOP + (PHOTO_H + CAPTION_H) / 2 + 0.05;
    aim.set(-(area.x - 0.5) * visibleW, middle - ((portrait ? 0.32 : area.y) - 0.5) * visibleH, 0);
    camera.position.copy(aim).addScaledVector(viewDirection, distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  }

  // -------------------------------------------------------------- motion --
  function step(dt: number): boolean {
    clock += dt;
    const reduced = context.reduced();
    const rate = (r: number) => (reduced ? 60 : r);
    let moving = false;
    frame();

    damp(reelAt, focusIndex, rate(6.5), dt);
    if (!settled(reelAt, focusIndex)) moving = true;
    const at = reelAt.value;
    // The mat slides under the prints, so the reel reads as moving along the track.
    matTexture.offset.x = (at * NEAR_GAP) / 1.2;

    const launchT = launching >= 0 ? (reduced ? 1 : smooth((clock - launchAt) / LAUNCH_SECONDS)) : 0;
    list.forEach((print, i) => {
      const p = pose(i, at);
      // Arriving: each print drops onto the track in turn, outward from the focus.
      const due = clock - introAt > Math.abs(i - focusIndex) * 0.06;
      const introTarget = reduced || due ? 1 : 0;
      damp(print.intro, introTarget, rate(7.5), dt);
      if (!settled(print.intro, introTarget)) moving = true;
      const drop = 1 - print.intro.value;
      const hoverTarget = i === hoverIndex && launching < 0 ? 1 : 0;
      print.hover = reduced ? hoverTarget : MathUtils.lerp(print.hover, hoverTarget, 1 - Math.exp(-dt * 12));
      if (Math.abs(print.hover - hoverTarget) > 1e-3) moving = true;

      let x = p.x;
      let y = TRACK_TOP + p.lift + print.hover * 0.08 + drop * 2.6;
      let z = p.z;
      let turn = p.turn;
      if (i === launching) {
        // Drawn up off the track toward the viewer.
        x = MathUtils.lerp(x, 0, launchT);
        y += launchT * 0.45;
        z += launchT * 3.2;
        turn *= 1 - launchT;
      } else if (launching >= 0) {
        y -= launchT * 0.4;
      }
      // Past the second neighbour a print folds down onto the track, so the reel stays two deep each side.
      const fold = smooth(MathUtils.clamp((Math.abs(i - at) - 2.2) / 0.8, 0, 1));
      print.group.position.set(x, y, z);
      print.group.rotation.set(-drop * 0.5 - fold * (Math.PI / 2), turn, drop * 0.08 * Math.sign(i - focusIndex || 1));
      print.group.scale.setScalar(Math.max(1e-3, 1 - fold));
      print.group.visible = fold < 1;
      // A draft is still developing: its picture comes through faintly.
      print.photoMaterial.opacity = print.data.published ? 1 : 0.38;

      const focused = i === focusIndex;
      print.tick.scale.set(focused ? 0.045 : 0.022, focused ? 0.14 : 0.08, 1);
      print.tick.material = focused ? accentMaterial : tickMaterial;
      print.tick.position.set(p.x, TRACK_TOP - print.tick.scale.y / 2, RULER_Z + 0.002);
      print.date.position.set(p.x, TRACK_TOP - 0.25, RULER_Z + 0.002);
      print.tick.visible = print.date.visible = Math.abs(i - at) < 9;
      if (Boolean(print.group.userData.dateFocused) !== focused) paintDate(print, focused);

      sharpen(print, Math.abs(i - focusIndex) <= SHARP_RANGE);
    });

    for (const marker of markers) {
      // Halfway between the print before and the one after, or past the end.
      const before = marker.after >= 0 ? pose(marker.after, at).x : pose(0, at).x - NEAR_GAP;
      const after = marker.after + 1 < list.length ? pose(marker.after + 1, at).x : before + NEAR_GAP;
      const x = (before + after) / 2;
      // A long tick on the ruler with the year or "today" under it, between two prints' dates.
      marker.bar.scale.set(marker.today ? 0.04 : 0.024, 0.16, 1);
      marker.bar.position.set(x, TRACK_TOP - 0.08, RULER_Z + 0.003);
      marker.mesh.scale.set(0.72, 0.216, 1);
      marker.mesh.position.set(x, TRACK_TOP - 0.25, RULER_Z + 0.003);
      if (marker.beam) {
        const tall = PHOTO_H + CAPTION_H + BORDER * 2 + 0.8;
        marker.beam.scale.set(0.03, tall, 1);
        marker.beam.position.set(x, TRACK_TOP + tall / 2, -0.35);
      }
    }

    if (launching >= 0 && launchDone && (reduced || clock - launchAt >= LAUNCH_SECONDS)) {
      const done = launchDone;
      launchDone = null;
      done();
    }
    if (launching >= 0 && launchDone) moving = true;

    lights.key.position.set(aim.x - 5, 10, 7);
    lights.key.target.position.copy(aim);
    const fog = scene.fog as Fog;
    fog.near = distance + 1.5;
    fog.far = distance + 15;
    return moving;
  }

  // ------------------------------------------------------------- picking --
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  applyPalette();

  return {
    scene,
    camera,
    setEntries(nextKey, next, today, todayLabel) {
      const changed = nextKey !== key;
      if (changed) {
        for (const print of list) disposePrint(print);
        list = [];
        key = nextKey;
      }
      const kept = new Map(list.map((p) => [p.data.id, p]));
      list = next.map((data) => {
        const print = kept.get(data.id) ?? makePrint(data);
        kept.delete(data.id);
        const signature = JSON.stringify(data);
        if (signature !== print.signature) {
          const coverChanged = print.data.thumb !== data.thumb || print.data.large !== data.large;
          print.data = data;
          print.signature = signature;
          if (coverChanged || !print.loaded) paintBlank(print);
          paintCaption(print);
          paintDate(print, Boolean(print.group.userData.dateFocused));
        }
        return print;
      });
      for (const print of kept.values()) disposePrint(print);
      buildMarkers(today, todayLabel);
      focusIndex = MathUtils.clamp(focusIndex, 0, Math.max(0, list.length - 1));
      launching = -1;
      launchDone = null;
      if (changed) this.settle();
      invalidate();
    },
    setFocus(index) {
      const next = MathUtils.clamp(index, 0, Math.max(0, list.length - 1));
      if (next === focusIndex) return;
      focusIndex = next;
      invalidate();
    },
    launch(index, done) {
      if (context.reduced() || !list[index]) {
        done();
        return;
      }
      launching = index;
      launchAt = clock;
      launchDone = done;
      invalidate();
    },
    settle() {
      reelAt.value = focusIndex;
      reelAt.velocity = 0;
      // Each arrival plays the prints dropping onto the track.
      introAt = clock;
      for (const print of list) {
        print.intro.value = context.reduced() ? 1 : 0;
        print.intro.velocity = 0;
      }
      launching = -1;
      launchDone = null;
      frame();
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
      const hit = raycaster.intersectObject(prints, true).find((h) => h.object.parent?.visible && h.point.y > TRACK_TOP);
      const group = hit?.object.parent;
      return group ? list.findIndex((p) => p.group === group) : -1;
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
      for (const print of list) disposePrint(print);
      list = [];
      clearMarkers();
      unit.dispose();
      box.dispose();
      matTexture.dispose();
      for (const material of [trackMaterial, matMaterial, edgeMaterial, bodyMaterial, tickMaterial, accentMaterial, beamMaterial]) material.dispose();
      lights.environment.dispose();
    }
  };
}
