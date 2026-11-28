import { Image, type ImageSource } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { Frost } from "@/components/Frost";
import { Photo } from "@/components/Photo";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import {
  inboxOfferMyThumbSource,
  inboxOfferTheirThumbSource,
  withOptionalSampleOffers,
} from "@/core/sampleOffers";
import {
  peekSamplePhotosToggle,
  readSamplePhotosToggle,
  subscribeSamplePhotosToggle,
  testPhotosBuildEnabled,
  withOptionalSampleWaves,
} from "@/core/testPhotos";
import type { Offer, Wave } from "@/core/types";
import { uiShotsBuildEnabled } from "@/core/uiShots";
import { findWaveByPhotos } from "@/core/waves";
import { waveListPlace, waveListWhen } from "@/core/waveListMeta";
import { emotionFor } from "@/data/emotions";
import { topicFor } from "@/data/topics";
import { useAppState } from "@/state/AppState";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, space } from "@/theme";

const PAIR_THUMB = 72;
/** Cap first-section list so "Waves caught" stays on-screen on small phones. */
const MAKE_WAVE_LIST_MAX = 168;
const UI_SHOT_MAKE_WAVE_PAD = 20;

/**
 * Waves tab: "Make a wave" (pending inbound moments) and "Waves caught" (mutual
 * moments where they matched back). Same moment-card chrome in both sections.
 * Pending tap → Match (Offer a Wave / Pass); mutual tap → WaveJoin SoftIconDisc X.
 *
 * First section scrolls inside a height cap so both headings stay visible without
 * scrolling past a long Make-a-wave list (320/360dp).
 */
/** UI-shot pad so heading-cap layout can be verified with 20+ first-section rows. */
function padOffersForUiShot(items: Offer[]): Offer[] {
  if (!uiShotsBuildEnabled() || items.length === 0 || items.length >= UI_SHOT_MAKE_WAVE_PAD) {
    return items;
  }
  const out: Offer[] = [];
  for (let i = 0; i < UI_SHOT_MAKE_WAVE_PAD; i += 1) {
    const src = items[i % items.length]!;
    out.push({ ...src, id: `${src.id}__pad${i}` });
  }
  return out;
}

export default function WavesScreen() {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  const { offers, offersKnown, waves, wavesKnown, sync, syncNow } = useAppState();
  const tabClearance = useTabBarClearance(space.md);
  const [useSampleData, setUseSampleData] = useState(
    () => testPhotosBuildEnabled() && peekSamplePhotosToggle() !== false,
  );

  useEffect(() => {
    if (!testPhotosBuildEnabled()) {
      setUseSampleData(false);
      return;
    }
    void readSamplePhotosToggle().then(setUseSampleData);
    return subscribeSamplePhotosToggle(setUseSampleData);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void syncNow({ force: true });
    }, [syncNow]),
  );

  /** Pending only — drop any offer that already has a mutual Wave. */
  const ripplesReceived = useMemo(() => {
    const pending = withOptionalSampleOffers(offers, { useSampleData }).filter(
      (offer) => !findWaveByPhotos(waves, offer.myPhotoId, offer.theirPhotoId),
    );
    return padOffersForUiShot(pending);
  }, [offers, waves, useSampleData]);

  /**
   * Mutual Waves. Live / locally matched-back list plus optional sample Waves
   * when Account → Sample data is on (preview builds only).
   */
  const mutualWaves = useMemo(() => {
    return withOptionalSampleWaves(waves, { useSamplePhotos: useSampleData });
  }, [waves, useSampleData]);

  const loadingRipples = !offersKnown && sync === "syncing";
  const loadingWaves = !wavesKnown && sync === "syncing";

  /**
   * Height cap for Make-a-wave cards — leaves room for both section headings
   * on ~320–360dp phones without scrolling the page past the first list.
   */
  const makeWaveListMax = Math.max(
    120,
    Math.min(MAKE_WAVE_LIST_MAX, Math.round(winH * 0.26)),
  );

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

  const makeWaveCount = ripplesReceived.length;
  const wavesCaughtCount = mutualWaves.length;
  const makeWaveTitle = `Make a wave (${makeWaveCount})`;
  const wavesCaughtTitle = `Waves caught (${wavesCaughtCount})`;

  return (
    <Screen
      scene="none"
      mark="wave"
      reserveBottom={tabClearance}
      style={styles.screen}
    >
      {/* Frosted title — keeps AA on the calm canvas watermark. */}
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

      <View style={styles.sectionBlock} accessibilityLabel={makeWaveTitle}>
        <Frost
          kind="card"
          intensity={68}
          style={styles.sectionFrost}
          contentStyle={[styles.sectionPad, styles.readableFill]}
        >
          <Txt
            variant="heading"
            style={[styles.sectionTitle, styles.ripplesHeading]}
            accessibilityLabel={makeWaveTitle}
          >
            {makeWaveTitle}
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
              Nothing to make a wave yet
            </Txt>
            <Txt variant="quiet" tone="primary" center style={styles.emptyBody}>
              When someone matches their moment to one of yours, it lands here.
            </Txt>
          </Frost>
        ) : (
          <ScrollView
            style={[styles.makeWaveList, { maxHeight: makeWaveListMax }]}
            contentContainerStyle={styles.makeWaveListContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            accessibilityLabel="Make a wave list"
          >
            {ripplesReceived.map((offer) => {
              const mySource = inboxOfferMyThumbSource(offer);
              const theirSource = inboxOfferTheirThumbSource(offer);
              const myUri =
                offer.myUri ??
                (mySource && typeof mySource === "object" && "uri" in mySource
                  ? (mySource.uri as string)
                  : null);
              const theirUri =
                offer.theirUri ??
                (theirSource && typeof theirSource === "object" && "uri" in theirSource
                  ? (theirSource.uri as string)
                  : null);
              return (
                <PairMomentCard
                  key={offer.id}
                  frame="Matched their moment to yours"
                  emotion={offer.theirEmotion}
                  topic={offer.theirTopic}
                  place={waveListPlace({ countryCode: offer.theirCountryCode })}
                  when={waveListWhen(offer.createdAt)}
                  mineUri={myUri}
                  minePhotoId={offer.myPhotoId}
                  mineBundled={!myUri ? mySource : null}
                  theirUri={theirUri}
                  theirPhotoId={offer.theirPhotoId}
                  theirBundled={!theirUri ? theirSource : null}
                  onOpen={() => openOffer(offer)}
                />
              );
            })}
          </ScrollView>
        )}
      </View>

      <View accessibilityRole="none" style={styles.dividerFrost}>
        <Frost kind="card" intensity={48} contentStyle={styles.dividerPad}>
          <View style={styles.divider} />
        </Frost>
      </View>

      <View style={styles.caughtBlock} accessibilityLabel={wavesCaughtTitle}>
        <Frost
          kind="card"
          intensity={68}
          style={styles.sectionFrost}
          contentStyle={[styles.sectionPad, styles.readableFill]}
        >
          <Txt
            variant="heading"
            style={[styles.sectionTitle, styles.wavesHeading]}
            accessibilityLabel={wavesCaughtTitle}
          >
            {wavesCaughtTitle}
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
              No Waves caught yet
            </Txt>
            <Txt variant="quiet" tone="primary" center style={styles.emptyBody}>
              When someone matches back, their moment stays here. The map of
              where they happened is on the Map tab.
            </Txt>
          </Frost>
        ) : (
          <ScrollView
            style={styles.caughtList}
            contentContainerStyle={styles.caughtListContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            accessibilityLabel="Waves caught list"
          >
            {mutualWaves.map((wave) => (
              <PairMomentCard
                key={wave.id}
                frame="They matched back"
                emotion={wave.theirs.emotion}
                topic={wave.theirs.theme}
                place={waveListPlace({
                  countryCode: wave.theirs.countryCode,
                  countrySource: wave.theirs.countrySource,
                })}
                when={waveListWhen(wave.theirs.takenAt ?? wave.formedAt)}
                mineUri={wave.mine.uri}
                minePhotoId={wave.mine.photoId}
                mineBundled={null}
                theirUri={wave.theirs.uri}
                theirPhotoId={wave.theirs.photoId}
                theirBundled={null}
                onOpen={() => openWave(wave)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

function PairThumb({
  uri,
  photoId,
  bundled,
  label,
}: {
  uri: string | null | undefined;
  photoId: string;
  bundled: ImageSource | null;
  label: string;
}) {
  if (bundled) {
    return (
      <Image
        source={bundled}
        style={styles.momentThumb}
        contentFit="cover"
        accessibilityLabel={label}
      />
    );
  }
  return (
    <Photo
      uri={uri ?? null}
      ownPhotoId={uri ? undefined : photoId}
      quiet
      style={styles.momentThumb}
      accessibilityLabel={label}
    />
  );
}

/**
 * Matched pair card — yours + theirs side by side, plus feeling/topic/place/time.
 * Shared by Make a wave and Waves caught; only the frame copy differs.
 */
function PairMomentCard({
  frame,
  emotion,
  topic,
  place,
  when,
  mineUri,
  minePhotoId,
  mineBundled,
  theirUri,
  theirPhotoId,
  theirBundled,
  onOpen,
}: {
  frame: string;
  emotion: string | null | undefined;
  topic: string | null | undefined;
  place: string | null;
  when: string | null;
  mineUri: string | null | undefined;
  minePhotoId: string;
  mineBundled: ImageSource | null;
  theirUri: string | null | undefined;
  theirPhotoId: string;
  theirBundled: ImageSource | null;
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
          <View style={styles.pairThumbs} accessibilityLabel="Matched photo pair">
            <PairThumb
              uri={mineUri}
              photoId={minePhotoId}
              bundled={mineBundled}
              label="Your photo"
            />
            <PairThumb
              uri={theirUri}
              photoId={theirPhotoId}
              bundled={theirBundled}
              label="Their photo"
            />
          </View>
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
  screen: { flex: 1, justifyContent: "flex-start" },
  headingFrost: { marginBottom: space.sm, alignSelf: "stretch", flexShrink: 0 },
  headingPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sectionBlock: { marginBottom: space.sm, flexShrink: 0 },
  /** Waves caught fills remaining height; its list scrolls independently. */
  caughtBlock: { flex: 1, minHeight: 0, marginBottom: space.sm },
  sectionFrost: { marginBottom: space.sm, alignSelf: "stretch", flexShrink: 0 },
  sectionPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  sectionTitle: { marginBottom: 0 },
  ripplesHeading: { color: colors.rippleHeading },
  wavesHeading: { color: colors.waveHeading },
  makeWaveList: { alignSelf: "stretch" },
  makeWaveListContent: { paddingBottom: space.xs },
  caughtList: { flex: 1, alignSelf: "stretch" },
  caughtListContent: { paddingBottom: space.md },
  dividerFrost: {
    marginVertical: space.sm,
    alignSelf: "stretch",
    flexShrink: 0,
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
   * Opaque theme mist under copy so slate ink clears WCAG AA on the calm canvas.
   */
  readableFill: {
    backgroundColor: colors.background,
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
  pairThumbs: { flexDirection: "row", gap: 6 },
  momentMeta: { flex: 1, gap: space.xs, minWidth: 0 },
  momentThumb: {
    width: PAIR_THUMB,
    height: PAIR_THUMB,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  hit: { alignSelf: "stretch" },
});
