"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  addCustomChecklistItem,
  addSelectedEquipment,
  removeChecklistItem,
  setChecklistEquipmentStatus
} from "@/app/[locale]/dashboard/(protected)/preparation/actions";
import { deleteChecklist3d } from "@/app/[locale]/3d/u/[username]/studio/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EquipmentScanner from "@/components/equipment/EquipmentScanner";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { STATUS_KEY } from "./gear";
import { ClassicLink, StudioHeading } from "./shared";
import type { StudioAccount, StudioChecklist, StudioChecklistItem, StudioChecklistState } from "./types";

const STATE_KEY = {
  PLANNED: "eventStatePlanned",
  AT_EVENT: "eventStateAtEvent",
  RETURNED: "eventStateReturned",
  BROKEN: "eventStateBroken"
} as const satisfies Record<StudioChecklistState, string>;

/** Steps left on the event-day journey: out to the event, then back home. */
const STEPS_LEFT: Record<StudioChecklistState, number> = { PLANNED: 2, AT_EVENT: 1, RETURNED: 0, BROKEN: 0 };

/** The three marks a scan can make, as buttons: the inventory status each sets, and the checklist state it shows. */
const MARKS = [
  ["SIGNED_OUT", "AT_EVENT", "eventStateAtEvent"],
  ["IN_INVENTORY", "RETURNED", "eventStateReturned"],
  ["BROKEN", "BROKEN", "quickStatusBroken"]
] as const;

/**
 * One packing checklist on the board: a column per category (custom
 * reminders in their own), each piece of equipment a tab lit for the steps
 * still ahead of it, out to the event and back. The panel keeps the classic
 * scanner (a 2D overlay over the scene), marks the focused item by hand,
 * and adds or removes items.
 */
export default function ChecklistScreen({ account, checklist }: { account: StudioAccount; checklist: StudioChecklist }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const tp = useTranslations("preparation");
  const { path, key, touch } = useStage();
  const scene = useScene("board");
  const { username } = account;
  const [column, setColumn] = useState(0);
  const [row, setRow] = useState(0);
  const [pickCategory, setPickCategory] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  // Open on an empty list, then left as the photographer sets it, so adding
  // the first items doesn't fold the section away mid-task.
  const [adding, setAdding] = useState(checklist.items.length === 0);

  // Columns: each category in the list, then the custom reminders.
  const columns = useMemo(() => {
    const byCategory = new Map<string, { title: string; items: StudioChecklistItem[] }>();
    const reminders: StudioChecklistItem[] = [];
    for (const item of checklist.items) {
      if (!item.equipmentId) {
        reminders.push(item);
        continue;
      }
      const entry = byCategory.get(item.categoryId) ?? { title: item.category, items: [] };
      entry.items.push(item);
      byCategory.set(item.categoryId, entry);
    }
    const list = [...byCategory.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (reminders.length) list.push({ title: t("studioReminders"), items: reminders });
    return list;
  }, [checklist.items, t]);
  const col = Math.min(column, Math.max(0, columns.length - 1));
  const lane = columns[col];
  const at = Math.min(row, Math.max(0, (lane?.items.length ?? 1) - 1));
  const item = lane?.items[at] ?? null;

  const tiles = useMemo<BoardTile[]>(
    () =>
      columns.flatMap((c, ci) =>
        c.items.map((it, r) => ({
          id: it.id,
          column: ci,
          row: r,
          kicker: it.inventoryStatus ? te(STATUS_KEY[it.inventoryStatus]) : "",
          main: it.label,
          detail: [],
          left: it.equipmentId ? STEPS_LEFT[it.state] : 1,
          total: it.equipmentId ? 2 : 0,
          status: it.equipmentId ? te(STATE_KEY[it.state]) : ""
        }))
      ),
    [columns, te]
  );
  const flat = useMemo(() => {
    let n = 0;
    for (let c = 0; c < col; c++) n += columns[c].items.length;
    return n + at;
  }, [columns, col, at]);
  useEffect(() => {
    scene?.setTiles("slots", `studio-checklist:${checklist.id}`, tiles, columns.map((c) => c.title), "");
  }, [scene, tiles, columns, checklist.id]);
  useEffect(() => {
    scene?.setFocus(flat);
  }, [scene, flat]);

  const moveColumn = (delta: number) => {
    if (!columns.length) return;
    setColumn(Math.max(0, Math.min(columns.length - 1, col + delta)));
    setRow(0);
  };
  const moveRow = (delta: number) => {
    const count = lane?.items.length ?? 0;
    if (count) setRow(Math.max(0, Math.min(count - 1, at + delta)));
  };
  const showItem = () => document.getElementById("studio-checklist-item")?.focus();

  useScreenKeys((k, target) => {
    const lanes = scene?.columns() ?? 1;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      const delta = k === "ArrowLeft" ? -1 : 1;
      if (lanes > 1) moveRow(delta);
      else moveColumn(delta);
    } else if (k === "ArrowUp") moveRow(-lanes);
    else if (k === "ArrowDown") moveRow(lanes);
    else if (k === "Enter" && item && !isInteractive(target)) showItem();
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (input.kind === "pick") {
      const tile = tiles[input.index];
      if (!tile) return;
      if (input.index === flat) showItem();
      else {
        setColumn(tile.column);
        setRow(tile.row);
      }
    } else if (input.kind === "wheel") moveRow(input.direction);
    else {
      const lanes = scene?.columns() ?? 1;
      if (input.x === 0) moveRow(input.y * lanes);
      else if (lanes > 1) moveRow(input.x);
      else moveColumn(input.x);
    }
  });

  const gear = checklist.items.filter((i) => i.equipmentId);
  const progress = {
    total: gear.length,
    planned: gear.filter((i) => i.state === "PLANNED").length,
    atEvent: gear.filter((i) => i.state === "AT_EVENT").length,
    returned: gear.filter((i) => i.state === "RETURNED").length,
    broken: gear.filter((i) => i.state === "BROKEN").length
  };
  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    checklist.available.forEach((g) => unique.set(g.categoryId, g.category));
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [checklist.available]);
  const visible = pickCategory === "all" ? checklist.available : checklist.available.filter((g) => g.categoryId === pickCategory);
  const pickedCount = picked.filter((id) => checklist.available.some((g) => g.id === id)).length;
  // Added items leave the picker; forget them once the list comes back.
  useEffect(() => {
    setPicked((ids) => ids.filter((id) => checklist.available.some((g) => g.id === id)));
  }, [checklist.available]);

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioPreparation")} title={checklist.name}>
          <p className="font-meta mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
            {[checklist.date || te("noShootDate"), checklist.eventTitle, te("itemCount", { count: checklist.items.length })].filter(Boolean).join(" · ")}
          </p>
        </StudioHeading>
        {checklist.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-fg-muted">{checklist.notes}</p>}

        {progress.total > 0 && (
          <dl className="mt-6 grid grid-cols-4 border-y border-border py-3">
            {(
              [
                ["eventStatePlanned", progress.planned],
                ["eventStateAtEvent", progress.atEvent],
                ["eventStateReturned", progress.returned],
                ["eventStateBroken", progress.broken]
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="min-w-0 px-1">
                <dt className={`${metaLabel} truncate`}>{te(label)}</dt>
                <dd className="font-meta mt-1 text-xl tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4">
          <EquipmentScanner checklistId={checklist.id} initialProgress={progress} />
        </div>

        {item ? (
          <section id="studio-checklist-item" tabIndex={-1} aria-labelledby="studio-checklist-item-title" className="mt-6 grid gap-3 outline-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="studio-checklist-item-title" className="text-lg font-bold">
                {item.label}
              </h2>
              <p className={metaLabel}>
                {lane.title}{" "}
                <span className="text-fg">
                  <Rolling value={pad(at + 1)} />
                </span>{" "}
                / {pad(lane.items.length)}
              </p>
            </div>
            {item.equipmentId ? (
              <>
                <p className="text-sm text-fg-muted">
                  {te("eventStatus")}: {te(STATE_KEY[item.state])}
                  {item.inventoryStatus && ` · ${te("inventoryStatus")}: ${te(STATUS_KEY[item.inventoryStatus])}`}
                </p>
                <form action={setChecklistEquipmentStatus} className="grid grid-cols-3 gap-1" aria-label={`${te("setInventoryStatus")}: ${item.label}`}>
                  <input type="hidden" name="checklistId" value={checklist.id} />
                  <input type="hidden" name="equipmentId" value={item.equipmentId} />
                  {MARKS.map(([status, state, label]) => (
                    <button
                      key={status}
                      type="submit"
                      name="status"
                      value={status}
                      aria-pressed={item.state === state}
                      disabled={item.state === state}
                      className={`min-h-11 border px-2 text-xs font-semibold uppercase tracking-[0.06em] transition ${
                        item.state === state ? (status === "BROKEN" ? "border-danger bg-danger text-page" : "border-fg bg-fg text-page") : "border-border-strong hover:border-fg"
                      }`}
                    >
                      {te(label)}
                    </button>
                  ))}
                </form>
              </>
            ) : (
              <p className="text-sm text-fg-muted">{te("customItem")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {item.equipmentId && (
                <Link href={path({ kind: "studio", username, page: "equipmentItem", id: item.equipmentId })} scroll={false} className={`${secondaryClass} text-xs`}>
                  {te("openInventoryItem")}
                </Link>
              )}
              <form action={removeChecklistItem}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className={`${secondaryClass} text-xs text-danger`}>
                  {t("studioRemove")}
                </button>
              </form>
            </div>
          </section>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{te("emptyChecklistItems")}</p>
        )}

        <details className="mt-6 border-t border-border pt-4" open={adding} onToggle={(e) => setAdding(e.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">+ {te("addItems")}</summary>
          <div className="mt-3 grid gap-4">
            {checklist.available.length === 0 ? (
              <p className="text-sm text-fg-subtle">{checklist.inventoryEmpty ? tp("noEquipment") : tp("allSelected")}</p>
            ) : (
              <form action={addSelectedEquipment} className="grid gap-3">
                <input type="hidden" name="checklistId" value={checklist.id} />
                <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                  {tp("categoryFilter")}
                  <select value={pickCategory} onChange={(e) => setPickCategory(e.target.value)} className={fieldClass}>
                    <option value="all">{tp("allCategories")}</option>
                    {categories.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="grid max-h-72 gap-1 overflow-y-auto pr-1">
                  <legend className="sr-only">{tp("pickHint")}</legend>
                  {visible.map((g) => (
                    <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 border border-border-strong bg-page/70 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="equipmentIds"
                        value={g.id}
                        checked={picked.includes(g.id)}
                        onChange={(e) => setPicked((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((id) => id !== g.id)))}
                        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{g.name}</span>
                        <span className="text-xs text-fg-subtle">{g.category}</span>
                      </span>
                      <span className="font-meta shrink-0 text-[0.625rem] uppercase tracking-[0.1em] text-fg-subtle">{te(STATUS_KEY[g.status])}</span>
                    </label>
                  ))}
                </fieldset>
                {/* Every picked item posts, filtered or not, as on the classic picker. */}
                {picked
                  .filter((id) => !visible.some((g) => g.id === id))
                  .map((id) => (
                    <input key={id} type="hidden" name="equipmentIds" value={id} />
                  ))}
                <button type="submit" disabled={pickedCount === 0} className={secondaryClass}>
                  {tp("addSelected", { count: pickedCount })}
                </button>
              </form>
            )}
            <form action={addCustomChecklistItem} className="flex items-end gap-2 border-t border-border pt-4">
              <input type="hidden" name="checklistId" value={checklist.id} />
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-fg-muted">
                {te("customItem")}
                <input name="label" required maxLength={200} className={fieldClass} />
              </label>
              <button type="submit" className={secondaryClass}>
                {te("add")}
              </button>
            </form>
            <form action={deleteChecklist3d} className="border-t border-border pt-4">
              <input type="hidden" name="id" value={checklist.id} />
              <ConfirmSubmit label={te("deleteChecklist")} confirmText={te("deleteChecklistConfirm", { name: checklist.name })} />
            </form>
          </div>
        </details>
        <ClassicLink href={`/dashboard/preparation/equipment/${encodeURIComponent(checklist.id)}`} />
      </BookingPanel>
      {!touch && tiles.length > 0 && (
        <Hints className={styles.menuHint} parts={[`← → ↑ ↓ ${t("hintSelect")}`, `${key("confirm")} ${t("studioHintItem")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
