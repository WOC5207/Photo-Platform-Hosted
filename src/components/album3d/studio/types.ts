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
  /** They've set a logo, background image or any of their site's colours. */
  styled: boolean;
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
  /** The album's cover (or first photo) as a thumbnail, or "". */
  cover: string;
  /** The same picture larger, for the events reel's prints near the focus. */
  coverLarge: string;
  /** The first day, YYYY-MM-DD, or "" without dates. */
  day: string;
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

export type StudioGearStatus = "IN_INVENTORY" | "SIGNED_OUT" | "MAINTENANCE" | "BROKEN" | "OTHER";

/** One piece of equipment, as its ID card shows it. */
export interface StudioGear {
  id: string;
  name: string;
  brand: string;
  model: string;
  categoryId: string;
  category: string;
  status: StudioGearStatus;
  statusNote: string;
  serialNumber: string;
  notes: string;
  /** The reference photo, or "". */
  photoUrl: string;
  qrToken: string;
}

export interface StudioGearCategory {
  id: string;
  name: string;
  count: number;
}

/** The inventory, sorted by category and then the owner's order. */
export interface StudioEquipment {
  account: StudioAccount;
  items: StudioGear[];
  categories: StudioGearCategory[];
}

export interface StudioGearContact {
  method: string;
  label: string;
  value: string;
}

/** The QR label sheet's inventory and the site logo it can print. */
export interface StudioLabels {
  items: StudioGear[];
  categories: string[];
  logoUrl: string;
  /** Items to start with on the sheet (?selected=). */
  selected: string[];
}

export type StudioChecklistState = "PLANNED" | "AT_EVENT" | "RETURNED" | "BROKEN";

export interface StudioChecklistSummary {
  id: string;
  name: string;
  date: string;
  notes: string;
  /** The booking event the checklist's day belongs to, if any. */
  eventId: string | null;
  eventTitle: string;
  items: number;
  /** Inventory items on the list, and how far along they are. */
  gear: number;
  atEvent: number;
  returned: number;
  broken: number;
}

export interface StudioPreparation {
  account: StudioAccount;
  checklists: StudioChecklistSummary[];
  events: { id: string; title: string }[];
  /** The booking event the list is narrowed to (?event=), or null. */
  event: string | null;
}

export interface StudioChecklistItem {
  id: string;
  label: string;
  /** Null for a custom reminder. */
  equipmentId: string | null;
  categoryId: string;
  category: string;
  state: StudioChecklistState;
  inventoryStatus: StudioGearStatus | null;
  /** The label code under the QR code, "" for a custom reminder. */
  uid: string;
}

export interface StudioChecklist {
  id: string;
  name: string;
  date: string;
  notes: string;
  bookingEventId: string | null;
  eventTitle: string;
  items: StudioChecklistItem[];
  /** Inventory not on the list yet, for the picker. */
  available: { id: string; name: string; categoryId: string; category: string; status: StudioGearStatus }[];
  inventoryEmpty: boolean;
}

export interface StudioSheetBooking {
  id: string;
  name: string;
  subject: string;
  contact: string;
  email: string;
  notes: string;
}

export interface StudioSheetSlot {
  id: string;
  bookingEventId: string;
  eventTitle: string;
  location: string;
  dayKey: string;
  day: string;
  start: string;
  end: string;
  finished: boolean;
  booked: number;
  capacity: number;
  price: string;
  description: string;
  bookings: StudioSheetBooking[];
}

/** Booked slots (confirmed bookings only), to mark finished after the shoot. */
export interface StudioSlotSheet {
  account: StudioAccount;
  slots: StudioSheetSlot[];
  /** More slots matched than the sheet carries; the rest are on the classic page. */
  more: boolean;
  events: { id: string; title: string }[];
  event: string | null;
}

export interface StudioStorageEvent {
  id: string;
  title: string;
  bytes: number;
  photos: number;
  pending: number;
}

/** Disk use: the quota, the split between photos and site images, and each event's share. */
export interface StudioStorage {
  account: StudioAccount;
  usedBytes: number;
  quotaBytes: number;
  photosBytes: number;
  siteImagesBytes: number;
  /** Largest first, as the classic page lists them. */
  events: StudioStorageEvent[];
}

export interface StudioCreditProfile {
  id: string;
  name: string;
  links: { platform: string; url: string }[];
}

/** The credit profiles photos are credited to, when the photographer has them turned on. */
export interface StudioCredits {
  account: StudioAccount;
  enabled: boolean;
  term: string;
  profiles: StudioCreditProfile[];
}

/** Every site setting the classic settings form edits, as it reads them. */
export interface StudioSiteValues {
  siteTitleEn: string;
  siteTitleZh: string;
  homeTitleEn: string;
  homeTitleZh: string;
  homeSubtitleEn: string;
  homeSubtitleZh: string;
  homeStreamLayout: string;
  backgroundColor: string;
  surfaceColor: string;
  fieldColor: string;
  textColor: string;
  themeColor: string;
  darkBackgroundColor: string;
  darkSurfaceColor: string;
  darkFieldColor: string;
  darkTextColor: string;
  darkThemeColor: string;
  dashboardThemeMode: string;
  creditTermEn: string;
  creditTermZh: string;
  subjectTermEn: string;
  subjectTermZh: string;
  homeCreditsLabelEn: string;
  homeCreditsLabelZh: string;
  bookingEnabled: boolean;
  bookingPriceEnabled: boolean;
  timeZone: string;
  lotteryEnabled: boolean;
  creditProfilesEnabled: boolean;
  originalDownloadsEnabled: boolean;
  announcementsEnabled: boolean;
  contactEnabled: boolean;
  contactTitleEn: string;
  contactTitleZh: string;
  contactUrlEn: string;
  contactUrlZh: string;
}

export interface StudioPersonalLink {
  id: string;
  labelEn: string;
  labelZh: string;
  url: string;
}

export interface StudioAnnouncement {
  id: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  imageUrl: string;
}

/** The site settings, their images, links and announcements, for the settings pages. */
export interface StudioSite {
  account: StudioAccount;
  displayName: string;
  email: string;
  values: StudioSiteValues;
  images: { logo: string; background: string; contactQrEn: string; contactQrZh: string };
  links: StudioPersonalLink[];
  announcements: StudioAnnouncement[];
  priceNotice: { title: string; body: string; version: number };
  timeZones: string[];
  creditTerm: string;
}

export interface StudioPosterSummary {
  id: string;
  name: string;
  photos: number;
  ratio: string;
  /** Width over height, for the easel. */
  aspect: number;
  updated: string;
  /** The first photograph, small for the rail and larger for the easel; empty without one. */
  thumb: string;
  cover: string;
}

/** The photographer's saved Sharepost posters, newest change first. */
export interface StudioPosters {
  account: StudioAccount;
  posters: StudioPosterSummary[];
  /** More than the rail carries; the rest are on the classic page. */
  more: boolean;
}

/** What a new account's first-run setup starts from. */
export interface StudioSetup {
  username: string;
  /** Accounts made outside an invite still have the placeholder login to replace. */
  needsCredentials: boolean;
  siteTitleEn: string;
  siteTitleZh: string;
  homeTitleEn: string;
  homeTitleZh: string;
  homeSubtitleEn: string;
  homeSubtitleZh: string;
  bookingEnabled: boolean;
  lotteryEnabled: boolean;
  creditProfilesEnabled: boolean;
  creditTerm: string;
}

/** The photographer's own archive page: their numbers and what comes next, at a glance. */
export interface OwnerOverview {
  account: StudioAccount;
  /** Today on the photographer's clock, YYYY-MM-DD. */
  today: string;
  albums: number;
  drafts: number;
  photos: number;
  usedBytes: number;
  quotaBytes: number;
  /** Confirmed bookings in slots that haven't started yet. */
  sessions: number;
  /** Bookings made in the last seven days. */
  newBookings: number;
  next: OverviewEvent | null;
  /** The soonest booked session. */
  shoot: OverviewShoot | null;
}

export interface OverviewEvent {
  title: string;
  dates: string;
  location: string;
  /** The first day, YYYY-MM-DD. */
  day: string;
  cover: string;
  /** Its album in the Dashboard, when it has one. */
  eventId: string | null;
  /** Its booking event, when it takes bookings. */
  bookingId: string | null;
  booked: number;
  capacity: number;
  /** Gear on its packing lists. */
  packing: number;
}

export interface OverviewShoot {
  /** YYYY-MM-DD and HH:mm on the photographer's clock. */
  day: string;
  time: string;
  name: string;
  subject: string;
  event: string;
  bookingId: string;
}
