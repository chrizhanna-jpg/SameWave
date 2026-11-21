import { useRouter } from "expo-router";
import React from "react";

import { CountryPicker } from "@/components/CountryPicker";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { useAppState } from "@/state/AppState";

export default function ChangeCountryScreen() {
  const router = useRouter();
  const { countryCode, setCountry } = useAppState();
  return (
    <Screen>
      <Header />
      <CountryPicker
        title="Your country"
        initial={countryCode}
        confirmLabel="Save"
        onConfirm={async (code) => {
          await setCountry(code);
          router.back();
        }}
      />
    </Screen>
  );
}
