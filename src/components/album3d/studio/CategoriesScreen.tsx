"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addEquipmentCategory, deleteEquipmentCategory } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { Hints, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import type { StudioGearCategory } from "./types";

/**
 * The inventory's categories as cards on the board, one lamp lit per item
 * (up to the board's sixteen). New categories are made in the panel; empty
 * ones can be deleted there.
 */
export default function CategoriesScreen({ username, categories }: { username: string; categories: StudioGearCategory[] }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const router = useRouter();
  const { key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const [adding, startAdding] = useTransition();
  const [addError, setAddError] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const at = Math.min(focus, Math.max(0, categories.length - 1));
  const category = categories[at];
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const tiles = useMemo<BoardTile[]>(
    () =>
      categories.map((c, i) => ({
        id: c.id,
        column: 0,
        row: i,
        kicker: te("categoryName"),
        main: c.name,
        detail: [],
        left: Math.min(16, c.count),
        total: Math.min(16, Math.max(1, c.count)),
        status: te("categoryCount", { count: c.count })
      })),
    [categories, te]
  );
  useEffect(() => {
    scene?.setTiles("events", `studio-categories:${username}`, tiles, [], "");
  }, [scene, tiles, username]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const move = (delta: number) => categories.length && setFocus(wrap(at + delta, categories.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
    else if (k === "Enter" && !isInteractive(target)) document.getElementById("studio-category-name")?.focus();
    else return false;
    return true;
  });
  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") setFocus(input.index);
    else if (input.kind === "wheel") move(input.direction);
    else move(input.y !== 0 ? input.y * across : input.x);
  });

  return (
    <>
      <BookingPanel work>
        <StudioHeading trail={t("studioEquipment")} title={te("manageCategories")} />
        <p className="mt-4 text-sm text-fg-muted">{te("categorySetupHint")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const data = new FormData(formEl);
            setAddError(false);
            startAdding(async () => {
              const res = await addEquipmentCategory(data).catch(() => ({ id: undefined }));
              if (!res.id) {
                setAddError(true);
                return;
              }
              formEl.reset();
              router.refresh();
            });
          }}
          aria-busy={adding}
          className="mt-6 flex items-end gap-2"
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-fg-muted">
            {te("categoryName")}
            <input id="studio-category-name" name="name" required maxLength={100} className={fieldClass} />
          </label>
          <button type="submit" disabled={adding} className={secondaryClass}>
            {adding ? t("studioSaving") : te("createCategory")}
          </button>
        </form>
        {addError && <FormNote tone="error">{t("studioCategoryError")}</FormNote>}
        {categories.length === 0 ? (
          <p className="mt-6 text-sm text-fg-subtle">{te("createCategoryFirst")}</p>
        ) : (
          <ul ref={listRef} aria-label={te("categorySetup")} className="mt-6 grid gap-1">
            {categories.map((c, i) => (
              <li
                key={c.id}
                aria-current={i === at ? "true" : undefined}
                className={`flex min-h-12 items-center justify-between gap-3 border px-3 text-sm transition ${
                  i === at ? "border-fg bg-page/80" : "border-border-strong"
                }`}
              >
                <button type="button" onClick={() => setFocus(i)} className="min-w-0 flex-1 py-2 text-left">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className={metaLabel}>{te("categoryCount", { count: c.count })}</span>
                </button>
                {c.count === 0 && (
                  <form action={deleteEquipmentCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmit label={te("deleteCategory")} confirmText={te("deleteCategoryConfirm", { name: c.name })} />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {category && <span className="sr-only" aria-live="polite">{category.name}</span>}
      </BookingPanel>
      {!touch && categories.length > 0 && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
