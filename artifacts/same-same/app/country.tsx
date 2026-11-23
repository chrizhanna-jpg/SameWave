import React from "react";
import { StyleSheet } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { Frost } from "@/components/Frost";
import { Screen } from "@/components/Screen";
import { sceneFor } from "@/data/scenes";
import { countryFromLocale } from "@/device/location";
import { useAppState } from "@/state/AppState";
import { space } from "@/theme";

/** Asked once, the first time someone signs in. */
export default function CountryScreen() {
  const { setCountry } = useAppState();
  return (
    <Screen scene={sceneFor.country}>
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        <CountryPicker
          title="Where do you live?"
          initial={countryFromLocale()}
          confirmLabel="Continue"
          onConfirm={setCountry}
        />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.lg },
});
