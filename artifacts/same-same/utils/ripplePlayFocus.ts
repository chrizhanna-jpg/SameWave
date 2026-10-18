export type RipplePlayKind = "challenge" | "interests";

/** What the Home theme / interests Play buttons asked the Ripple tab to show. */
export type RipplePlayFocus = {
  kind: RipplePlayKind;
  /** Challenge title, or the theme the user actually posted. */
  title?: string;
  emoji?: string;
  /** Interest tag ids from the user's vibe or the interests post. */
  tags?: string[];
};

export type RipplePlayPresentation =
  | { kind: "challenge"; title: string; emoji: string }
  | { kind: "interests"; tags: string[] };

type Listener = (focus: RipplePlayFocus | null) => void;

let current: RipplePlayFocus | null = null;
const listeners = new Set<Listener>();

export function getRipplePlayFocus(): RipplePlayFocus | null {
  return current;
}

export function setRipplePlayFocus(next: RipplePlayFocus | null): void {
  current = next;
  for (const listener of listeners) listener(current);
}

export function subscribeRipplePlayFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only. Session focus is in-memory and must not leak between cases. */
export function resetRipplePlayFocusForTests(): void {
  current = null;
  listeners.clear();
}

export function parseRipplePlayKind(
  raw: string | string[] | undefined | null,
): RipplePlayKind | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "challenge" || v === "interests") return v;
  return null;
}

function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const tag of tags) {
    const id = tag.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Banner for the Ripple tab. Challenge shows the pressed theme. Interests
 * prefer the tags captured with the play, then a passions photo, then the
 * live vibe — an empty list stays hidden so the tab does not invent a prompt.
 */
export function resolveRipplePlayPresentation(input: {
  focus: RipplePlayFocus | null;
  myVibe: string[];
  photoTheme?: string;
  photoTags?: string[];
}): RipplePlayPresentation | null {
  const { focus } = input;
  if (!focus) return null;
  if (focus.kind === "challenge") {
    const title = (focus.title ?? "").trim();
    if (!title) return null;
    const emoji = (focus.emoji ?? "").trim() || "✨";
    return { kind: "challenge", title, emoji };
  }
  const fromFocus = cleanTags(focus.tags);
  if (fromFocus.length > 0) return { kind: "interests", tags: fromFocus };
  const photoTheme = (input.photoTheme ?? "").trim().toLowerCase();
  const photoTags = cleanTags(input.photoTags);
  if (photoTheme === "passions" && photoTags.length > 0) {
    return { kind: "interests", tags: photoTags };
  }
  const vibe = cleanTags(input.myVibe);
  if (vibe.length > 0) return { kind: "interests", tags: vibe };
  return null;
}
