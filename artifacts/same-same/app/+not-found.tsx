import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { space } from "@/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen center scene="homeIllustration">
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        <Txt variant="title" center>
          Nothing here
        </Txt>
        <Button
          kind="soft"
          label="Back to SameWave"
          onPress={() => router.replace("/")}
          style={styles.btn}
        />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "stretch" },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.xl, alignItems: "center" },
  btn: { marginTop: space.xl, alignSelf: "center", minWidth: 220 },
});
