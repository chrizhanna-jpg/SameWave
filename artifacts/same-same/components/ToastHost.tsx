import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

export interface ToastAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
}

export interface ToastPayload {
  title?: string;
  body: string;
  // Optional callback when the user taps the toast. The host handles
  // dismissal; the callback only needs to perform the action (e.g.
  // router.push).
  onPress?: () => void;
  /** Primary CTA pill (e.g. "Make a Wave" on an incoming Ripple toast). */
  action?: ToastAction;
  // Override the default auto-dismiss window (ms).
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (payload: ToastPayload) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4500;
const SLIDE_DURATION_MS = 220;
const SWIPE_DISMISS_THRESHOLD = 40;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastHost>");
  }
  return ctx;
}

export function ToastHost({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  // We want a stable key so a new toast arriving while one is visible
  // re-runs the entrance animation cleanly.
  const [renderKey, setRenderKey] = useState(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (payload: ToastPayload) => {
      clearTimer();
      setToast(payload);
      setRenderKey((k) => k + 1);
      const duration = payload.durationMs ?? DEFAULT_DURATION_MS;
      dismissTimer.current = setTimeout(() => {
        setToast(null);
        dismissTimer.current = null;
      }, duration);
    },
    [clearTimer],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo(
    () => ({ showToast, hideToast }),
    [showToast, hideToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <ToastView
          key={renderKey}
          payload={toast}
          topInset={insets.top}
          colors={colors}
          onDismiss={hideToast}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

interface ToastViewProps {
  payload: ToastPayload;
  topInset: number;
  colors: ReturnType<typeof useColors>;
  onDismiss: () => void;
}

function ToastView({ payload, topInset, colors, onDismiss }: ToastViewProps) {
  // translateY is animated for both entrance (slide down from -120) and
  // swipe-up dismissal. opacity fades the toast out at the same time so
  // the dismissal feels intentional even if the translate is small.
  const translateY = useSharedValue(-160);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: SLIDE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: SLIDE_DURATION_MS });
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const animateOutAndDismiss = useCallback(() => {
    translateY.value = withTiming(-160, {
      duration: SLIDE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
    opacity.value = withTiming(
      0,
      { duration: SLIDE_DURATION_MS },
      (finished) => {
        if (finished) runOnJS(onDismiss)();
      },
    );
  }, [onDismiss, opacity, translateY]);

  const handleBodyPress = useCallback(() => {
    payload.onPress?.();
    animateOutAndDismiss();
  }, [animateOutAndDismiss, payload]);

  const handleActionPress = useCallback(() => {
    payload.action?.onPress();
    animateOutAndDismiss();
  }, [animateOutAndDismiss, payload]);

  // Swipe-up to dismiss. We only react to upward drags; downward drags
  // are clamped so the toast doesn't peel further into the screen.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          translateY.value = Math.min(0, e.translationY);
        })
        .onEnd((e) => {
          if (
            -e.translationY > SWIPE_DISMISS_THRESHOLD ||
            -e.velocityY > 600
          ) {
            translateY.value = withTiming(-160, {
              duration: 180,
              easing: Easing.in(Easing.cubic),
            });
            opacity.value = withTiming(
              0,
              { duration: 180 },
              (finished) => {
                if (finished) runOnJS(onDismiss)();
              },
            );
          } else {
            translateY.value = withTiming(0, { duration: 160 });
          }
        }),
    [onDismiss, opacity, translateY],
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: topInset + 8 }]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.toast,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: "#000",
            },
            animatedStyle,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Pressable
            onPress={handleBodyPress}
            style={styles.pressable}
            accessibilityRole="button"
            accessibilityLabel={
              payload.title ? `${payload.title}. ${payload.body}` : payload.body
            }
          >
            {payload.title ? (
              <Text
                style={[styles.title, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {payload.title}
              </Text>
            ) : null}
            <Text
              style={[styles.body, { color: colors.mutedForeground }]}
              numberOfLines={3}
            >
              {payload.body}
            </Text>
          </Pressable>
          {payload.action ? (
            <Pressable
              onPress={handleActionPress}
              style={[styles.actionBtn, { backgroundColor: colors.gold }]}
              accessibilityRole="button"
              accessibilityLabel={payload.action.label}
            >
              {payload.action.icon ? (
                <Icon name={payload.action.icon} size={16} color="#001018" />
              ) : null}
              <Text style={styles.actionBtnText}>{payload.action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressable: {
    width: "100%",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginBottom: 2,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#001018",
  },
});
