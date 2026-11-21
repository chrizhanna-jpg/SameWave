import { useRouter } from "expo-router";
import React from "react";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { space } from "@/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen center>
      <Txt variant="title" center>
        Nothing here
      </Txt>
      <Button
        kind="soft"
        label="Back to SameWave"
        onPress={() => router.replace("/")}
        style={{ marginTop: space.xl, alignSelf: "center", minWidth: 220 }}
      />
    </Screen>
  );
}
