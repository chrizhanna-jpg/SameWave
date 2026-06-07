import React from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { PressableScale } from "@/components/PressableScale";
import { Surface } from "@/components/Surface";
import {
  APP_NAME,
  accountDeletionMailtoUrl,
  accountDeletionPageUrl,
  STUDIO_LEGAL_SECTIONS,
  STUDIO_NAME,
  STUDIO_PUBLIC_POLICIES,
  SUPPORT_EMAIL,
  WAVE_BLUE,
} from "@/data/studioLegal";
import { getPublicApiOrigin } from "@/utils/publicEnv";

function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
}

function openEmail(subject: string) {
  const q = encodeURIComponent(subject);
  openExternal(`mailto:${SUPPORT_EMAIL}?subject=${q}`);
}

export default function StudioLegalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const apiOrigin = getPublicApiOrigin();

  const topPadding = Platform.OS === "web" ? 8 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Legal & policies
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {STUDIO_NAME} · {APP_NAME}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Surface
          elevation="sm"
          radius="lg"
          background={WAVE_BLUE + "18"}
          style={[styles.hero, { borderColor: WAVE_BLUE + "44" }]}
        >
          <View style={[styles.heroIcon, { backgroundColor: WAVE_BLUE + "28" }]}>
            <Icon name="wave" size={28} color={WAVE_BLUE} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            SameWave Studios
          </Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Policies, contact, and intellectual property for SameWave.
          </Text>
        </Surface>

        <Text style={[styles.linksHeading, { color: colors.foreground }]}>
          Policies
        </Text>

        <PressableScale
          onPress={() => openExternal(accountDeletionPageUrl(apiOrigin))}
          haptic="light"
          accessibilityLabel="Open account and data deletion request page"
          style={styles.linkRowWrap}
        >
          <Surface
            elevation="sm"
            radius="lg"
            background={WAVE_BLUE + "14"}
            style={[styles.linkRow, styles.deletionRow, { borderColor: WAVE_BLUE + "55" }]}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.linkTitle, { color: colors.foreground }]}>
                Request account & data deletion
              </Text>
              <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
                Delete your account and all associated data (web form + email)
              </Text>
            </View>
            <Icon name="send" size={18} color={WAVE_BLUE} />
          </Surface>
        </PressableScale>

        <PressableScale
          onPress={() => openExternal(accountDeletionMailtoUrl())}
          haptic="light"
          accessibilityLabel="Email account deletion request"
          style={[styles.linkRowWrap, { marginBottom: 16 }]}
        >
          <Surface
            elevation="sm"
            radius="lg"
            background={colors.card}
            style={styles.linkRow}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.linkTitle, { color: colors.foreground }]}>
                Email deletion request
              </Text>
              <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
                {SUPPORT_EMAIL}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
          </Surface>
        </PressableScale>

        {STUDIO_PUBLIC_POLICIES.map((policy) => (
          <PressableScale
            key={policy.id}
            onPress={() => openExternal(`${apiOrigin}${policy.path}`)}
            haptic="light"
            accessibilityLabel={`Open ${policy.title}`}
            style={styles.linkRowWrap}
          >
            <Surface
              elevation="sm"
              radius="lg"
              background={colors.card}
              style={styles.linkRow}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.linkTitle, { color: colors.foreground }]}>
                  {policy.title}
                </Text>
                <Text
                  style={[styles.linkSub, { color: colors.mutedForeground }]}
                >
                  {policy.subtitle}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </Surface>
          </PressableScale>
        ))}

        <Text style={[styles.linksHeading, { color: colors.foreground }]}>
          Contact
        </Text>
        <PressableScale
          onPress={() => openEmail("SameWave support")}
          haptic="light"
          accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
          style={styles.linkRowWrap}
        >
          <Surface
            elevation="sm"
            radius="lg"
            background={colors.card}
            style={styles.linkRow}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.linkTitle, { color: colors.foreground }]}>
                {SUPPORT_EMAIL}
              </Text>
              <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
                Report issues, request features, or ask about your account
              </Text>
            </View>
            <Icon name="send" size={18} color={WAVE_BLUE} />
          </Surface>
        </PressableScale>

        <Text style={[styles.linksHeading, { color: colors.foreground }]}>
          Copyright & intellectual property
        </Text>

        {STUDIO_LEGAL_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {section.title}
            </Text>
            {section.paragraphs.map((p, i) => (
              <Text
                key={`${section.id}-${i}`}
                style={[styles.body, { color: colors.mutedForeground }]}
              >
                {p}
              </Text>
            ))}
          </View>
        ))}

        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          Licensing or permissions questions: email {SUPPORT_EMAIL} with subject
          “SameWave licensing”.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  hero: {
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  linksHeading: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 4,
  },
  linkRowWrap: {
    marginBottom: 10,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  deletionRow: {
    borderWidth: 1,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  linkSub: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
});
