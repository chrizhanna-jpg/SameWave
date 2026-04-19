import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { ConnectRequest } from "@/context/AppContext";
import { ConnectSheet } from "@/components/ConnectSheet";
import { formatHandle, getPlatform } from "@/data/socialPlatforms";
import { timeAgo } from "@/utils/timeAgo";

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m left`;
}

export default function ConnectionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    connectRequests,
    respondConnectRequest,
    markRequestSeen,
    myDefaultPlatform,
    myDefaultHandle,
  } = useApp();
  const [tab, setTab] = useState<"incoming" | "outgoing" | "connected">(
    "incoming",
  );
  const [respondingTo, setRespondingTo] = useState<ConnectRequest | null>(null);

  const incoming = useMemo(
    () =>
      connectRequests.filter(
        (r) => r.direction === "incoming" && r.status === "pending",
      ),
    [connectRequests],
  );
  const outgoing = useMemo(
    () =>
      connectRequests.filter((r) => r.direction === "outgoing"),
    [connectRequests],
  );
  const connected = useMemo(
    () => connectRequests.filter((r) => r.status === "accepted"),
    [connectRequests],
  );

  // When the user opens this screen, mark any "resolved outgoing" + "incoming"
  // items they're now seeing as seen (after a small delay so animations land).
  useEffect(() => {
    const t = setTimeout(() => {
      connectRequests.forEach((r) => {
        if (!r.seen) markRequestSeen(r.id);
      });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topPadding = Platform.OS === "web" ? 8 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  const counts = {
    incoming: incoming.length,
    outgoing: outgoing.filter((r) => r.status === "pending").length,
    connected: connected.length,
  };

  const handleAccept = (req: ConnectRequest) => {
    setRespondingTo(req);
  };

  const handleDecline = (req: ConnectRequest) => {
    const doDecline = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      respondConnectRequest(req.id, false);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Decline this request? They won't be told.")) {
        doDecline();
      }
      return;
    }
    Alert.alert(
      "Decline this request?",
      "They won't be notified you declined. You can still match again.",
      [
        { text: "Keep", style: "cancel" },
        { text: "Decline", style: "destructive", onPress: doDecline },
      ],
    );
  };

  const submitAccept = (platform: string, handle: string) => {
    if (!respondingTo) return;
    respondConnectRequest(respondingTo.id, true, platform, handle);
    setRespondingTo(null);
  };

  const copyHandle = async (req: ConnectRequest) => {
    const handle = formatHandle(req.theirPlatform, req.theirHandle);
    if (!handle) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(handle);
        Alert.alert("Copied", `${handle} is on your clipboard.`);
      } catch {
        Alert.alert("Their handle", handle);
      }
    } else {
      // On native, show in an Alert so the user can long-press to copy.
      // (We can switch to expo-clipboard later for a true one-tap copy.)
      Alert.alert("Their handle", handle, [{ text: "OK" }]);
    }
  };

  const openHandle = (req: ConnectRequest) => {
    const platform = getPlatform(req.theirPlatform);
    if (!platform || !req.theirHandle) return;
    const url = platform.urlTemplate(req.theirHandle);
    Linking.openURL(url).catch(() => {});
  };

  const renderEmpty = (kind: typeof tab) => {
    const messages = {
      incoming: {
        title: "No requests yet",
        sub: "When someone you matched with wants to connect, they'll show up here.",
        emoji: "📭",
      },
      outgoing: {
        title: "Nothing sent yet",
        sub: "After a match, tap “Reveal & Connect” to send an anonymous request.",
        emoji: "🤫",
      },
      connected: {
        title: "No connections yet",
        sub: "Mutual reveals from accepted requests will land here.",
        emoji: "🔗",
      },
    };
    const m = messages[kind];
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>{m.emoji}</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          {m.title}
        </Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          {m.sub}
        </Text>
      </View>
    );
  };

  const renderIncomingCard = (req: ConnectRequest) => (
    <View
      key={req.id}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.thumbStack}>
          <Image source={{ uri: req.theirPhoto }} style={styles.thumbBack} />
          <Image source={{ uri: req.myPhoto }} style={styles.thumbFront} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardKicker, { color: colors.mutedForeground }]}>
            ANONYMOUS REQUEST
          </Text>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {req.theirCountryFlag} Someone in {req.theirCountry}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            <Icon name="clock" size={11} color={colors.mutedForeground} />{" "}
            {timeUntil(req.expiresAt)} · sent {timeAgo(new Date(req.createdAt))}
          </Text>
        </View>
      </View>
      <Text style={[styles.cardBody, { color: colors.foreground }]}>
        They want to swap socials. Their handle is hidden until you accept — and
        they only see yours if you do.
      </Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.declineBtn, { borderColor: colors.border }]}
          onPress={() => handleDecline(req)}
          activeOpacity={0.85}
        >
          <Text style={[styles.declineText, { color: colors.mutedForeground }]}>
            Decline
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: colors.teal }]}
          onPress={() => handleAccept(req)}
          activeOpacity={0.85}
        >
          <Icon name="check" size={16} color="#001018" />
          <Text style={styles.acceptText}>Accept & reveal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderOutgoingCard = (req: ConnectRequest) => {
    const statusColor =
      req.status === "accepted"
        ? colors.teal
        : req.status === "declined"
        ? colors.mutedForeground
        : req.status === "expired"
        ? colors.mutedForeground
        : colors.gold;
    const statusLabel =
      req.status === "accepted"
        ? "Connected"
        : req.status === "declined"
        ? "Declined"
        : req.status === "expired"
        ? "Expired"
        : "Pending";

    return (
      <View
        key={req.id}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.thumbStack}>
            <Image source={{ uri: req.myPhoto }} style={styles.thumbBack} />
            <Image source={{ uri: req.theirPhoto }} style={styles.thumbFront} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardKicker, { color: colors.mutedForeground }]}>
              YOU SENT TO
            </Text>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              {req.theirCountryFlag} {req.theirCountry}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              You shared {formatHandle(req.myPlatform, req.myHandle)} ·{" "}
              {timeAgo(new Date(req.createdAt))}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusColor + "22", borderColor: statusColor },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {req.status === "pending" && (
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            <Icon name="clock" size={12} color={colors.mutedForeground} />{" "}
            {timeUntil(req.expiresAt)} for them to respond.
          </Text>
        )}
        {req.status === "accepted" && req.theirHandle && (
          <View
            style={[
              styles.revealBox,
              {
                backgroundColor: colors.teal + "1a",
                borderColor: colors.teal + "55",
              },
            ]}
          >
            <Text style={styles.revealEmoji}>
              {getPlatform(req.theirPlatform)?.emoji ?? "🔗"}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.revealLabel, { color: colors.teal }]}>
                THEY ACCEPTED · {getPlatform(req.theirPlatform)?.name.toUpperCase()}
              </Text>
              <Text style={[styles.revealHandle, { color: colors.foreground }]}>
                {formatHandle(req.theirPlatform, req.theirHandle)}
              </Text>
            </View>
            <View style={styles.revealActions}>
              <TouchableOpacity
                onPress={() => copyHandle(req)}
                style={[styles.smallBtn, { borderColor: colors.teal }]}
                activeOpacity={0.85}
              >
                <Icon name="link" size={14} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openHandle(req)}
                style={[styles.smallBtn, { backgroundColor: colors.teal }]}
                activeOpacity={0.85}
              >
                <Icon name="arrow-right" size={14} color="#001018" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {req.status === "declined" && (
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            They didn't accept this time. No worries — keep matching.
          </Text>
        )}
        {req.status === "expired" && (
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            The 48-hour window passed before they responded.
          </Text>
        )}
      </View>
    );
  };

  const renderConnectedCard = (req: ConnectRequest) => (
    <View
      key={req.id}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.thumbStack}>
          <Image source={{ uri: req.myPhoto }} style={styles.thumbBack} />
          <Image source={{ uri: req.theirPhoto }} style={styles.thumbFront} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardKicker, { color: colors.teal }]}>
            ✨ MUTUAL REVEAL
          </Text>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {req.theirCountryFlag} {req.theirCountry}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            Connected {timeAgo(new Date(req.respondedAt ?? req.createdAt))}
          </Text>
        </View>
      </View>

      <View style={styles.handlesGrid}>
        <View style={[styles.handleCell, { borderColor: colors.border }]}>
          <Text style={[styles.handleLabel, { color: colors.mutedForeground }]}>
            YOU SHARED
          </Text>
          <Text style={[styles.handleValue, { color: colors.foreground }]}>
            {getPlatform(req.myPlatform)?.emoji}{" "}
            {formatHandle(req.myPlatform, req.myHandle)}
          </Text>
        </View>
        <View style={[styles.handleCell, { borderColor: colors.teal + "55", backgroundColor: colors.teal + "0d" }]}>
          <Text style={[styles.handleLabel, { color: colors.teal }]}>
            THEY SHARED
          </Text>
          <Text style={[styles.handleValue, { color: colors.foreground }]}>
            {getPlatform(req.theirPlatform)?.emoji}{" "}
            {formatHandle(req.theirPlatform, req.theirHandle)}
          </Text>
          <View style={styles.connectedActions}>
            <TouchableOpacity
              onPress={() => copyHandle(req)}
              style={[styles.miniAction, { borderColor: colors.teal }]}
              activeOpacity={0.85}
            >
              <Icon name="link" size={12} color={colors.teal} />
              <Text style={[styles.miniActionText, { color: colors.teal }]}>
                Copy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openHandle(req)}
              style={[styles.miniAction, { backgroundColor: colors.teal }]}
              activeOpacity={0.85}
            >
              <Icon name="arrow-right" size={12} color="#001018" />
              <Text style={[styles.miniActionText, { color: "#001018" }]}>
                Open
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  const list =
    tab === "incoming" ? incoming : tab === "outgoing" ? outgoing : connected;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          accessibilityLabel="Back"
        >
          <Icon name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Connections
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        {(
          [
            { key: "incoming", label: "Requests", icon: "inbox" },
            { key: "outgoing", label: "Sent", icon: "send" },
            { key: "connected", label: "Connected", icon: "sparkles" },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => {
                Haptics.selectionAsync();
                setTab(t.key);
              }}
              style={styles.tabBtn}
              activeOpacity={0.85}
            >
              <View style={styles.tabLabelRow}>
                <Icon
                  name={t.icon}
                  size={14}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {t.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor:
                          t.key === "incoming" ? colors.teal : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.tabBadgeText}>{count}</Text>
                  </View>
                )}
              </View>
              {active && (
                <View
                  style={[styles.tabUnderline, { backgroundColor: colors.primary }]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0
          ? renderEmpty(tab)
          : list.map((r) =>
              tab === "incoming"
                ? renderIncomingCard(r)
                : tab === "outgoing"
                ? renderOutgoingCard(r)
                : renderConnectedCard(r),
            )}

        {tab === "outgoing" && outgoing.length > 0 && (
          <Text style={[styles.legalNote, { color: colors.mutedForeground }]}>
            No chat. No messaging. Just one mutual reveal — the rest is up to you on the platform you both chose.
          </Text>
        )}
      </ScrollView>

      <ConnectSheet
        visible={!!respondingTo}
        onClose={() => setRespondingTo(null)}
        onSubmit={submitAccept}
        mode="accept"
        defaultPlatform={myDefaultPlatform}
        defaultHandle={myDefaultHandle}
        theirCountry={respondingTo?.theirCountry}
        theirCountryFlag={respondingTo?.theirCountryFlag}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    color: "#001018",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  tabUnderline: {
    position: "absolute",
    bottom: -1,
    height: 2,
    width: "60%",
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumbStack: {
    width: 56,
    height: 56,
    position: "relative",
  },
  thumbBack: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0d2340",
  },
  thumbFront: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0d2340",
  },
  cardKicker: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  declineText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  acceptBtn: {
    flex: 2,
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#001018",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  revealBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  revealEmoji: { fontSize: 24 },
  revealLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  revealHandle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  revealActions: {
    flexDirection: "row",
    gap: 6,
  },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  handlesGrid: {
    flexDirection: "row",
    gap: 8,
  },
  handleCell: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  handleLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  handleValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  connectedActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  miniAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniActionText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  legalNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 8,
    lineHeight: 16,
  },
});
