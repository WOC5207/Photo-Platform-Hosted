import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import CosplanEditor from "../../src/components/cosplan/CosplanEditor";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import Konva from "konva";

const nameSlots = new URLSearchParams(location.search).has("names");
if (nameSlots) Object.assign(window, { testKonva: Konva });

const locale = new URLSearchParams(location.search).get("locale") === "zh" ? "zh" : "en";
createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale={locale} messages={locale === "zh" ? zh : en}>
  <CosplanEditor templates={[{ id: "test", title: "Test poster", titleEn: "Test poster", titleZh: "测试海报", width: 800, height: 1000, assetToken: "test", imageUrl: "/background.svg", slots: nameSlots ? [{ id: "friday", nameEn: "Friday", nameZh: "周五", x: 50, y: 100, width: 300, height: 650, nameText: { x: 50, y: 750, width: 300, height: 60, fontSize: 32, fill: "#ffffff", align: "center", bold: true } }] : [], foregroundToken: null, foregroundUrl: null, layoutVersion: 1 }]} />
</NextIntlClientProvider>);
