"use client";

import { useLayoutEffect, useState } from "react";

export function useVisualViewport() {
  const [viewport, setViewport] = useState(() => ({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight, left: window.visualViewport?.offsetLeft ?? 0, top: window.visualViewport?.offsetTop ?? 0 }));
  useLayoutEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport({
      width: visual?.width ?? window.innerWidth,
      height: visual?.height ?? window.innerHeight,
      left: visual?.offsetLeft ?? 0,
      top: visual?.offsetTop ?? 0
    });
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return viewport;
}
