import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Frost } from "@/components/Frost";
import { Photo } from "@/components/Photo";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import {
  inboxOfferTheirThumbSource,
  isPreviewOfferId,
  PREVIEW_OFFER_WAVE_ID,
  withOptionalSampleOffers,
} from "@/core/sampleOffers";
import { testPhotosBuildEnabled } from "@/core/testPhotos";
import type { Offer, Wave } from "@/core/types";
import { findWaveByPhotos } from "@/core/waves";
import { waveListPlace, waveListWhen } from "@/core/waveListMeta";
import { emotionFor } from "@/data/emotions";
import { topicFor } from "@/data/topics";
import { sceneFor } from "@/data/scenes";
import { useAppState } from "@/state/AppState";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, space } from "@/theme";

/**
 * Waves tab: "Ripples received" (pending inbound offers) and "Waves" (mutual).
 * Tap a card for full-screen WaveJoin; SoftIconDisc X returns here.
 * Map of past Waves lives on the Map tab.
 */
export default function WavesScreen() {
  const router = useRouter();
  const { offers, offersKnown, waves, wavesKnown, sync, syncNow } = useAppState();
  const tabClearance = useTabBarClearance(space.md);

  useFocusEffect(
    useCallback(() => {
      void syncNow({ force: true });
    }, [syncNow]),
  );

  /** Pending only — drop any offer that already has a mutual Wave. */
  const ripplesReceived = useMemo(() => {
    return withOptionalSampleOffers(offers).filter(
      (offer) => !findWaveByPhotos(waves, offer.myPhotoId, offer.theirPhotoId),
    );
  }, [offers, waves]);

  const mutualWaves = useMemo(() => waves, [waves]);
  const loadingRipples = !offersKnown && sync === "syncing";
  const loadingWaves = !wavesKnown && sync === "syncing";

  const openWave = (wave: Wave) => {
    router.push({ pathname: "/wave/[id]", params: { id: wave.id } });
  };

  /**
   * Ripple card tap → full-screen WaveJoin.
   * Mutual pair → /wave/[id]. Preview → sample Wave. Pending live → Match
   * (Offer a Wave / Pass already answer; SoftIconDisc X returns here).
   */
  const openOffer = (offer: Offer) => {
    const mutual = findWaveByPhotos(waves, offer.myPhotoId, offer.theirPhotoId);
    if (mutual) {
      openWave(mutual);
      return;
    }
    if (isPreviewOfferId(offer.id) && testPhotosBuildEnabled()) {
      router.push({ pathname: "/wave/[id]", params: { id: PREVIEW_OFFER_WAVE_ID } });
      return;
    }
    router.push({
      pathname: "/match",
      params: { photoId: offer.myPhotoId, from: "waves" },
    });
  };

  return (
    <Screen
      scene={sceneFor.home}
      scroll
      reserveBottom={tabClearance}
      style={styles.screen}
    >
      <Txt variant="title" style={styles.heading} accessibilityLabel="Waves">
        Waves
      </Txt>

      <View style={styles.sectionBlock} accessibilityLabel="Ripples received">
        <Txt variant="heading" style={styles.sectionTitle}>
          Ripples received
        </Txt>
        <Txt variant="quiet" tone="quiet" style={styles.sectionHint}>
          Moments people matched to yours. Tap to open.
        </Txt>

        {loadingRipples ? (
          <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
            <ActivityIndicator color={colors.waterMid} />
            <Txt tone="secondary" center style={styles.emptyBody}>
              Checking for moments…
            </Txt>
          </Frost>
        ) : ripplesReceived.length === 0 ? (
          <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
            <Txt tone="secondary" center>
              No Ripples received
            </Txt>
            <Txt variant="quiet" tone="quiet" center style={styles.emptyBody}>
              When someone matches their moment to one of yours, it lands here.
            </Txt>
          </Frost>
        ) : (
          ripplesReceived.map((offer) => (
            <MomentRow key={offer.id} offer={offer} onOpen={() => openOffer(offer)} />
          ))
        )}
      </View>

      <View style={styles.divider} accessibilityRole="none" />

      <View style={styles.sectionBlock} accessibilityLabel="Waves section">
        <Txt variant="heading" style={styles.sectionTitle}>
          Waves
        </Txt>
        <Txt variant="quiet" tone="quiet" style={styles.sectionHint}>
          Mutual matches. Tap to open.
        </Txt>

        {loadingWaves ? (
          <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
            <ActivityIndicator color={colors.waterMid} />
          </Frost>
        ) : mutualWaves.length === 0 ? (
          <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
            <Txt tone="secondary" center>
              No Waves yet
            </Txt>
            <Txt variant="quiet" tone="quiet" center style={styles.emptyBody}>
              When a Ripple becomes mutual, it stays here. The map of where they
              happened is on the Map tab.
            </Txt>
          </Frost>
        ) : (
          mutualWaves.map((wave) => (
            <Pressable
              key={wave.id}
              onPress={() => openWave(wave)}
              accessibilityRole="button"
              accessibilityLabel="Open Wave"
              style={styles.historyHit}
            >
              <Frost kind="card" style={styles.card} contentStyle={styles.historyPad}>
                <View style={styles.historyRow}>
                  <View style={styles.pair}>
                    {wave.mine.uri ? (
                      <Image
                        source={{ uri: wave.mine.uri }}
                        style={styles.thumb}
                        contentFit="cover"
                        accessibilityLabel="Your photo"
                      />
                    ) : (
                      <View
                        style={[styles.thumb, styles.thumbEmpty]}
                        accessibilityLabel="Your photo"
                      />
                    )}
                    {wave.theirs.uri ? (
                      <Image
                        source={{ uri: wave.theirs.uri }}
                        style={styles.thumb}
                        contentFit="cover"
                        accessibilityLabel="Their photo"
                      />
                    ) : (
                      <View
                        style={[styles.thumb, styles.thumbEmpty]}
                        accessibilityLabel="Their photo"
                      />
                    )}
                  </View>
                  <View style={styles.historyMeta}>
                    <Txt numberOfLines={1}>
                      {waveListPlace({
                        countryCode: wave.theirs.countryCode,
                        countrySource: wave.theirs.countrySource,
                      })}
                    </Txt>
                    <Txt variant="quiet" tone="quiet" numberOfLines={1}>
                      {waveListWhen(wave.formedAt) ?? "Wave"}
                    </Txt>
                  </View>
                </View>
              </Frost>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

/**
 * Their moment (photo + feeling/topic/place/time), framed as a match to yours.
 * Not a dual-thumb photo strip — only the other person's moment.
 */
function MomentRow({ offer, onOpen }: { offer: Offer; onOpen: () => void }) {
  const feeling = emotionFor(offer.theirEmotion)?.label ?? null;
  const topic = topicFor(offer.theirTopic)?.label ?? offer.theirTopic;
  const place = waveListPlace({ countryCode: offer.theirCountryCode });
  const when = waveListWhen(offer.createdAt);

  const theirSource = inboxOfferTheirThumbSource(offer);
  const theirUri =
    theirSource && typeof theirSource === "object" && "uri" in theirSource
      ? (theirSource.uri as string)
      : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open their moment"
      accessibilityHint="Opens the full-screen Wave layout"
      style={styles.historyHit}
    >
      <Frost kind="card" style={styles.card} contentStyle={styles.momentPad}>
        <View style={styles.momentRow}>
          {theirSource && !theirUri ? (
            <Image
              source={theirSource}
              style={styles.momentThumb}
              contentFit="cover"
              accessibilityLabel="Their moment"
            />
          ) : (
            <Photo
              uri={theirUri}
              ownPhotoId={theirUri ? undefined : offer.theirPhotoId}
              quiet
              style={styles.momentThumb}
              accessibilityLabel="Their moment"
            />
          )}
          <View style={styles.momentMeta}>
            <Txt variant="quiet" tone="moon" numberOfLines={1}>
              Matched their moment to yours
            </Txt>
            <PhotoMetaChip emotion={offer.theirEmotion} topic={offer.theirTopic} />
            {!feeling && !topic ? (
              <Txt variant="quiet" tone="quiet">
                Their moment
              </Txt>
            ) : null}
            <Txt variant="quiet" tone="secondary" numberOfLines={1}>
              {[place, when].filter(Boolean).join(" · ")}
            </Txt>
          </View>
        </View>
      </Frost>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: "flex-start" },
  heading: { marginBottom: space.md },
  sectionBlock: { marginBottom: space.sm },
  sectionTitle: { marginBottom: space.xs },
  sectionHint: { marginBottom: space.md },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: space.lg,
    alignSelf: "stretch",
  },
  card: { marginBottom: space.md },
  emptyPad: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
    alignItems: "center",
  },
  emptyBody: { maxWidth: 300 },
  momentPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  momentRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  momentMeta: { flex: 1, gap: space.xs, minWidth: 0 },
  /** Single moment photo — larger than a dual-thumb strip. */
  momentThumb: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  pair: { flexDirection: "row", gap: space.xs },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  historyHit: { alignSelf: "stretch" },
  historyPad: { paddingHorizontal: space.md, paddingVertical: space.md },
  historyRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  historyMeta: { flex: 1, minWidth: 0, gap: space.xs },
});
