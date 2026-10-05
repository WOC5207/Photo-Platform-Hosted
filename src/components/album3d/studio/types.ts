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
  /** The event's booking page, when it has one. */
  bookingId: string | null;
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

/** One booking event in the Dashboard's bookings list. */
export interface StudioBookingSummary {
  id: string;
  title: string;
  dates: string;
  location: string;
  dayCount: number;
  /** Taking bookings: the event is open and the site's bookings are on. */
  open: boolean;
  booked: number;
  capacity: number;
  hasLottery: boolean;
}

export interface StudioBookings {
  account: StudioAccount;
  /** The site-wide switch; while off, no booking page is public. */
  bookingEnabled: boolean;
  events: StudioBookingSummary[];
}

export interface StudioBooking {
  id: string;
  /** "confirmed" or "cancelled". */
  status: string;
  name: string;
  subject: string;
  contact: string;
  notes: string;
  bookedAt: string;
  /** The visitor's private link, to send them again. */
  manageUrl: string;
}

export interface StudioSlot {
  id: string;
  /** "HH:MM", the event's local time. */
  start: string;
  end: string;
  capacity: number;
  /** Confirmed bookings. */
  booked: number;
  price: string;
  description: string;
  bookings: StudioBooking[];
}

export interface StudioBookingDay {
  id: string;
  label: string;
  slots: StudioSlot[];
}

/** One booking event's schedule, with every slot's bookings. */
export interface StudioSchedule {
  id: string;
  title: string;
  dates: string;
  location: string;
  open: boolean;
  bookingEnabled: boolean;
  /** The public booking link. */
  shareUrl: string;
  galleryId: string | null;
  /** The prize draw can be opened (it is on, or one was run before). */
  lottery: boolean;
  priceEnabled: boolean;
  /** A new schedule's first batch may be copied to every day. */
  allowMultiDaySync: boolean;
  days: StudioBookingDay[];
}

/** A booking event's settings, as its form edits them. */
export interface StudioBookingSettings {
  id: string;
  title: string;
  titleEn: string;
  titleZh: string;
  /** yyyy-mm-dd, in order. */
  dates: string[];
  location: string;
  descriptionEn: string;
  descriptionZh: string;
  visitorEditsEnabled: boolean;
  visitorEditCutoffHours: number;
  open: boolean;
  bookingEnabled: boolean;
  /** The prize draw's switch is offered (the site allows draws, or this event had one). */
  showLottery: boolean;
  lotteryEnabled: boolean;
  /** Deleting the booking page keeps the album it belongs to. */
  hasGallery: boolean;
}

export interface StudioPrize {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  wonCount: number;
}

export interface StudioEntrant {
  id: string;
  token: string;
  name: string;
  subject: string;
  wonPrizeId: string | null;
}

/** A booking event's prize draw, run by the photographer. */
export interface StudioLottery {
  id: string;
  title: string;
  drawId: string;
  /** The public entry link, and whether it takes new entries. */
  shareUrl: string;
  open: boolean;
  /** Visitors can reach the draw (the site and the event both allow it). */
  public: boolean;
  prizes: StudioPrize[];
  entries: StudioEntrant[];
  /** Confirmed bookings not yet entered. */
  available: { id: string; name: string; subject: string }[];
}
