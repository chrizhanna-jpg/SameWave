/**
 * Shapes shared by the core logic, the backend and the screens.
 * Nothing in core/ imports React, React Native or Expo.
 */

/** One photo in a Wave. */
export interface WaveSide {
  photoId: string;
  /** Something an image view can show, or null while it is still loading. */
  uri: string | null;
  countryCode: string | null;
  /** When the photo was taken, falling back to when it was sent. ISO string. */
  takenAt: string | null;
}

/** Two photos that found each other. */
export interface Wave {
  id: string;
  /** When the match became mutual. ISO string. */
  formedAt: string | null;
  mine: WaveSide;
  theirs: WaveSide;
}

/** A photo the user has sent. Kept on the device as the account's history. */
export interface Ripple {
  photoId: string;
  sentAt: string;
  /** Local copy of the photo, when one exists on this device. */
  localUri: string | null;
  countryCode: string | null;
  vibe: string | null;
  hasRecording: boolean;
  /** What the server saw in the photo. Used to look for matches. */
  theme: string;
  tags: string[];
  subjects: string[];
  reach: ReachProgress;
}

export interface ReachProgress {
  /** How many times the app has looked for a match for this Ripple. */
  passes: number;
  lastPassAt: string | null;
  /** Photos this Ripple has already been offered to. */
  offeredIds: string[];
}

/** A photo that could match a Ripple. */
export interface Candidate {
  id: string;
  /** Server similarity score. Higher is closer. */
  score: number;
  uri: string;
  createdAt: string | null;
}

/** Someone else's Ripple reached one of the user's photos. */
export interface Offer {
  id: string;
  myPhotoId: string;
  theirPhotoId: string;
  createdAt: string | null;
}
