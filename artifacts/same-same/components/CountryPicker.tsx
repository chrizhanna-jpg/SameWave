import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { COUNTRIES, flagFor, type Country } from "@/data/countries";
import { colors, radius, space, type } from "@/theme";

interface Props {
  title: string;
  /** Chosen to begin with: the current country, or a guess from the phone's region. */
  initial: string | null;
  confirmLabel: string;
  onConfirm: (countryCode: string) => Promise<void> | void;
}

export function CountryPicker({ title, initial, confirmLabel, onConfirm }: Props) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const countries = useMemo<Country[]>(() => {
    const wanted = search.trim().toLowerCase();
    const matching = wanted
      ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(wanted))
      : COUNTRIES;
    // The starting choice sits first so nobody has to scroll to find it.
    const first = matching.find((c) => c.code === initial);
    return first ? [first, ...matching.filter((c) => c.code !== initial)] : matching;
  }, [search, initial]);

  const confirm = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      await onConfirm(chosen);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.fill}>
      <Txt variant="title">{title}</Txt>
      <Txt tone="haze" style={styles.line}>
        Only your country is ever shown, never where you are.
      </Txt>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search"
        placeholderTextColor={colors.haze}
        autoCorrect={false}
        style={styles.search}
        accessibilityLabel="Search countries"
      />
      <FlatList
        data={countries}
        keyExtractor={(country) => country.code}
        style={styles.fill}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        renderItem={({ item }) => {
          const selected = item.code === chosen;
          return (
            <Pressable
              onPress={() => setChosen(item.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={item.name}
              style={[styles.row, selected && styles.rowOn]}
            >
              <Txt style={styles.flag}>{flagFor(item.code)}</Txt>
              <Txt style={styles.fill} numberOfLines={1}>
                {item.name}
              </Txt>
              {selected ? <Icon name="check" size={20} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Txt tone="haze" center style={styles.line}>
            No country by that name.
          </Txt>
        }
      />
      <Button
        label={confirmLabel}
        onPress={confirm}
        disabled={!chosen}
        busy={busy}
        style={styles.confirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  line: { marginTop: space.sm },
  search: {
    ...type.body,
    color: colors.mist,
    backgroundColor: colors.pondLift,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.pondLift },
  flag: { width: 36 },
  confirm: { marginTop: space.md },
});
