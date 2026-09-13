"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { CosplanTemplateSummary } from "@/lib/cosplanTypes";

function LoadingEditor() {
  const t = useTranslations("cosplan");
  return <div className="ui-panel flex min-h-[60dvh] items-center justify-center p-6 text-sm text-fg-subtle">{t("loading")}</div>;
}

const CosplanEditor = dynamic(() => import("./CosplanEditor"), {
  ssr: false,
  loading: LoadingEditor
});

export default function CosplanEditorLoader({ templates }: { templates: CosplanTemplateSummary[] }) {
  return <CosplanEditor templates={templates} />;
}
