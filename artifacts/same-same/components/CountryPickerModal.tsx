import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { COUNTRIES, type Country } from "@/data/countries";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
  selectedCode?: string;
  title?: string;
}

export function CountryPickerModal({
  visible,
  onClose,
  onSelect,
  selectedCode,
  title = "Where in the world are you?",
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo<Country[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().startsWith(q),
    );
  }, [query]);

  const topPadding = Platform.OS === "web" ? 24 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 12;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            hitSlop={8}
            accessibilityLabel="Close country picker"
          >
            <Icon name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Icon name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search 150+ countries"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.code}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPadding }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.code === selectedCode;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: isSelected
                      ? colors.teal + "1f"
                      : pressed
                      ? colors.card
                      : "transparent",
                    borderColor: isSelected ? colors.teal + "55" : colors.border,
                  },
                ]}
                accessibilityLabel={`Select ${item.name}`}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {item.name}
                </Text>
                {isSelected && (
                  <Icon name="check" size={16} color={colors.teal} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text
              style={[
                styles.empty,
                { color: colors.mutedForeground },
              ]}
            >
              No country matches "{query.trim()}".
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  flag: {
    fontSize: 22,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 32,
  },
});
