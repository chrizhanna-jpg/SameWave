import React from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Txt } from "@/components/Txt";
import { colors, space } from "@/theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  attempt: number;
}

/**
 * If a screen breaks, the person sees a calm way to carry on instead of a
 * frozen or blank app. "Try again" redraws everything below this point.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[SameWave] screen failed", error);
  }

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }
    return (
      <View style={styles.root}>
        <Txt variant="title" center>
          Something went still
        </Txt>
        <Txt tone="haze" center style={styles.body}>
          That screen ran into a problem. Your photos and Waves are safe.
        </Txt>
        <Button
          label="Try again"
          onPress={() => this.setState((state) => ({ error: null, attempt: state.attempt + 1 }))}
          style={styles.button}
        />
        {__DEV__ ? (
          <Txt variant="quiet" tone="ember" center style={styles.body}>
            {this.state.error.message}
          </Txt>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pond,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  body: { marginTop: space.md },
  button: { marginTop: space.xl, alignSelf: "center", minWidth: 200 },
});
