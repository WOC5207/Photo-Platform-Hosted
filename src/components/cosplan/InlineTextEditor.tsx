"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Group, Layer, Stage } from "react-konva";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import type { CosplanTextLayer } from "@/lib/cosplanTypes";
import { useVisualViewport } from "./useVisualViewport";

/** A temporary view transform; poster geometry and the export stage never change. */
export default function InlineTextEditor({ layer, value, onChange, onFinish, children }: {
  layer: CosplanTextLayer;
  value: string;
  onChange: (value: string) => void;
  onFinish: (save: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations("cosplan");
  const viewport = useVisualViewport();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const pendingFinish = useRef<boolean | null>(null);
  const finish = (save: boolean) => {
    if (composing.current) { pendingFinish.current = save; input.current?.blur(); return; }
    onFinish(save);
  };
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(value.length, value.length);
    return () => {
      document.body.style.overflow = oldOverflow;
      previous?.focus({ preventScroll: true });
    };
    // Focus once per session, never on a keystroke or keyboard resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scale = Math.max(16 / layer.fontSize, Math.min(1, (viewport.width - 32) / layer.width));
  const width = Math.max(24, layer.width * scale);
  const areaHeight = Math.max(60, viewport.height - 72);
  const top = Math.min(48, areaHeight * 0.15);
  const fontSize = layer.fontSize * scale;
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(Math.max(fontSize * 1.15, field.scrollHeight), Math.max(44, areaHeight - top - 16))}px`;
  }, [value, fontSize, width, areaHeight, top]);

  return createPortal(<section role="dialog" aria-modal="true" aria-label={t("editText")} className="fixed z-[100] flex flex-col bg-page" style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}>
    <div className="relative min-h-0 flex-1 overflow-auto" onClick={(event) => { if (event.target !== input.current) { event.stopPropagation(); finish(true); } }}>
      <div className="relative" style={{ width: Math.max(viewport.width, width + 32), height: areaHeight }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <Stage width={Math.max(viewport.width, width + 32)} height={areaHeight}>
            <Layer listening={false} x={16} y={top} scaleX={scale} scaleY={scale} rotation={-layer.rotation}>
              <Group x={-layer.x} y={-layer.y}>{children}</Group>
            </Layer>
          </Stage>
        </div>
        <textarea ref={input} aria-label={t("content")} placeholder={t("textPlaceholder")} value={value}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(event) => {
            composing.current = false;
            onChange(event.currentTarget.value);
            const pending = pendingFinish.current;
            pendingFinish.current = null;
            if (pending !== null) queueMicrotask(() => onFinish(pending));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); finish(false); }
            if (event.key === "Tab") { event.preventDefault(); (event.shiftKey ? document.getElementById("cosplan-text-cancel") : document.getElementById("cosplan-text-done"))?.focus(); }
          }}
          className="absolute m-0 resize-none rounded-none border-0 bg-transparent p-0 outline outline-2 outline-accent placeholder:text-fg-subtle"
          style={{ left: 16, top, width, fontSize, fontFamily: layer.fontFamily, fontWeight: layer.bold ? "bold" : "normal", lineHeight: 1.15, textAlign: layer.align, color: layer.fill, overflowWrap: "break-word", whiteSpace: "pre-wrap" }} />
      </div>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-raised px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" onKeyDown={(event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const id = (event.target as HTMLElement).id;
        if (id === "cosplan-text-cancel" && !event.shiftKey) document.getElementById("cosplan-text-done")?.focus();
        else if (id === "cosplan-text-done" && event.shiftKey) document.getElementById("cosplan-text-cancel")?.focus();
        else input.current?.focus({ preventScroll: true });
      }
      if (event.key === "Escape") finish(false);
    }}>
      <Button id="cosplan-text-cancel" onPointerDown={(event) => event.preventDefault()} onClick={() => finish(false)}>{t("cancelText")}</Button>
      <Button id="cosplan-text-done" variant="primary" onPointerDown={(event) => event.preventDefault()} onClick={() => finish(true)}>{t("doneText")}</Button>
    </div>
  </section>, document.body);
}
