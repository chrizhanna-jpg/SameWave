import React from "react";

import { CountryPicker } from "@/components/CountryPicker";
import { Screen } from "@/components/Screen";
import { countryFromLocale } from "@/device/location";
import { useAppState } from "@/state/AppState";

/** Asked once, the first time someone signs in. The app moves on by itself once it is set. */
export default function CountryScreen() {
  const { setCountry } = useAppState();
  return (
    <Screen>
      <CountryPicker
        title="Where do you live?"
        initial={countryFromLocale()}
        confirmLabel="Continue"
        onConfirm={setCountry}
      />
    </Screen>
  );
}
