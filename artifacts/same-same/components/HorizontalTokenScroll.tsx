import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

type HorizontalTokenScrollProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Fires with the visible width of the scroll viewport (e.g. for centering a chip). */
  onViewportLayout?: (width: number) => void;
};

export const HorizontalTokenScroll = React.forwardRef<
  ScrollView,
  HorizontalTokenScrollProps
>(function HorizontalTokenScroll(
  { children, style, contentContainerStyle, onViewportLayout },
  ref,
) {
  const colors = useColors();
  const [viewportW, setViewportW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const canScroll = contentW > viewportW + 6;
  const maxScrollX = Math.max(0, contentW - viewportW);
  const showRightFade = canScroll && scrollX < maxScrollX - 4;
  const showLeftFade = canScroll && scrollX > 4;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  }, []);

  const fadeEdge = colors.background;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setViewportW(w);
          onViewportLayout?.(w);
        }}
        onContentSizeChange={(w) => setContentW(w)}
        onScroll={onScroll}
        style={[styles.scroll, style]}
        contentContainerStyle={[styles.row, contentContainerStyle]}
      >
        {children}
      </ScrollView>

      {showLeftFade ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={[fadeEdge, `${fadeEdge}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fadeLeft}
          />
          <View pointerEvents="none" style={[styles.chevron, styles.chevronLeft]}>
            <Icon name="chevron-left" size={18} color={colors.teal} />
          </View>
        </>
      ) : null}

      {showRightFade ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={[`${fadeEdge}00`, fadeEdge]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fadeRight}
          />
          <View pointerEvents="none" style={[styles.chevron, styles.chevronRight]}>
            <Icon name="chevron-right" size={18} color={colors.teal} />
          </View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 22,
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
  },
  chevron: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  chevronLeft: {
    left: 2,
  },
  chevronRight: {
    right: 2,
  },
});
