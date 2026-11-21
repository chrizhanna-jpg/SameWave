import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

import { HomeScene } from "@/components/HomeScene";
import { scenes, type SceneId } from "@/data/scenes";

type Source =
  | { kind: "scene"; id: SceneId }
  | { kind: "uri"; uri: string }
  | { kind: "homeIllustration" }
  | { kind: "none" };

interface Props {
  source: Source;
  /**
   * Soft palette wash so text stays readable without new hues —
   * existing background / waterPale at low opacity over a photograph.
   * Skipped for the home illustration (it already uses palette fills).
   */
  wash?: boolean;
}

/**
 * Full-bleed backdrop behind frosted UI.
 * Photographs on main screens. `homeIllustration` keeps HomeScene available
 * unused-by-default for an easy switch-back from the lake photo.
 */
export function SceneBackdrop({ source, wash = true }: Props) {
  if (source.kind === "none") return null;

  if (source.kind === "homeIllustration") {
    return <HomeScene />;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {source.kind === "scene" ? (
        <Image
          source={scenes[source.id] as number}
          style={styles.photo}
          contentFit="cover"
          transition={0}
        />
      ) : (
        <Image source={{ uri: source.uri }} style={styles.photo} contentFit="cover" transition={0} />
      )}
      {wash ? (
        <LinearGradient
          colors={[
            // colors.background #E9F6FF and colors.waterPale #C7E8FE — opacity only.
            "rgba(233, 246, 255, 0.48)",
            "rgba(233, 246, 255, 0.14)",
            "rgba(199, 232, 254, 0.42)",
          ]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
});
