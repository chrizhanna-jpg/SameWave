import * as Clipboard from "expo-clipboard";
import { reloadAppAsync } from "expo";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  collectEnvLines,
  formatBootReport,
  getBootSnapshot,
  hideSplashSafe,
  isBootReady,
  subscribeBootDiagnostics,
} from "@/utils/bootDiagnostics";
import { getPublicApiOrigin } from "@/utils/publicEnv";

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

export function LaunchDiagnosticsView({
  onContinue,
  continueLabel = "Continue to app",
}: {
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [probe, setProbe] = useState("API probe: not run");

  useEffect(() => {
    hideSplashSafe();
    return subscribeBootDiagnostics(() => setTick((n) => n + 1));
  }, []);

  const snap = getBootSnapshot();
  const report = useMemo(() => formatBootReport(), [snap.events.length, snap.lastError, snap.readyAt]);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(formatBootReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const probeApi = async () => {
    const origin = getPublicApiOrigin();
    setProbe(`API probe: fetching ${origin}/api/health …`);
    const started = Date.now();
    try {
      const res = await fetch(`${origin.replace(/\/$/, "")}/api/health`, {
        method: "GET",
      });
      const text = await res.text();
      setProbe(
        `API probe: ${res.status} in ${Date.now() - started}ms\n${text.slice(0, 280)}`,
      );
    } catch (err) {
      setProbe(
        `API probe FAILED in ${Date.now() - started}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const restart = async () => {
    try {
      await reloadAppAsync();
    } catch {
      hideSplashSafe();
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>LAUNCH DIAGNOSTICS</Text>
      <Text style={styles.title}>
        {isBootReady() ? "Boot finished — report below" : "Boot did not finish"}
      </Text>
      <Text style={styles.sub}>
        Screenshot or copy this and send it. Last step is usually the hang.
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.mono} selectable>
          {collectEnvLines().join("\n")}
        </Text>

        {snap.lastError ? (
          <Text style={[styles.mono, styles.err]} selectable>
            ERROR {snap.lastError.kind}: {snap.lastError.name}:{" "}
            {snap.lastError.message}
            {"\n"}
            {snap.lastError.stack ?? ""}
          </Text>
        ) : (
          <Text style={styles.mono}>No JS error captured this launch.</Text>
        )}

        {snap.previousLaunchError ? (
          <Text style={[styles.mono, styles.warn]} selectable>
            Previous launch: {snap.previousLaunchError.kind}{" "}
            {snap.previousLaunchError.name}: {snap.previousLaunchError.message}
          </Text>
        ) : null}

        <Text style={styles.section}>Boot steps</Text>
        <Text style={styles.mono} selectable>
          {snap.events.length === 0
            ? "(none — JS may have died before the first breadcrumb)"
            : snap.events
                .map(
                  (e) =>
                    `+${e.t}ms  ${e.step}${e.detail ? `  ${e.detail}` : ""}`,
                )
                .join("\n")}
        </Text>

        <Text style={[styles.mono, styles.probe]} selectable>
          {probe}
        </Text>
        <Text style={styles.hint} selectable>
          Full report ({report.length} chars) — use Copy.
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={() => void copy()}>
          <Text style={styles.btnLabel}>{copied ? "Copied" : "Copy report"}</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={() => void probeApi()}>
          <Text style={styles.btnGhostLabel}>Probe API</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={() => void restart()}>
          <Text style={styles.btnGhostLabel}>Reload app</Text>
        </Pressable>
        {onContinue ? (
          <Pressable style={styles.btnGhost} onPress={onContinue}>
            <Text style={styles.btnGhostLabel}>{continueLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071828",
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 24,
  },
  kicker: {
    color: "#00BFA5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    color: "#E8F4F8",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  sub: {
    color: "#7ba7c2",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, gap: 12 },
  section: {
    color: "#00BFA5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
  mono: {
    color: "#c5e4f2",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: MONO,
  },
  err: { color: "#ff8a80" },
  warn: { color: "#ffd54f" },
  probe: { color: "#9ec5d8" },
  hint: { color: "#5f8499", fontSize: 11 },
  actions: { gap: 8, paddingTop: 8 },
  btn: {
    backgroundColor: "#00BFA5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnLabel: { color: "#071828", fontSize: 16, fontWeight: "700" },
  btnGhost: {
    borderWidth: 1,
    borderColor: "#1e4a63",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnGhostLabel: { color: "#E8F4F8", fontSize: 15, fontWeight: "600" },
});
