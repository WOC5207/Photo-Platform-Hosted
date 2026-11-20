"use client";

import { useEffect, useMemo, useState } from "react";
import { useStage } from "../booking/shared";
import type { StudioPhoto } from "./types";

const PORTRAIT_QUERY = "(max-aspect-ratio: 105/100)";

/**
 * An event's photos on the light table, behind a Dashboard screen: the
 * focused print carries the brackets, picked ones sit on an accent mat, and
 * the cover has a tab. A new set of photos (one deleted, one moved) lays the
 * table out again. On portrait mobile screens the Hero Loupe + Filmstrip
 * replaces the 3D table, so WebGL table textures are skipped until landscape.
 */
export function useStudioTable(eventId: string, photos: StudioPhoto[], focus: number, picked: readonly number[] = []) {
  const { engine } = useStage();
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_QUERY);
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const key = useMemo(() => `studio:${eventId}:${photos.map((p) => p.id).join()}`, [eventId, photos]);
  const cover = useMemo(() => photos.findIndex((p) => p.cover), [photos]);
  useEffect(() => {
    if (!engine || portrait || window.matchMedia(PORTRAIT_QUERY).matches) return;
    engine.showTable(key, photos, focus, false);
    // photos changes only with key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, focus, portrait]);
  useEffect(() => {
    if (!engine || portrait || window.matchMedia(PORTRAIT_QUERY).matches) return;
    engine.markTable([...picked], cover);
  }, [engine, key, picked, cover, portrait]);
  return portrait;
}
