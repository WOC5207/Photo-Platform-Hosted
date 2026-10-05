/** What the 3D Dashboard's pages hand their screens (see lib/studio3d). */

export interface StudioAccount {
  username: string;
  name: string;
  admin: boolean;
}

export interface StudioNotice {
  id: string;
  title: string;
  body: string;
}

export interface StudioHome {
  account: StudioAccount;
  /** The archive lists them: they have a published album visitors can see. */
  listed: boolean;
  events: number;
  drafts: number;
  photos: number;
  usedBytes: number;
  quotaBytes: number;
  creditTerm: string;
  notices: StudioNotice[];
}

export interface StudioEventSummary {
  id: string;
  title: string;
  dateLabel: string;
  location: string;
  published: boolean;
  photoCount: number;
}

export interface StudioEventDetail extends StudioEventSummary {
  titleEn: string;
  titleZh: string;
  slug: string;
  dateStart: string;
  dateEnd: string;
  descriptionEn: string;
  descriptionZh: string;
  /** Uploads still waiting in the add-photos queue. */
  pendingCount: number;
  /** The album on the 3D site, once visitors can see it. */
  publicPath: string | null;
}

export interface StudioPhoto {
  id: string;
  thumb: string;
  med: string;
  width: number;
  height: number;
  name: string;
  cover: boolean;
  highlight: boolean;
  /** Visitors can see it: screening passed or wasn't needed. */
  visible: boolean;
  /** "pending", "review", "rejected" or "error" while it is private. */
  screening: string;
  credit: string;
  subject: string;
}
