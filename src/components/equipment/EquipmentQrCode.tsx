"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import Button from "@/components/ui/Button";

function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "equipment";
}

export default function EquipmentQrCode({
  name,
  qrToken,
  locale
}: {
  name: string;
  qrToken: string;
  locale: string;
}) {
  const t = useTranslations("equipment");
  const [dataUrl, setDataUrl] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const scanPath = useMemo(
    () => `/${locale}/equipment/${encodeURIComponent(qrToken)}`,
    [locale, qrToken]
  );

  useEffect(() => {
    const absoluteUrl = new URL(scanPath, window.location.origin).toString();
    setScanUrl(absoluteUrl);
    let active = true;
    QRCode.toDataURL(absoluteUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 360,
      color: { dark: "#111827", light: "#ffffff" }
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [scanPath]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-control p-4">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={t("qrAlt", { name })}
          className="aspect-square w-44 rounded-lg bg-white p-2"
        />
      ) : (
        <div className="flex aspect-square w-44 items-center justify-center rounded-lg bg-white p-4 text-center text-xs text-slate-600">
          {t("qrLoading")}
        </div>
      )}
      <p className="max-w-full truncate font-mono text-[0.6875rem] text-fg-subtle">
        {qrToken.slice(0, 8).toUpperCase()}
      </p>
      <div className="grid w-full grid-cols-2 gap-2">
        <Button
          size="compact"
          disabled={!dataUrl}
          onClick={() => {
            if (!dataUrl) return;
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `${safeFileName(name)}-qr.png`;
            link.click();
          }}
        >
          {t("downloadQr")}
        </Button>
        <Button
          size="compact"
          disabled={!scanUrl}
          onClick={async () => {
            if (!scanUrl) return;
            try {
              await navigator.clipboard.writeText(scanUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t("copiedLink") : t("copyScanLink")}
        </Button>
      </div>
    </div>
  );
}
