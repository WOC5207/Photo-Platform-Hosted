export const QR_LABEL_MIN_SIZE_MM = 30;
export const QR_LABEL_MAX_SIZE_MM = 300;
export const QR_LABEL_MIN_TEXT_SIZE_PT = 7;
export const QR_LABEL_MAX_TEXT_SIZE_PT = 24;
export const QR_LABEL_MIN_LOGO_HEIGHT_MM = 4;
export const QR_LABEL_MAX_LOGO_HEIGHT_MM = 24;

const LABEL_PADDING_MM = 4;
const LOGO_GAP_MM = 3;
const NAME_VERTICAL_PADDING_MM = 3;
const MIN_QR_SIZE_MM = 20;
const MM_PER_POINT = 25.4 / 72;

export type EquipmentQrLabelLayout = {
  paddingMm: number;
  logoHeightMm: number;
  logoSlotMm: number;
  textSizePt: number;
  nameSlotMm: number;
  qrSizeMm: number;
};

export function calculateEquipmentQrLabelLayout({
  labelWidthMm,
  labelHeightMm,
  includeName,
  includeLogo,
  textSizePt,
  logoHeightMm
}: {
  labelWidthMm: number;
  labelHeightMm: number;
  includeName: boolean;
  includeLogo: boolean;
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

  const resolvedLogoHeightMm = includeLogo ? logoHeightMm : 0;
  const logoSlotMm = includeLogo ? resolvedLogoHeightMm + LOGO_GAP_MM : 0;
  const resolvedTextSizePt = includeName ? textSizePt : 0;
  const nameSlotMm = includeName
    ? resolvedTextSizePt * MM_PER_POINT + NAME_VERTICAL_PADDING_MM
    : 0;
  const qrSizeMm = Math.min(
    labelWidthMm - LABEL_PADDING_MM * 2,
    labelHeightMm - LABEL_PADDING_MM * 2 - logoSlotMm - nameSlotMm
  );

  if (qrSizeMm < MIN_QR_SIZE_MM) return null;
  return {
    paddingMm: LABEL_PADDING_MM,
    logoHeightMm: resolvedLogoHeightMm,
    logoSlotMm,
    textSizePt: resolvedTextSizePt,
    nameSlotMm,
    qrSizeMm
  };
}
