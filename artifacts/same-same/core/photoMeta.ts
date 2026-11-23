import { emotionFor } from "../data/emotions";
import { topicFor } from "../data/topics";

/** Calm feeling · topic copy — never includes place. */
export function photoMetaChipText(opts: {
  emotion?: string | null;
  topic?: string | null;
  label?: string | null;
}): string | null {
  const feeling = emotionFor(opts.emotion)?.label ?? null;
  const topicLabel = topicFor(opts.topic)?.label ?? null;
  const parts = [opts.label, feeling, topicLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
