export interface StreamPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  homeWeight: number;
}

export interface StreamEvent {
  slug: string;
  title: string;
  date: string | null;
  location: string;
  photos: StreamPhoto[];
}

export interface HomePhotoStreamPage {
  events: StreamEvent[];
  nextCursor: string | null;
}
