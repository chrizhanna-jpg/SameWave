import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Txt } from "@/components/Txt";
import { clipUrlFor, vibeFor } from "@/core/vibes";
import { VIBES, type Vibe } from "@/data/vibes";
import { playClip, stopClip } from "@/device/sound";
import { colors, radius, space, type } from "@/theme";

interface Props {
  value: string | null;
  onChange: (vibeId: string) => void;
  /** Stable seed so the preview clip matches Wave playback for this photo. */
  previewSeed: string;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
}

function filterVibes(query: string): Vibe[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...VIBES];
  return VIBES.filter((vibe) => {
    const label = vibe.label.toLowerCase();
    const id = vibe.id.toLowerCase();
    if (label.startsWith(q) || label.includes(q) || id.startsWith(q) || id.includes(q)) return true;
    return vibe.clips.some((clip) => decodeURIComponent(clip).toLowerCase().includes(q));
  });
}

function trackTitle(vibe: Vibe, seed: string): string {
  const url = clipUrlFor(vibe.id, seed);
  if (!url) return vibe.label;
  const file = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.mp3$/i, "");
  return file || vibe.label;
}

/**
 * Library song picker. Search shortens the mood list live; empty search
 * shows the full scrollable library. The chosen mood's clip plays on tap.
 */
export function SongPicker({ value, onChange, previewSeed, onSearchFocusChange }: Props) {
  const selected = vibeFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const matches = useMemo(() => filterVibes(query), [query]);

  const preview = async (vibeId: string) => {
    const url = clipUrlFor(vibeId, previewSeed);
    if (!url) return;
    setPlayingId(vibeId);
    await playClip(url, () => setPlayingId((current) => (current === vibeId ? null : current)));
  };

  if (selected && !open) {
    return (
      <View style={styles.chosenWrap}>
        <Pressable
          onPress={() => {
            setOpen(true);
            setQuery("");
          }}
          accessibilityRole="button"
          accessibilityLabel={`Song ${selected.label}. Tap to change.`}
          style={styles.chosen}
        >
          <View style={styles.chosenText}>
            <Txt>{selected.label}</Txt>
            <Txt variant="quiet" tone="secondary">
              {trackTitle(selected, previewSeed)}
            </Txt>
          </View>
          <Txt variant="quiet" tone="secondary">
            Change
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => {
            if (playingId === selected.id) {
              stopClip();
              setPlayingId(null);
            } else {
              void preview(selected.id);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={playingId === selected.id ? "Stop preview" : "Preview song"}
          style={styles.previewBtn}
        >
          <Txt variant="quiet">{playingId === selected.id ? "Stop" : "Preview"}</Txt>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search or browse"
        placeholderTextColor={colors.textQuiet}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.search}
        accessibilityLabel="Search songs"
        onFocus={() => onSearchFocusChange?.(true)}
        onBlur={() => onSearchFocusChange?.(false)}
      />
      <View style={styles.list}>
        {matches.map((vibe) => {
          const on = vibe.id === value;
          return (
            <Pressable
              key={vibe.id}
              onPress={() => {
                onChange(vibe.id);
                setOpen(false);
                setQuery("");
                stopClip();
                setPlayingId(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${vibe.label}, ${trackTitle(vibe, previewSeed)}`}
              style={[styles.row, on && styles.rowOn]}
            >
              <View style={styles.rowText}>
                <Txt>{vibe.label}</Txt>
                <Txt variant="quiet" tone="secondary">
                  {trackTitle(vibe, previewSeed)}
                </Txt>
              </View>
            </Pressable>
          );
        })}
        {matches.length === 0 ? (
          <Txt tone="secondary" style={styles.empty}>
            No song matches that. Try another word.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  list: { marginTop: space.sm, gap: space.xs },
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.waterPale },
  rowText: { gap: 2 },
  chosenWrap: { gap: space.sm },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.waterPale,
    gap: space.md,
  },
  chosenText: { flex: 1, gap: 2 },
  previewBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  empty: { padding: space.md },
});
