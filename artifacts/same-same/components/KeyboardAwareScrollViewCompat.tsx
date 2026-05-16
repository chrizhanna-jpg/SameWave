import React from "react";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { Platform, ScrollView, type ScrollViewProps } from "react-native";

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export const KeyboardAwareScrollViewCompat = React.forwardRef<
  ScrollView,
  Props
>(function KeyboardAwareScrollViewCompat(
  { children, keyboardShouldPersistTaps = "handled", ...props },
  ref,
) {
  if (Platform.OS === "web") {
    return (
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      ref={ref}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});
