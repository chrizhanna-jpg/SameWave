/**
 * Feelings that can travel with a Ripple. The ids are the set the server
 * accepts for a photo; anything else is dropped on upload.
 *
 * Clips are Kevin MacLeod tracks from incompetech.com, licensed CC BY 4.0.
 * The credit is shown on the Account screen.
 */

export interface Vibe {
  id: string;
  label: string;
  /** File names under CLIP_BASE. */
  clips: readonly string[];
}

export const CLIP_BASE =
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

export const VIBES: readonly Vibe[] = [
  {
    id: "joy",
    label: "Joy",
    clips: [
      "Carefree.mp3",
      "Cheery%20Monday.mp3",
      "Happy%20Boy%20End%20Theme.mp3",
      "Life%20of%20Riley.mp3",
    ],
  },
  {
    id: "overjoyed",
    label: "Overjoyed",
    clips: [
      "Aretes.mp3",
      "Beach%20Party.mp3",
      "Monkeys%20Spinning%20Monkeys.mp3",
      "Lobby%20Time.mp3",
    ],
  },
  {
    id: "elated",
    label: "Elated",
    clips: [
      "Hero%20Down.mp3",
      "Fanfare%20for%20Space.mp3",
      "On%20My%20Way.mp3",
      "Take%20a%20Chance.mp3",
    ],
  },
  {
    id: "amusement",
    label: "Amused",
    clips: [
      "Sneaky%20Snitch.mp3",
      "Fluffing%20a%20Duck.mp3",
      "Monkeys%20Spinning%20Monkeys.mp3",
      "Investigations.mp3",
    ],
  },
  {
    id: "cheers",
    label: "Cheers",
    clips: [
      "Hep%20Cats.mp3",
      "Beach%20Party.mp3",
      "Life%20of%20Riley.mp3",
      "Easy%20Lemon.mp3",
    ],
  },
  {
    id: "yum",
    label: "Yum",
    clips: [
      "Happy%20Boy%20End%20Theme.mp3",
      "Easy%20Lemon.mp3",
      "Life%20of%20Riley.mp3",
      "Cheery%20Monday.mp3",
    ],
  },
  {
    id: "love",
    label: "Love",
    clips: [
      "Easy%20Lemon.mp3",
      "Constance.mp3",
      "Healing.mp3",
      "Dreamer.mp3",
    ],
  },
  {
    id: "caring",
    label: "Caring",
    clips: [
      "Healing.mp3",
      "Constance.mp3",
      "Brittle%20Rille.mp3",
      "Local%20Forecast.mp3",
    ],
  },
  {
    id: "romance",
    label: "Romance",
    clips: [
      "Brittle%20Rille.mp3",
      "Dreamer.mp3",
      "Constance.mp3",
      "Pamgaea.mp3",
    ],
  },
  {
    id: "gratitude",
    label: "Grateful",
    clips: [
      "Healing.mp3",
      "Constance.mp3",
      "Dreamer.mp3",
      "Pamgaea.mp3",
    ],
  },
  {
    id: "pride",
    label: "Proud",
    clips: [
      "Achilles.mp3",
      "Ouroboros.mp3",
      "Inspired.mp3",
      "Voltaic.mp3",
    ],
  },
  {
    id: "hope",
    label: "Hope",
    clips: [
      "Spring%20Thaw.mp3",
      "On%20My%20Way.mp3",
      "Local%20Forecast.mp3",
      "Inspired.mp3",
    ],
  },
  {
    id: "wonder",
    label: "Wonder",
    clips: [
      "Meditation%20Impromptu%2003.mp3",
      "Healing.mp3",
      "Pamgaea.mp3",
      "Dreamer.mp3",
    ],
  },
  {
    id: "fascinated",
    label: "Fascinated",
    clips: [
      "Investigations.mp3",
      "Sneaky%20Snitch.mp3",
      "Marty%20Gots%20a%20Plan.mp3",
      "Hep%20Cats.mp3",
    ],
  },
  {
    id: "calm",
    label: "Calm",
    clips: [
      "Meditation%20Impromptu%2003.mp3",
      "Local%20Forecast.mp3",
      "Pamgaea.mp3",
      "Healing.mp3",
    ],
  },
  {
    id: "content",
    label: "Content",
    clips: [
      "Easy%20Lemon.mp3",
      "Wallpaper.mp3",
      "Brittle%20Rille.mp3",
      "Spring%20Thaw.mp3",
    ],
  },
  {
    id: "chilling",
    label: "Chilling",
    clips: [
      "Achaidh%20Cheide.mp3",
      "Wallpaper.mp3",
      "Easy%20Lemon.mp3",
      "Dreamer.mp3",
    ],
  },
  {
    id: "relaxed",
    label: "Relaxed",
    clips: [
      "Meditation%20Impromptu%2003.mp3",
      "Local%20Forecast.mp3",
      "Healing.mp3",
      "Pamgaea.mp3",
    ],
  },
  {
    id: "tired",
    label: "Tired",
    clips: [
      "Dreamer.mp3",
      "Achaidh%20Cheide.mp3",
      "Meditation%20Impromptu%2003.mp3",
      "Long%20Note%20One.mp3",
    ],
  },
  {
    id: "nostalgia",
    label: "Nostalgic",
    clips: [
      "Heartbreaking.mp3",
      "Long%20Note%20Two.mp3",
      "Dreamer.mp3",
      "Constance.mp3",
    ],
  },
  {
    id: "longing",
    label: "Longing",
    clips: [
      "Heartbreaking.mp3",
      "Long%20Note%20One.mp3",
      "Long%20Note%20Two.mp3",
      "Lightless%20Dawn.mp3",
    ],
  },
  {
    id: "sad",
    label: "Sad",
    clips: [
      "Sad%20Trio.mp3",
      "Heartbreaking.mp3",
      "Long%20Note%20One.mp3",
      "Long%20Note%20Two.mp3",
    ],
  },
  {
    id: "heartbroken",
    label: "Heartbroken",
    clips: [
      "Long%20Note%20Four.mp3",
      "The%20Cannery.mp3",
      "Heartbreaking.mp3",
      "Sad%20Trio.mp3",
    ],
  },
  {
    id: "lonely",
    label: "Lonely",
    clips: [
      "Long%20Note%20Three.mp3",
      "Long%20Note%20Four.mp3",
      "Heartbreaking.mp3",
      "The%20Cannery.mp3",
    ],
  },
  {
    id: "grief",
    label: "Grief",
    clips: [
      "Long%20Note%20One.mp3",
      "Long%20Note%20Three.mp3",
      "Long%20Note%20Four.mp3",
      "The%20Cannery.mp3",
    ],
  },
  {
    id: "fear",
    label: "Fear",
    clips: [
      "Lightless%20Dawn.mp3",
      "Ossuary%201%20-%20A%20Beginning.mp3",
      "Cipher2.mp3",
      "Industrial%20Music%20Box.mp3",
    ],
  },
  {
    id: "scared",
    label: "Scared",
    clips: [
      "Ossuary%201%20-%20A%20Beginning.mp3",
      "Lightless%20Dawn.mp3",
      "Cipher2.mp3",
      "Industrial%20Music%20Box.mp3",
    ],
  },
  {
    id: "afraid",
    label: "Afraid",
    clips: [
      "Lightless%20Dawn.mp3",
      "Long%20Note%20Four.mp3",
      "Ossuary%201%20-%20A%20Beginning.mp3",
      "Cipher2.mp3",
    ],
  },
  {
    id: "anger",
    label: "Anger",
    clips: [
      "Cyborg%20Ninja.mp3",
      "Voltaic.mp3",
      "Bushwick%20Tarantella.mp3",
      "Industrial%20Music%20Box.mp3",
    ],
  },
  {
    id: "stress",
    label: "Stress",
    clips: [
      "Bushwick%20Tarantella.mp3",
      "Industrial%20Music%20Box.mp3",
      "Cipher2.mp3",
      "Cyborg%20Ninja.mp3",
    ],
  },
  {
    id: "passion",
    label: "Passion",
    clips: [
      "Cyborg%20Ninja.mp3",
      "Adventure%20Meme.mp3",
      "Rynos%20Theme.mp3",
      "Voltaic.mp3",
    ],
  },
];

/** The short list offered when sending. Every id in VIBES still plays. */
export const PICKER_VIBE_IDS: readonly string[] = [
  "joy",
  "love",
  "calm",
  "wonder",
  "hope",
  "gratitude",
  "content",
  "nostalgia",
  "cheers",
  "pride",
  "tired",
  "sad",
];

export const MUSIC_CREDIT = "Music by Kevin MacLeod (incompetech.com), CC BY 4.0";
