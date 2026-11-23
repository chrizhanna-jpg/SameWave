import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { Frost } from "@/components/Frost";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { sceneFor } from "@/data/scenes";
import { useAppState } from "@/state/AppState";
import { space } from "@/theme";

export default function ChangeCountryScreen() {
  const router = useRouter();
  const { countryCode, setCountry } = useAppState();
  return (
    <Screen scene={sceneFor.country}>
      <Header />
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        <CountryPicker
          title="Your country"
          initial={countryCode}
          confirmLabel="Save"
          onConfirm={async (code) => {
            await setCountry(code);
            router.back();
          }}
        />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.sm },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.lg },
});
