import SharepostPhotos from "@/components/album3d/creators/sharepost/SharepostPhotos";
import SharepostScreen from "@/components/album3d/creators/sharepost/SharepostScreen";

export default function StudioPosterPage() {
  return (
    <SharepostScreen step="photos">
      <SharepostPhotos />
    </SharepostScreen>
  );
}
