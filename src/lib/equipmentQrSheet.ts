export const QR_LABEL_MIN_SIZE_MM = 30;
export const QR_LABEL_MAX_SIZE_MM = 300;
export const QR_LABEL_MIN_TEXT_SIZE_PT = 7;
export const QR_LABEL_MAX_TEXT_SIZE_PT = 24;
export const QR_LABEL_MIN_LOGO_HEIGHT_MM = 4;
export const QR_LABEL_MAX_LOGO_HEIGHT_MM = 24;

const LABEL_PADDING_MM = 4;
const LOGO_GAP_MM = 3;
const NAME_VERTICAL_PADDING_MM = 3;
const UID_TEXT_SIZE_PT = 7;
const UID_VERTICAL_PADDING_MM = 2;
const MIN_QR_SIZE_MM = 20;
const MM_PER_POINT = 25.4 / 72;
const CENTER_LOGO_MAX_QR_RATIO = 0.22;

export type EquipmentQrLogoPlacement = "ABOVE" | "CENTER";

export type EquipmentQrLabelLayout = {
  paddingMm: number;
  logoHeightMm: number;
  logoHeightLimitMm: number;
  logoSlotMm: number;
  textSizePt: number;
  nameSlotMm: number;
  uidTextSizePt: number;
  uidSlotMm: number;
  qrSizeMm: number;
};

export function calculateEquipmentQrLabelLayout({
  labelWidthMm,
  labelHeightMm,
  includeName,
  includeUid,
  includeLogo,
  logoPlacement,
  textSizePt,
  logoHeightMm
}: {
  labelWidthMm: number;
  labelHeightMm: number;
  includeName: boolean;
  includeUid: boolean;
  includeLogo: boolean;
  logoPlacement: EquipmentQrLogoPlacement;
  textSizePt: number;
  logoHeightMm: number;
}): EquipmentQrLabelLayout | null {
  if (
    !Number.isFinite(labelWidthMm) ||
    !Number.isFinite(labelHeightMm) ||
    labelWidthMm < QR_LABEL_MIN_SIZE_MM ||
    labelHeightMm < QR_LABEL_MIN_SIZE_MM ||
    labelWidthMm > QR_LABEL_MAX_SIZE_MM ||
    labelHeightMm > QR_LABEL_MAX_SIZE_MM
  ) {
    return null;
  }

  if (
    (includeName &&
      (!Number.isFinite(textSizePt) ||
        textSizePt < QR_LABEL_MIN_TEXT_SIZE_PT ||
        textSizePt > QR_LABEL_MAX_TEXT_SIZE_PT)) ||
    (includeLogo &&
      (!Number.isFinite(logoHeightMm) ||
        logoHeightMm < QR_LABEL_MIN_LOGO_HEIGHT_MM ||
        logoHeightMm > QR_LABEL_MAX_LOGO_HEIGHT_MM))
  ) {
    return null;
  }

  const requestedLogoHeightMm = includeLogo ? logoHeightMm : 0;
  const logoSlotMm = includeLogo && logoPlacement === "ABOVE"
    ? requestedLogoHeightMm + LOGO_GAP_MM
    : 0;
  const resolvedTextSizePt = includeName ? textSizePt : 0;
  const nameSlotMm = includeName
    ? resolvedTextSizePt * MM_PER_POINT + NAME_VERTICAL_PADDING_MM
    : 0;
  const uidTextSizePt = includeUid ? UID_TEXT_SIZE_PT : 0;
  const uidSlotMm = includeUid
    ? uidTextSizePt * MM_PER_POINT + UID_VERTICAL_PADDING_MM
    : 0;
  const qrSizeMm = Math.min(
    labelWidthMm - LABEL_PADDING_MM * 2,
    labelHeightMm - LABEL_PADDING_MM * 2 - logoSlotMm - nameSlotMm - uidSlotMm
  );

  if (qrSizeMm < MIN_QR_SIZE_MM) return null;
  const logoHeightLimitMm = includeLogo && logoPlacement === "CENTER"
    ? Math.min(
        QR_LABEL_MAX_LOGO_HEIGHT_MM,
        Math.max(QR_LABEL_MIN_LOGO_HEIGHT_MM, qrSizeMm * CENTER_LOGO_MAX_QR_RATIO)
      )
    : QR_LABEL_MAX_LOGO_HEIGHT_MM;
  const resolvedLogoHeightMm = includeLogo
    ? Math.min(requestedLogoHeightMm, logoHeightLimitMm)
    : 0;
  return {
    paddingMm: LABEL_PADDING_MM,
    logoHeightMm: resolvedLogoHeightMm,
    logoHeightLimitMm,
    logoSlotMm,
    textSizePt: resolvedTextSizePt,
    nameSlotMm,
    uidTextSizePt,
    uidSlotMm,
    qrSizeMm
  };
}
