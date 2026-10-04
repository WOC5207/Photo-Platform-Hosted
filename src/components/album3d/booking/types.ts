/** Booking and prize-draw data handed from the 3D site's server pages to its panels and scenes. */

/** One open booking event on a photographer's booking board. */
export interface BoardEvent {
  token: string;
  title: string;
  dates: string;
  location: string;
  description: string;
  /** Seats left across the event's upcoming slots. */
  remaining: number;
  /** Upcoming slots, full or not. */
  slots: number;
}

export interface BookingBoard {
  username: string;
  owner: string;
  events: BoardEvent[];
}

export interface ScheduleSlot {
  id: string;
  /** "HH:MM", the event's local time. */
  start: string;
  end: string;
  remaining: number;
  capacity: number;
  /** Display-only price text, empty when prices are hidden. */
  price: string;
  description: string;
}

export interface ScheduleDay {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  /** Short tab label, e.g. "Sat Jul 26". */
  label: string;
  slots: ScheduleSlot[];
}

/** One booking event's schedule board. */
export interface BookingSchedule {
  username: string;
  owner: string;
  token: string;
  title: string;
  dates: string;
  location: string;
  description: string;
  open: boolean;
  /** What a booking is for ("cosplay character", …), per the photographer's settings. */
  subjectTerm: string;
  days: ScheduleDay[];
  /** The event's prize draw, when one is running. */
  drawToken: string | null;
}

export interface DrawPrize {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  wonCount: number;
}

export interface DrawEntry {
  id: string;
  token: string;
  wonPrizeId: string | null;
}

/** A booking event's self-serve prize draw. */
export interface PrizeDraw {
  username: string;
  owner: string;
  token: string;
  title: string;
  dates: string;
  location: string;
  description: string;
  prizes: DrawPrize[];
  /** This browser's entry, if it has one. */
  entry: DrawEntry | null;
}
