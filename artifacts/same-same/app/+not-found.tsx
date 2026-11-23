import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { sceneFor } from "@/data/scenes";
import { useSession } from "@/state/session";
import { space } from "@/theme";

/**
 * Unknown routes (including a missing OAuth return path) used to strand people
 * on "Nothing here". Send them straight back into the app instead.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const session = useSession();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    if (session.status === "loading") return;
    sent.current = true;
    if (session.status === "signedIn") {
      router.replace("/");
      return;
    }
    router.replace("/sign-in");
  }, [session.status, router]);

  const goHome = () => {
    sent.current = true;
    if (session.status === "signedIn") router.replace("/");
    else router.replace("/sign-in");
  };

  return (
    <Screen center scene={sceneFor.home}>
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        <Txt variant="title" center>
          Taking you back…
        </Txt>
        <Button kind="soft" label="Back to SameWave" onPress={goHome} style={styles.btn} />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "stretch" },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.xl, alignItems: "center" },
  btn: { marginTop: space.xl, alignSelf: "center", minWidth: 220 },
});
