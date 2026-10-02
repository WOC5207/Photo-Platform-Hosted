import PlatformThemeScope from "@/components/PlatformThemeScope";

// The palette is read from the database on every request.
export const dynamic = "force-dynamic";

export default function PlatformPublicLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <PlatformThemeScope>{children}</PlatformThemeScope>;
}
