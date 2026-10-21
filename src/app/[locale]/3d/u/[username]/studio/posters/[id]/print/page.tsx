import SharepostPrint from "@/components/album3d/creators/sharepost/SharepostPrint";
import SharepostScreen from "@/components/album3d/creators/sharepost/SharepostScreen";

export default function StudioPosterPrintPage() {
  return (
    <SharepostScreen step="print">
      <SharepostPrint />
    </SharepostScreen>
  );
}
