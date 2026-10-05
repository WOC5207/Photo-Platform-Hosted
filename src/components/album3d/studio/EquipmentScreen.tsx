"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deleteEquipment, rotateEquipmentQr, setEquipmentStatus } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { QUICK_EQUIPMENT_STATUSES } from "@/lib/equipment";
import { equipmentUid } from "@/lib/equipmentQrLabel";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, fieldClass, isInteractive, metaLabel, primaryClass, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { RAIL_PICK } from "../types";
import { GEAR_CARD_ASPECT, STATUS_KEY, paintGearCard, useImages, useQrImage } from "./gear";
import { ClassicLink, StudioHeading } from "./shared";
import type { StudioEquipment } from "./types";

/** Quick status buttons, coloured like the ID card's status bar when on. */
const QUICK_ON = {
  SIGNED_OUT: "border-accent bg-accent text-page",
  IN_INVENTORY: "border-success bg-success text-page",
  BROKEN: "border-danger bg-danger text-page"
} as const;

/**
 * The equipment inventory: the photographer's gear as ID cards on the rail
 * in front of the easel, sorted by category, and the focused card standing
 * large on the easel with its photo, status and QR code. The panel filters
 * by category or search, flips the focused item between the everyday
 * statuses, and opens its editor, its label, or the inventory's other pages.
 */
export default function EquipmentScreen({ equipment }: { equipment: StudioEquipment }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const ts = useTranslations("equipmentScan");
  const tq = useTranslations("equipmentQrPrint");
  const locale = useLocale();
  const { go, path, key, touch } = useStage();
  const scene = useScene("poster");
  const image = useImages();
  const { username } = equipment.account;
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState(equipment.items[0]?.id ?? "");

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    return equipment.items.filter(
      (item) =>
        (!category || item.categoryId === category) &&
        (!q || [item.name, item.brand, item.model, item.serialNumber].some((v) => v.toLocaleLowerCase(locale).includes(q)))
    );
  }, [equipment.items, category, query, locale]);
  const index = Math.max(0, items.findIndex((item) => item.id === focusId));
  const item = items[index] ?? null;
  const qr = useQrImage(locale, item?.qrToken ?? "");

  // ------------------------------------------------------------- scene --
  useEffect(() => {
    if (!scene) return;
    scene.setRail(
      items.length ? items.map((g) => ({ key: g.id, image: image(g.photoUrl), label: g.name, sub: `${g.category} · ${te(STATUS_KEY[g.status])}` })) : null,
      index
    );
  }, [scene, items, index, image, te]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

  useEffect(() => {
    if (!scene) return;
    const canvas = scene.setPoster(`gear:${item?.id ?? "none"}`, GEAR_CARD_ASPECT, 1400);
    if (item) {
      paintGearCard(canvas, item, {
        photo: image(item.photoUrl),
        qr,
        accent: scene.accent(),
        status: te(STATUS_KEY[item.status]),
        serial: te("serialShort"),
        noPhoto: te("noPhoto")
      });
    } else {
      const c = canvas.getContext("2d");
      if (c) {
        c.fillStyle = "#f4f0ea";
        c.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    scene.refresh();
  }, [scene, item, qr, image, te]);

  // ---------------------------------------------------------- controls --
  const turn = (delta: number) => {
    if (!items.length) return;
    const next = items[Math.max(0, Math.min(items.length - 1, index + delta))];
    if (next) setFocusId(next.id);
  };
  const edit = () => item && go({ kind: "studio", username, page: "equipmentItem", id: item.id });

  useScreenKeys((k, target) => {
    if (k === "ArrowLeft" || k === "ArrowUp") turn(-1);
    else if (k === "ArrowRight" || k === "ArrowDown") turn(1);
    else if (k === "Enter" && !isInteractive(target)) edit();
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (input.kind === "pick" && input.index >= RAIL_PICK) {
      const picked = items[input.index - RAIL_PICK];
      if (!picked) return;
      if (picked.id === item?.id) edit();
      else setFocusId(picked.id);
    } else if (input.kind === "pick" && input.index === 0) edit();
    else if (input.kind === "wheel") turn(input.direction);
    else if (input.kind === "swipe" && input.x) turn(input.x);
  });

  const chip = (on: boolean) =>
    `font-meta inline-flex min-h-10 items-center gap-2 px-3 text-[0.6875rem] uppercase tracking-[0.1em] transition ${
      on ? "bg-fg text-page" : "border border-border-strong hover:border-fg"
    }`;
  const all = equipment.categories.reduce((n, c) => n + c.count, 0);

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioEquipment")} title={t("studioEquipment")} />

        <Link href={path({ kind: "studio", username, page: "equipmentNew" })} scroll={false} className={`${primaryClass} mt-6 w-full`}>
          {te("addEquipment")}
          <span aria-hidden="true" className="text-lg">+</span>
        </Link>
        <nav aria-label={te("equipmentActions")} className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["labels", te("printQrLabels")],
              ["categories", te("manageCategories")],
              ["contact", ts("contactTitle")]
            ] as const
          ).map(([page, label]) => (
            <Link key={page} href={path({ kind: "studio", username, page })} scroll={false} className={`${secondaryClass} text-xs`}>
              {label}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          ))}
        </nav>

        {equipment.items.length > 0 && (
          <>
            <div role="group" aria-label={te("browseCategories")} className="mt-6 flex flex-wrap gap-1">
              <button type="button" aria-pressed={!category} onClick={() => setCategory("")} className={chip(!category)}>
                {te("allCategories")} <span className="opacity-70">{all}</span>
              </button>
              {equipment.categories
                .filter((c) => c.count > 0)
                .map((c) => (
                  <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id)}>
                    {c.name} <span className="opacity-70">{c.count}</span>
                  </button>
                ))}
            </div>
            <label className="mt-3 grid gap-1 text-sm font-semibold text-fg-muted">
              {te("searchEquipment")}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={te("searchEquipmentPlaceholder")}
                className={fieldClass}
              />
            </label>
          </>
        )}

        {item ? (
          <section aria-labelledby="studio-gear-title" className="mt-6 grid gap-3">
            <p className={metaLabel}>
              {t("studioGearCount")}{" "}
              <span className="text-fg">
                <Rolling value={pad(index + 1)} />
              </span>{" "}
              / {pad(items.length)}
            </p>
            <div>
              <h2 id="studio-gear-title" className="text-xl font-bold uppercase tracking-[-0.01em]">
                {item.name}
              </h2>
              <p className="font-meta mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle">
                {[item.category, equipmentUid(item), item.serialNumber && `${te("serialShort")} ${item.serialNumber}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div role="group" aria-label={`${te("setInventoryStatus")}: ${item.name}`} className="grid grid-cols-3 gap-1">
              {QUICK_EQUIPMENT_STATUSES.map((choice) => (
                <form key={choice} action={setEquipmentStatus} className="flex">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="status" value={choice} />
                  <button
                    type="submit"
                    aria-pressed={item.status === choice}
                    disabled={item.status === choice}
                    className={`min-h-11 flex-1 border px-2 text-xs font-semibold uppercase tracking-[0.06em] transition ${
                      item.status === choice ? QUICK_ON[choice] : "border-border-strong hover:border-fg"
                    }`}
                  >
                    {te(STATUS_KEY[choice])}
                  </button>
                </form>
              ))}
            </div>
            {!QUICK_EQUIPMENT_STATUSES.some((s) => s === item.status) && (
              <p className="text-sm text-fg-muted">
                {te("currentStatus")}: {te(STATUS_KEY[item.status])}
              </p>
            )}
            {item.statusNote && <p className="border-l-2 border-accent pl-3 text-sm text-fg-muted">{item.statusNote}</p>}
            {item.notes && <p className="whitespace-pre-wrap text-sm text-fg-muted">{item.notes}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Link href={path({ kind: "studio", username, page: "equipmentItem", id: item.id })} scroll={false} className={secondaryClass}>
                {te("editEquipment")}
                <span aria-hidden="true" className="ml-auto">→</span>
              </Link>
              <Link
                href={`${path({ kind: "studio", username, page: "labels" })}?selected=${encodeURIComponent(item.id)}`}
                scroll={false}
                className={secondaryClass}
              >
                {tq("printLabels", { count: 1 })}
                <span aria-hidden="true" className="ml-auto">→</span>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={rotateEquipmentQr}>
                <input type="hidden" name="id" value={item.id} />
                <ConfirmSubmit label={te("replaceQr")} confirmText={te("replaceQrConfirm", { name: item.name })} />
              </form>
              <form action={deleteEquipment}>
                <input type="hidden" name="id" value={item.id} />
                <ConfirmSubmit label={te("deleteEquipment")} confirmText={te("deleteEquipmentConfirm", { name: item.name })} />
              </form>
            </div>
          </section>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">
            {equipment.items.length === 0 ? te("emptyInventory") : te("emptyCategory", { name: equipment.categories.find((c) => c.id === category)?.name ?? "" })}
          </p>
        )}
        <ClassicLink href="/dashboard/equipment" />
      </BookingPanel>
      {!touch && items.length > 0 && (
        <Hints className={styles.menuHint} parts={[`← → ${t("hintSelect")}`, `${key("confirm")} ${te("editEquipment")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
