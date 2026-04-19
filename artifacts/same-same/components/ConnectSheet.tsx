import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { SOCIAL_PLATFORMS, isValidHandle } from "@/data/socialPlatforms";

interface ConnectSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (platform: string, handle: string) => void;
  // "send"  → I'm initiating an anonymous connect request
  // "accept" → They sent first; I'm choosing what to share back
  mode: "send" | "accept";
  defaultPlatform?: string;
  defaultHandle?: string;
  theirCountry?: string;
  theirCountryFlag?: string;
}

export function ConnectSheet({
  visible,
  onClose,
  onSubmit,
  mode,
  defaultPlatform,
  defaultHandle,
  theirCountry,
  theirCountryFlag,
}: ConnectSheetProps) {
  const colors = useColors();
  const [platform, setPlatform] = useState<string>(defaultPlatform ?? "instagram");
  const [handle, setHandle] = useState<string>(defaultHandle ?? "");
  const valid = isValidHandle(handle);

  React.useEffect(() => {
    if (visible) {
      setPlatform(defaultPlatform ?? "instagram");
      setHandle(defaultHandle ?? "");
    }
  }, [visible, defaultPlatform, defaultHandle]);

  const submit = () => {
    if (!valid) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit(platform, handle);
  };

  const selectedPlatform = SOCIAL_PLATFORMS.find((p) => p.id === platform);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {mode === "send"
                  ? "Reveal each other?"
                  : "Connect back"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {mode === "send"
                  ? `Send an anonymous connect request${theirCountry ? ` to your match in ${theirCountryFlag ?? ""} ${theirCountry}` : ""}. They'll have 48 hours to accept. Your handle stays hidden until they say yes.`
                  : `${theirCountryFlag ?? ""} ${theirCountry ?? "Someone you matched with"} wants to connect. Pick the handle you want to share — they'll only see it if you accept.`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            Where to connect
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.platformScroll}
            contentContainerStyle={styles.platformRow}
          >
            {SOCIAL_PLATFORMS.map((p) => {
              const active = p.id === platform;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPlatform(p.id);
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.platformChip,
                    {
                      backgroundColor: active ? colors.teal + "22" : colors.background,
                      borderColor: active ? colors.teal : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.platformEmoji}>{p.emoji}</Text>
                  <Text
                    style={[
                      styles.platformName,
                      { color: active ? colors.teal : colors.foreground },
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            Your {selectedPlatform?.name} handle
          </Text>
          <View
            style={[
              styles.inputRow,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.prefix, { color: colors.mutedForeground }]}>
              {selectedPlatform?.prefix ?? "@"}
            </Text>
            <TextInput
              value={handle}
              onChangeText={(t) => setHandle(t.replace(/^@+/, ""))}
              placeholder={selectedPlatform?.placeholder ?? "yourhandle"}
              placeholderTextColor={colors.mutedForeground + "80"}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              style={[styles.input, { color: colors.foreground }]}
            />
          </View>

          <View
            style={[
              styles.privacyBox,
              { backgroundColor: colors.teal + "12", borderColor: colors.teal + "44" },
            ]}
          >
            <Icon name="eye-off" size={14} color={colors.teal} />
            <Text style={[styles.privacyText, { color: colors.teal }]}>
              {mode === "send"
                ? "They won't see your handle unless they accept. Either of you can decline anytime."
                : "Your handle is only revealed if you accept. Decline is silent — they're never told."}
            </Text>
          </View>

          <TouchableOpacity
            onPress={submit}
            disabled={!valid}
            activeOpacity={0.85}
            style={[
              styles.submitBtn,
              {
                backgroundColor: valid ? colors.primary : colors.border,
                opacity: valid ? 1 : 0.6,
              },
            ]}
          >
            <Icon
              name={mode === "send" ? "send" : "check"}
              size={18}
              color={colors.primaryForeground ?? "#fff"}
            />
            <Text
              style={[
                styles.submitText,
                { color: colors.primaryForeground ?? "#fff" },
              ]}
            >
              {mode === "send" ? "Send connect request" : "Accept & reveal"}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.fineprint, { color: colors.mutedForeground }]}>
            No chat. No messages. Just a one-shot handle exchange.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    lineHeight: 18,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 6,
  },
  platformScroll: {
    flexGrow: 0,
  },
  platformRow: {
    gap: 8,
    paddingRight: 12,
  },
  platformChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  platformEmoji: {
    fontSize: 16,
  },
  platformName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
  },
  prefix: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  privacyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 26,
    marginTop: 4,
  },
  submitText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  fineprint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
});
