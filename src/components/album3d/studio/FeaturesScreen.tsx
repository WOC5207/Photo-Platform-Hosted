"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, secondaryClass } from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import { Check, Group, Pair, SaveBar, labelClass, useSiteBoard, useSiteSave } from "./site";
import type { StudioSite } from "./types";

/**
 * Bookings, booking prices, the prize draw, the time zone and the credit
 * wording. Turning prices on shows the platform's notice to accept first,
 * as the classic page does. Each feature is a card, lit while it is on.
 */
export default function FeaturesScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminSite");
  const { state, pending, submit } = useSiteSave();
  const v = site.values;
  const notice = site.priceNotice;
  const noticeReady = Boolean(notice.title.trim() && notice.body.trim());
  const [booking, setBooking] = useState(v.bookingEnabled);
  const [price, setPrice] = useState(v.bookingPriceEnabled);
  const [lottery, setLottery] = useState(v.lotteryEnabled);
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [accepted, setAccepted] = useState(0);
  useEffect(() => {
    if (state.error !== "priceNoticeRequired") return;
    setPrice(false);
    setAccepted(0);
    setAsking(true);
  }, [state]);

  const tiles = useMemo<BoardTile[]>(() => {
    const rows: [string, boolean, string][] = [
      [ts("bookingEnabledLabel"), v.bookingEnabled, ts("groupBookingTitle")],
      [ts("bookingPriceEnabledLabel"), v.bookingPriceEnabled, ts("groupBookingTitle")],
      [ts("lotteryEnabledLabel"), v.lotteryEnabled, ts("groupLotteryTitle")],
      [ts("creditProfilesEnabledLabel", { term: site.creditTerm }), v.creditProfilesEnabled, ts("groupCreditsTitle")]
    ];
    return [
      ...rows.map(([main, on, kicker], i) => ({ id: `f${i}`, column: 0, row: i, kicker, main, detail: [], left: on ? 1 : 0, total: 1, status: t(on ? "studioOn" : "studioOff") })),
      { id: "zone", column: 0, row: rows.length, kicker: ts("timeZoneLabel"), main: v.timeZone, detail: [], left: 1, total: 1, status: "" }
    ];
  }, [v, site.creditTerm, t, ts]);
  useSiteBoard(`studio-features:${site.account.username}`, tiles);

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioCrumbs.site")} title={ts("settingsTabFeatures")} />
      <form onSubmit={submit} aria-busy={pending} className="mt-6 grid gap-6">
        <Group title={ts("groupBookingTitle")} hint={ts("groupBookingHint")}>
          <Check
            name="bookingEnabled"
            checked={booking}
            onChange={(e) => {
              setBooking(e.target.checked);
              if (!e.target.checked) {
                setLottery(false);
                setPrice(false);
                setAsking(false);
              }
            }}
          >
            {ts("bookingEnabledLabel")}
          </Check>
          <Check
            name="bookingPriceEnabled"
            checked={booking && price}
            disabled={!booking || (!noticeReady && !price)}
            hint={ts("bookingPriceEnabledHint")}
            onChange={(e) => {
              setAgreed(false);
              if (e.target.checked) setAsking(true);
              else {
                setPrice(false);
                setAccepted(0);
                setAsking(false);
              }
            }}
          >
            {ts("bookingPriceEnabledLabel")}
          </Check>
          <input type="hidden" name="bookingPriceNoticeAcceptedVersion" value={accepted || ""} />
          {!noticeReady && !price && <FormNote tone="error">{ts("bookingPriceNoticeUnavailable")}</FormNote>}
          {asking && noticeReady && (
            <div role="dialog" aria-labelledby="studio-price-notice" className="grid gap-3 border border-border-strong bg-page/80 p-4">
              <h3 id="studio-price-notice" className="font-semibold">
                {notice.title}
              </h3>
              <p className="max-h-60 overflow-y-auto whitespace-pre-line text-sm leading-6 text-fg-muted">{notice.body}</p>
              <Check checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
                {ts("bookingPriceAcknowledge")}
              </Check>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!agreed}
                  onClick={() => {
                    setPrice(true);
                    setAccepted(notice.version);
                    setAsking(false);
                  }}
                  className={secondaryClass}
                >
                  {ts("bookingPriceAcceptEnable")}
                </button>
                <button type="button" onClick={() => setAsking(false)} className={secondaryClass}>
                  {ts("bookingPriceCancelEnable")}
                </button>
              </div>
            </div>
          )}
          <Check name="lotteryEnabled" checked={booking && lottery} disabled={!booking} hint={booking ? ts("groupLotteryHint") : ts("lotteryRequiresBooking")} onChange={(e) => setLottery(e.target.checked)}>
            {ts("lotteryEnabledLabel")}
          </Check>
          <label className={labelClass}>
            {ts("timeZoneLabel")}
            <select name="timeZone" defaultValue={v.timeZone} className={fieldClass}>
              {site.timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-fg-subtle">{ts("timeZoneHint")}</span>
          </label>
        </Group>

        <Group title={ts("groupCreditsTitle")} hint={ts("groupCreditsHint")}>
          <Check name="creditProfilesEnabled" defaultChecked={v.creditProfilesEnabled}>
            {ts("creditProfilesEnabledLabel", { term: site.creditTerm })}
          </Check>
          <Pair en="creditTermEn" zh="creditTermZh" values={v} labels={[ts("creditTermEn"), ts("creditTermZh")]} max={60} />
          <Pair en="subjectTermEn" zh="subjectTermZh" values={v} labels={[ts("subjectTermEn"), ts("subjectTermZh")]} max={60} />
          <p className="text-xs text-fg-subtle">{ts("homeCreditsLabelHint")}</p>
          <Pair en="homeCreditsLabelEn" zh="homeCreditsLabelZh" values={v} labels={[ts("homeCreditsLabelEn"), ts("homeCreditsLabelZh")]} max={60} />
        </Group>
        <SaveBar section="features" state={state} pending={pending} />
      </form>
    </BookingPanel>
  );
}
