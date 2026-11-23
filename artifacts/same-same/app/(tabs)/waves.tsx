import { Image, type ImageSource } from "expo-image";
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
  withOptionalSampleOffers,
} from "@/core/sampleOffers";
import { loadSampleWaves, testPhotosBuildEnabled } from "@/core/testPhotos";
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
 * Waves tab: "Ripples received" (pending inbound moments) and "Waves" (mutual
 * moments where they matched back). Same moment-card chrome in both sections.
 * Pending tap → Match (Offer a Wave / Pass); mutual tap → WaveJoin SoftIconDisc X.
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

  /**
   * Mutual Waves. Live / matched-back list wins. Preview only seeds sample
   * Waves when there is no pending Ripple — so match-back is what fills this
   * section in the Expo Go E2E path.
   */
  const mutualWaves = useMemo(() => {
    if (waves.length > 0) return waves;
    if (!testPhotosBuildEnabled()) return [];
    if (ripplesReceived.length > 0) return [];
    return loadSampleWaves().slice(0, 2);
  }, [waves, ripplesReceived.length]);

  const loadingRipples = !offersKnown && sync === "syncing";
  const loadingWaves = !wavesKnown && sync === "syncing";

  const openWave = (wave: Wave) => {
    router.push({ pathname: "/wave/[id]", params: { id: wave.id } });
  };

  /**
   * Pending Ripple → Match (stage=wave) so Offer a Wave / Pass decide.
   * SoftIconDisc X returns here. Already-mutual → WaveJoin.
   * Decision stays off the card (Chris: keep inbox cards clean).
   */
  const openOffer = (offer: Offer) => {
    const mutual = findWaveByPhotos(waves, offer.myPhotoId, offer.theirPhotoId);
    if (mutual) {
      openWave(mutual);
      return;
    }
    router.push({
      pathname: "/match",
      params: {
        photoId: offer.myPhotoId,
        from: "waves",
        stage: "wave",
        offerId: offer.id,
      },
    });
  };

  return (
    <Screen
      scene={sceneFor.home}
      scroll
      reserveBottom={tabClearance}
      style={styles.screen}
    >
      {/* Frosted title — bare slate on the mountain scene fails AA. */}
      <Frost
        kind="card"
        intensity={68}
        style={styles.headingFrost}
        contentStyle={[styles.headingPad, styles.readableFill]}
      >
        <Txt variant="title" tone="primary" accessibilityLabel="Waves">
          Waves
        </Txt>
      </Frost>

      <View style={styles.sectionBlock} accessibilityLabel="Ripples received">
        <Frost
          kind="card"
          intensity={68}
          style={styles.sectionFrost}
          contentStyle={[styles.sectionPad, styles.readableFill]}
        >
          <Txt variant="heading" tone="primary" style={styles.sectionTitle}>
            Ripples received
          </Txt>
          <Txt variant="quiet" tone="primary">
            Moments people matched to yours. Tap to open.
          </Txt>
        </Frost>

        {loadingRipples ? (
          <Frost
            kind="card"
            intensity={72}
            style={styles.card}
            contentStyle={[styles.emptyPad, styles.readableFill]}
          >
            <ActivityIndicator color={colors.waterMid} />
            <Txt tone="secondary" center style={styles.emptyBody}>
              Checking for moments…
            </Txt>
          </Frost>
        ) : ripplesReceived.length === 0 ? (
          <Frost
            kind="card"
            intensity={72}
            style={styles.card}
            contentStyle={[styles.emptyPad, styles.readableFill]}
          >
            <Txt tone="primary" center>
              No Ripples received
            </Txt>
            <Txt variant="quiet" tone="primary" center style={styles.emptyBody}>
              When someone matches their moment to one of yours, it lands here.
            </Txt>
          </Frost>
        ) : (
          ripplesReceived.map((offer) => {
            const theirSource = inboxOfferTheirThumbSource(offer);
            const theirUri =
              theirSource && typeof theirSource === "object" && "uri" in theirSource
                ? (theirSource.uri as string)
                : null;
            return (
              <TheirMomentCard
                key={offer.id}
                frame="Matched their moment to yours"
                emotion={offer.theirEmotion}
                topic={offer.theirTopic}
                place={waveListPlace({ countryCode: offer.theirCountryCode })}
                when={waveListWhen(offer.createdAt)}
                theirUri={theirUri}
                theirPhotoId={offer.theirPhotoId}
                bundledSource={!theirUri ? theirSource : null}
                onOpen={() => openOffer(offer)}
              />
            );
          })
        )}
      </View>

      <View accessibilityRole="none" style={styles.dividerFrost}>
        <Frost kind="card" intensity={48} contentStyle={styles.dividerPad}>
          <View style={styles.divider} />
        </Frost>
      </View>

      <View style={styles.sectionBlock} accessibilityLabel="Waves section">
        <Frost
          kind="card"
          intensity={68}
          style={styles.sectionFrost}
          contentStyle={[styles.sectionPad, styles.readableFill]}
        >
          <Txt variant="heading" tone="primary" style={styles.sectionTitle}>
            Waves
          </Txt>
          <Txt variant="quiet" tone="primary">
            Moments where they matched back. Tap to open.
          </Txt>
        </Frost>

        {loadingWaves ? (
          <Frost
            kind="card"
            intensity={72}
            style={styles.card}
            contentStyle={[styles.emptyPad, styles.readableFill]}
          >
            <ActivityIndicator color={colors.waterMid} />
          </Frost>
        ) : mutualWaves.length === 0 ? (
          <Frost
            kind="card"
            intensity={72}
            style={styles.card}
            contentStyle={[styles.emptyPad, styles.readableFill]}
          >
            <Txt tone="primary" center>
              No Waves yet
            </Txt>
            <Txt variant="quiet" tone="primary" center style={styles.emptyBody}>
              When someone matches back, their moment stays here. The map of
              where they happened is on the Map tab.
            </Txt>
          </Frost>
        ) : (
          mutualWaves.map((wave) => (
            <TheirMomentCard
              key={wave.id}
              frame="They matched back"
              emotion={wave.theirs.emotion}
              topic={wave.theirs.theme}
              place={waveListPlace({
                countryCode: wave.theirs.countryCode,
                countrySource: wave.theirs.countrySource,
              })}
              when={waveListWhen(wave.theirs.takenAt ?? wave.formedAt)}
              theirUri={wave.theirs.uri}
              theirPhotoId={wave.theirs.photoId}
              bundledSource={null}
              onOpen={() => openWave(wave)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

/**
 * Other person's moment card — photo + feeling/topic/place/time.
 * Shared by Ripples received and Waves; only the frame copy differs.
 */
function TheirMomentCard({
  frame,
  emotion,
  topic,
  place,
  when,
  theirUri,
  theirPhotoId,
  bundledSource,
  onOpen,
}: {
  frame: string;
  emotion: string | null | undefined;
  topic: string | null | undefined;
  place: string | null;
  when: string | null;
  theirUri: string | null | undefined;
  theirPhotoId: string;
  bundledSource: ImageSource | null;
  onOpen: () => void;
}) {
  const feeling = emotionFor(emotion)?.label ?? null;
  const topicLabel = topicFor(topic)?.label ?? topic;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open their moment"
      accessibilityHint="Opens the full-screen Wave layout"
      style={styles.hit}
    >
      <Frost
        kind="card"
        intensity={72}
        style={styles.card}
        contentStyle={[styles.momentPad, styles.readableFill]}
      >
        <View style={styles.momentRow}>
          {bundledSource ? (
            <Image
              source={bundledSource}
              style={styles.momentThumb}
              contentFit="cover"
              accessibilityLabel="Their moment"
            />
          ) : (
            <Photo
              uri={theirUri ?? null}
              ownPhotoId={theirUri ? undefined : theirPhotoId}
              quiet
              style={styles.momentThumb}
              accessibilityLabel="Their moment"
            />
          )}
          <View style={styles.momentMeta}>
            {/* primary slate on dense frost — moon (#45B4FC) fails AA on surface. */}
            <Txt variant="quiet" tone="primary" numberOfLines={1}>
              {frame}
            </Txt>
            <PhotoMetaChip emotion={emotion} topic={topic} />
            {!feeling && !topicLabel ? (
              <Txt variant="quiet" tone="secondary">
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
  headingFrost: { marginBottom: space.md, alignSelf: "stretch" },
  headingPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sectionBlock: { marginBottom: space.sm },
  sectionFrost: { marginBottom: space.md, alignSelf: "stretch" },
  sectionPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  sectionTitle: { marginBottom: 0 },
  dividerFrost: {
    marginVertical: space.md,
    alignSelf: "stretch",
  },
  dividerPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    alignSelf: "stretch",
  },
  card: { marginBottom: space.md },
  /**
   * Near-opaque mist fill (theme background) so slate ink clears WCAG AA over
   * bright lake / rock while the scene still peeks at the card edges via Frost.
   */
  readableFill: {
    backgroundColor: "rgba(233, 246, 255, 0.97)",
  },
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
  momentThumb: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  hit: { alignSelf: "stretch" },
});
