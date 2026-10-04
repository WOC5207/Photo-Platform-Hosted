"use client";

import { createContext, useContext, useEffect } from "react";
import type { AlbumPhotos } from "./types";

/** Lets an album's /photos layout hand its photos to the 3D site's stage. */
export const AlbumPhotosContext = createContext<(photos: AlbumPhotos | null) => void>(() => undefined);

/** Renders nothing: it passes the server-loaded photos up for as long as it is mounted. */
export default function AlbumPhotosFeed({ photos }: { photos: AlbumPhotos }) {
  const publish = useContext(AlbumPhotosContext);
  useEffect(() => {
    publish(photos);
    return () => publish(null);
  }, [photos, publish]);
  return null;
}
