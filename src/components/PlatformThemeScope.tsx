import {
  getPlatformSettings,
  platformPublicPalettes
} from "@/lib/platformSettings";
import { platformThemeScope } from "@/lib/themeColor";

/**
 * Applies the administrator's public palette to the platform's own pages.
 *
 * Photographer pages never pass through here: /u/<username> and the booking,
 * draw and my-booking links render inside SiteChrome with that owner's palette,
 * and management screens keep their standard look.
 */
export default async function PlatformThemeScope({
  children
}: {
  children: React.ReactNode;
}) {
  const { light, dark } = platformPublicPalettes(await getPlatformSettings());
  const scope = platformThemeScope(light, dark);

  return (
    <div
      className={`min-h-dvh bg-page text-fg ${scope.className}`.trim()}
      style={scope.style}
    >
      {children}
      {/* Dialogs portal here so they stay inside the palette. */}
      <div data-dialog-portal-root />
    </div>
  );
}
