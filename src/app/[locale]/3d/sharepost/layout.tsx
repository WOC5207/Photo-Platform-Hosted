import SharepostStudioProvider from "@/components/album3d/creators/sharepost/SharepostStudio";

/**
 * The 3D Sharepost creator's steps share one working draft, kept here so it
 * survives moving between the photographs, layout, credits and printing. The
 * draft lives in the visitor's browser, as the classic editor's does.
 */
export default function SharepostLayout({ children }: { children: React.ReactNode }) {
  return <SharepostStudioProvider>{children}</SharepostStudioProvider>;
}
