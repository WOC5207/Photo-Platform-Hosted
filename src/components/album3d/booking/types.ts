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

/** A time the visitor can move their booking to, labelled as the classic edit form does. */
export interface MyBookingSlotOption {
  id: string;
  label: string;
}

/** A visitor's own booking, reached by its private cancel token (/my-booking/[token]). */
export interface MyBooking {
  username: string;
  owner: string;
  /** The cancel token: the booking's private address. */
  token: string;
  title: string;
  location: string;
  /** Short day label for the board's column, e.g. "Fri, Nov 13". */
  day: string;
  /** "HH:MM", the event's local time. */
  start: string;
  end: string;
  /** "yyyy-mm-dd HH:MM–HH:MM", as the classic page prints it. */
  range: string;
  slotDescription: string;
  /** Display-only price text, empty when prices are hidden or unset. */
  price: string;
  name: string;
  subject: string;
  /** What a booking is for ("cosplay character", …), per the photographer's settings. */
  subjectTerm: string;
  cancelled: boolean;
  /** The edit window; null once cancelled, when the classic page hides it. */
  edit: {
    /** The photographer lets visitors change their booking at all. */
    enabled: boolean;
    open: boolean;
    /** When changes close, in the event's local time (open windows only). */
    deadline: string;
    cutoffHours: number;
    currentSlotId: string;
    /** The booking's own slot and the open ones it can move to; empty while closed. */
    slots: MyBookingSlotOption[];
    /** The booking's private details, only while it can be edited. */
    initial: { name: string; subject: string; contactValue: string; email: string; notes: string } | null;
  } | null;
  /** The event's prize draw, when this booking can take part in it. */
  draw: { prizes: DrawPrize[] } | null;
  /** The prize this booking won, if any. */
  wonPrize: { id: string; name: string } | null;
}
