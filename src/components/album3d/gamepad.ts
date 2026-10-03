/**
 * Game controller support for the 3D site: the d-pad or left stick moves the
 * menu focus, A confirms, B goes back, Y opens the archive index and the
 * shoulder buttons switch photographer. Each press is replayed as the
 * matching key on window, so every screen's keyboard handling covers it.
 *
 * Polls only while a controller is connected; the Gamepad API has no events
 * for button presses. The 3D site loads this module once a controller
 * connects, so visitors without one never download it.
 */

// Standard mapping (https://w3c.github.io/gamepad/#remapping).
const BUTTON_KEYS: Record<number, string> = {
  0: "Enter",
  1: "Escape",
  3: "/",
  4: "ArrowLeft",
  5: "ArrowRight",
  12: "ArrowUp",
  13: "ArrowDown",
  14: "ArrowLeft",
  15: "ArrowRight"
};
const STICK_THRESHOLD = 0.55;
const REPEAT_DELAY = 380;
const REPEAT_EVERY = 140;

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/**
 * Starts watching controllers and returns a cleanup. Calls `onUse` whenever a
 * controller is used, so hints can show its buttons.
 */
export function watchGamepads(onUse: (active: boolean) => void): () => void {
  let raf = 0;
  const held = new Map<string, number>();

  function poll() {
    raf = 0;
    const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => Boolean(p?.connected));
    if (pads.length === 0) return;
    const now = performance.now();
    const down = new Set<string>();
    for (const pad of pads) {
      pad.buttons.forEach((button, i) => {
        const key = BUTTON_KEYS[i];
        if (key && button.pressed) down.add(key);
      });
      const [x = 0, y = 0] = pad.axes;
      if (y < -STICK_THRESHOLD) down.add("ArrowUp");
      if (y > STICK_THRESHOLD) down.add("ArrowDown");
      if (x < -STICK_THRESHOLD) down.add("ArrowLeft");
      if (x > STICK_THRESHOLD) down.add("ArrowRight");
    }
    for (const key of down) {
      const since = held.get(key);
      // Arrows repeat while held, as a keyboard does; buttons fire once.
      const repeats = key.startsWith("Arrow");
      if (since === undefined) {
        held.set(key, now);
        onUse(true);
        press(key);
      } else if (repeats && now - since > REPEAT_DELAY) {
        held.set(key, now - REPEAT_DELAY + REPEAT_EVERY);
        press(key);
      }
    }
    for (const key of held.keys()) if (!down.has(key)) held.delete(key);
    raf = requestAnimationFrame(poll);
  }

  const start = () => {
    if (!raf) raf = requestAnimationFrame(poll);
  };
  const stop = () => {
    if (Array.from(navigator.getGamepads()).some((p) => p?.connected)) return;
    onUse(false);
  };
  window.addEventListener("gamepadconnected", start);
  window.addEventListener("gamepaddisconnected", stop);
  start();
  // Typing on a keyboard hands the hints back to keyboard keys.
  const onKey = (e: KeyboardEvent) => {
    if (e.isTrusted) onUse(false);
  };
  window.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("gamepadconnected", start);
    window.removeEventListener("gamepaddisconnected", stop);
    window.removeEventListener("keydown", onKey);
  };
}
