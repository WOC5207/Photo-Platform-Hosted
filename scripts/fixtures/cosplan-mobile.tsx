import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import CosplanEditor from "../../src/components/cosplan/CosplanEditor";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

const locale = new URLSearchParams(location.search).get("locale") === "zh" ? "zh" : "en";
createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale={locale} messages={locale === "zh" ? zh : en}>
  <CosplanEditor templates={[{ id: "test", title: "Test poster", titleEn: "Test poster", titleZh: "测试海报", width: 800, height: 1000, assetToken: "test", imageUrl: "/background.svg", slots: [], foregroundToken: null, foregroundUrl: null, layoutVersion: 1 }]} />
</NextIntlClientProvider>);
