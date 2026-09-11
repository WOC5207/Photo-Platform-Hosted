export const QR_LABEL_MIN_SIZE_MM = 30;
export const QR_LABEL_MAX_SIZE_MM = 300;
export const QR_LABEL_MIN_TEXT_SIZE_PT = 7;
export const QR_LABEL_MAX_TEXT_SIZE_PT = 24;
export const QR_LABEL_MIN_LOGO_HEIGHT_MM = 4;
export const QR_LABEL_MAX_LOGO_HEIGHT_MM = 24;
export const QR_LABEL_MIN_ELEMENT_GAP_MM = 0;
export const QR_LABEL_MAX_ELEMENT_GAP_MM = 12;

const LABEL_PADDING_MM = 4;
const MIN_QR_SIZE_MM = 20;
const MM_PER_POINT = 25.4 / 72;
const TEXT_LINE_HEIGHT = 1.2;
const CENTER_LOGO_MAX_QR_RATIO = 0.22;

export type EquipmentQrLogoPlacement = "ABOVE" | "CENTER";

export type EquipmentQrLabelLayout = {
  paddingMm: number;
  logoHeightMm: number;
  logoHeightLimitMm: number;
  logoSlotMm: number;
  textSizePt: number;
  textBlockGapMm: number;
  nameUidGapMm: number;
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
  logoHeightMm,
  elementGapMm
}: {
  labelWidthMm: number;
  labelHeightMm: number;
  includeName: boolean;
  includeUid: boolean;
  includeLogo: boolean;
  logoPlacement: EquipmentQrLogoPlacement;
  textSizePt: number;
  logoHeightMm: number;
  elementGapMm: number;
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
    ((includeName || includeUid) &&
      (!Number.isFinite(textSizePt) ||
        textSizePt < QR_LABEL_MIN_TEXT_SIZE_PT ||
        textSizePt > QR_LABEL_MAX_TEXT_SIZE_PT)) ||
    (includeLogo &&
      (!Number.isFinite(logoHeightMm) ||
        logoHeightMm < QR_LABEL_MIN_LOGO_HEIGHT_MM ||
        logoHeightMm > QR_LABEL_MAX_LOGO_HEIGHT_MM)) ||
    !Number.isFinite(elementGapMm) ||
    elementGapMm < QR_LABEL_MIN_ELEMENT_GAP_MM ||
    elementGapMm > QR_LABEL_MAX_ELEMENT_GAP_MM
  ) {
    return null;
  }

  const requestedLogoHeightMm = includeLogo ? logoHeightMm : 0;
  const logoSlotMm = includeLogo && logoPlacement === "ABOVE"
    ? requestedLogoHeightMm + elementGapMm
    : 0;
  const hasText = includeName || includeUid;
  const resolvedTextSizePt = hasText ? textSizePt : 0;
  const textLineHeightMm = resolvedTextSizePt * MM_PER_POINT * TEXT_LINE_HEIGHT;
  const textBlockGapMm = hasText ? elementGapMm : 0;
  const nameUidGapMm = includeName && includeUid ? elementGapMm : 0;
  const nameSlotMm = includeName
    ? textLineHeightMm
    : 0;
  const uidTextSizePt = includeUid ? resolvedTextSizePt : 0;
  const uidSlotMm = includeUid
    ? textLineHeightMm
    : 0;
  const qrSizeMm = Math.min(
    labelWidthMm - LABEL_PADDING_MM * 2,
    labelHeightMm - LABEL_PADDING_MM * 2 - logoSlotMm - textBlockGapMm -
      nameSlotMm - nameUidGapMm - uidSlotMm
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
    textBlockGapMm,
    nameUidGapMm,
    nameSlotMm,
    uidTextSizePt,
    uidSlotMm,
    qrSizeMm
  };
}
