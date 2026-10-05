"use client";

import { useEffect, useMemo } from "react";
import { useStage } from "../booking/shared";
import type { StudioPhoto } from "./types";

/**
 * An event's photos on the light table, behind a Dashboard screen: the
 * focused print carries the brackets, picked ones sit on an accent mat, and
 * the cover has a tab. A new set of photos (one deleted, one moved) lays the
 * table out again.
 */
export function useStudioTable(eventId: string, photos: StudioPhoto[], focus: number, picked: readonly number[] = []) {
  const { engine } = useStage();
  const key = useMemo(() => `studio:${eventId}:${photos.map((p) => p.id).join()}`, [eventId, photos]);
  const cover = useMemo(() => photos.findIndex((p) => p.cover), [photos]);
  useEffect(() => {
    engine?.showTable(key, photos, focus, false);
    // photos changes only with key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, focus]);
  useEffect(() => {
    engine?.markTable([...picked], cover);
  }, [engine, key, picked, cover]);
}
