import SharepostPhotos from "@/components/album3d/creators/sharepost/SharepostPhotos";
import SharepostScreen from "@/components/album3d/creators/sharepost/SharepostScreen";

export default function SharepostPage() {
  return (
    <SharepostScreen step="photos">
      <SharepostPhotos />
    </SharepostScreen>
  );
}
