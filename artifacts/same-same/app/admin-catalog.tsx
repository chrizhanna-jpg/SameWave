import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useColors } from "@/hooks/useColors";
import { getDeviceId } from "@/utils/api";
import { getPublicApiOrigin } from "@/utils/publicEnv";
import { MUSIC_LIBRARY } from "@/data/musicLibrary";
import {
  refreshServerCatalog,
  type CatalogKind,
  type ServerCatalogEntry,
} from "@/utils/serverCatalog";

// Hidden owner-only screen. It is not linked from normal navigation; the
// only entry point is a hidden multi-tap gesture (see app/(tabs)/profile.tsx).
// Even reached directly, it is unusable without the admin token: every admin
// request carries X-Admin-Token, which the server compares to
// BACKFILL_ADMIN_TOKEN and 403s otherwise. The token is entered + stored on
// device here; nothing is hardcoded.
const ADMIN_TOKEN_KEY = "samesame_admin_token";

type Submission = { word: string; kind: CatalogKind; count: number; sample: string };
type ApprovedEntry = ServerCatalogEntry & { id: string };

type RowDraft = { emoji: string; music: string; title: string };

function apiBase(): string {
  return getPublicApiOrigin().replace(/\/$/, "");
}

async function adminHeaders(token: string): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    "X-Admin-Token": token,
  };
}

export default function AdminCatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [token, setToken] = React.useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = React.useState(false);
  const [tokenInput, setTokenInput] = React.useState("");

  const [kind, setKind] = React.useState<CatalogKind>("theme");
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [approved, setApproved] = React.useState<ApprovedEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, RowDraft>>({});
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
        if (stored) setToken(stored);
      } catch {
        /* ignore */
      } finally {
        setTokenLoaded(true);
      }
    })();
  }, []);

  const draftFor = React.useCallback(
    (word: string): RowDraft => drafts[word] ?? { emoji: "", music: "", title: "" },
    [drafts],
  );

  const setDraft = React.useCallback(
    (word: string, patch: Partial<RowDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [word]: { ...(prev[word] ?? { emoji: "", music: "", title: "" }), ...patch },
      }));
    },
    [],
  );

  const load = React.useCallback(
    async (which: CatalogKind, tok: string) => {
      setLoading(true);
      setError(null);
      try {
        const headers = await adminHeaders(tok);
        const [subsRes, approvedRes] = await Promise.all([
          fetch(`${apiBase()}/api/catalog/submissions?kind=${which}`, { headers }),
          fetch(`${apiBase()}/api/catalog`),
        ]);
        if (subsRes.status === 403) {
          setError("Token rejected by server (403). Check the admin token.");
          setSubmissions([]);
          setApproved([]);
          return;
        }
        if (!subsRes.ok) {
          setError(`Failed to load submissions (${subsRes.status}).`);
          return;
        }
        const subsJson = (await subsRes.json()) as { submissions?: Submission[] };
        setSubmissions(Array.isArray(subsJson.submissions) ? subsJson.submissions : []);
        if (approvedRes.ok) {
          const aj = (await approvedRes.json()) as {
            themes?: ApprovedEntry[];
            vibes?: ApprovedEntry[];
          };
          const list = which === "vibe" ? aj.vibes : aj.themes;
          setApproved(Array.isArray(list) ? list : []);
        }
      } catch {
        setError("Couldn't reach the server. Check your connection / API URL.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (token) void load(kind, token);
  }, [token, kind, load]);

  const saveToken = React.useCallback(async () => {
    const t = tokenInput.trim();
    if (!t) return;
    try {
      await AsyncStorage.setItem(ADMIN_TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
    setToken(t);
    setTokenInput("");
  }, [tokenInput]);

  const clearToken = React.useCallback(async () => {
    try {
      await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setSubmissions([]);
    setApproved([]);
  }, []);

  const approve = React.useCallback(
    async (sub: Submission) => {
      if (!token) return;
      const d = draftFor(sub.word);
      const emoji = d.emoji.trim();
      const music = d.music.trim();
      if (!emoji || !music) {
        setError(`Add an emoji and a vibe/URL for "${sub.word}" first.`);
        return;
      }
      setBusy((p) => ({ ...p, [sub.word]: true }));
      setError(null);
      try {
        const res = await fetch(`${apiBase()}/api/catalog/approve`, {
          method: "POST",
          headers: await adminHeaders(token),
          body: JSON.stringify({
            word: sub.word,
            kind: sub.kind,
            emoji,
            musicRef: music,
            title: d.title.trim() || sub.sample || sub.word,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Approve failed (${res.status}).`);
          return;
        }
        await refreshServerCatalog();
        await load(kind, token);
      } catch {
        setError("Approve failed — network error.");
      } finally {
        setBusy((p) => ({ ...p, [sub.word]: false }));
      }
    },
    [token, draftFor, kind, load],
  );

  const dismiss = React.useCallback(
    async (sub: Submission) => {
      if (!token) return;
      setBusy((p) => ({ ...p, [sub.word]: true }));
      try {
        await fetch(`${apiBase()}/api/catalog/dismiss`, {
          method: "POST",
          headers: await adminHeaders(token),
          body: JSON.stringify({ word: sub.word, kind: sub.kind }),
        });
        await load(kind, token);
      } catch {
        setError("Dismiss failed — network error.");
      } finally {
        setBusy((p) => ({ ...p, [sub.word]: false }));
      }
    },
    [token, kind, load],
  );

  const remove = React.useCallback(
    async (entry: ApprovedEntry) => {
      if (!token) return;
      setBusy((p) => ({ ...p, [entry.id]: true }));
      try {
        const res = await fetch(
          `${apiBase()}/api/catalog/approve/${encodeURIComponent(entry.id)}`,
          { method: "DELETE", headers: await adminHeaders(token) },
        );
        if (res.ok) {
          await refreshServerCatalog();
          await load(kind, token);
        }
      } catch {
        setError("Remove failed — network error.");
      } finally {
        setBusy((p) => ({ ...p, [entry.id]: false }));
      }
    },
    [token, kind, load],
  );

  const topPad = insets.top + 12;

  // ── Token gate ──────────────────────────────────────────────────────────
  if (tokenLoaded && !token) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: topPad }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.back, { color: colors.primary }]}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Catalog admin</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>
            Enter admin token
          </Text>
          <Text style={[styles.gateHint, { color: colors.mutedForeground }]}>
            This screen is owner-only. Paste the BACKFILL_ADMIN_TOKEN value. It
            is stored only on this device and sent as X-Admin-Token.
          </Text>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="Admin token"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
            ]}
          />
          <TouchableOpacity
            onPress={saveToken}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.primaryBtnText}>Save & unlock</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (!tokenLoaded) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.primary }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Catalog admin</Text>
        <TouchableOpacity onPress={clearToken} hitSlop={12}>
          <Text style={[styles.back, { color: colors.mutedForeground }]}>Lock</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(["theme", "vibe"] as CatalogKind[]).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setKind(k)}
            style={[
              styles.tab,
              {
                backgroundColor: kind === k ? colors.primary : colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: kind === k ? "#fff" : colors.foreground },
              ]}
            >
              {k === "theme" ? "Submitted themes" : "Submitted vibes"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <Text style={[styles.error, { color: "#E57373" }]}>{error}</Text>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && <ActivityIndicator color={colors.primary} />}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          To review ({submissions.length})
        </Text>
        {!loading && submissions.length === 0 && (
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>
            Nothing waiting — every submitted {kind} is covered or already handled.
          </Text>
        )}
        {submissions.map((sub) => {
          const d = draftFor(sub.word);
          const rowBusy = !!busy[sub.word];
          return (
            <View
              key={sub.word}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.word, { color: colors.foreground }]}>
                  {sub.sample || sub.word}
                </Text>
                <Text style={[styles.count, { color: colors.mutedForeground }]}>
                  ×{sub.count}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <TextInput
                  value={d.emoji}
                  onChangeText={(v) => setDraft(sub.word, { emoji: v })}
                  placeholder="🙂"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.emojiInput,
                    { color: colors.foreground, borderColor: colors.border },
                  ]}
                />
                <TextInput
                  value={d.music}
                  onChangeText={(v) => setDraft(sub.word, { music: v })}
                  placeholder="vibe id (e.g. calm) or https URL"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.musicInput,
                    { color: colors.foreground, borderColor: colors.border },
                  ]}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {MUSIC_LIBRARY.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setDraft(sub.word, { music: g.id })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: d.music === g.id ? colors.teal : colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: d.music === g.id ? "#001018" : colors.mutedForeground,
                        fontSize: 12,
                      }}
                    >
                      {g.emoji} {g.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => dismiss(sub)}
                  disabled={rowBusy}
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                    Ignore
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => approve(sub)}
                  disabled={rowBusy}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: rowBusy ? 0.5 : 1 }]}
                >
                  <Text style={styles.primaryBtnText}>
                    {rowBusy ? "…" : "Approve"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 16 }]}>
          Approved ({approved.length})
        </Text>
        {approved.length === 0 && (
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>
            No approved {kind} entries yet.
          </Text>
        )}
        {approved.map((entry) => {
          const rowBusy = !!busy[entry.id];
          return (
            <View
              key={entry.id}
              style={[styles.approvedRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={styles.approvedEmoji}>{entry.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.word, { color: colors.foreground }]}>{entry.word}</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  {entry.musicRef}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => remove(entry)}
                disabled={rowBusy}
                hitSlop={8}
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryBtnText, { color: "#E57373" }]}>
                  {rowBusy ? "…" : "Remove"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  gate: { padding: 24, gap: 14 },
  gateTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  gateHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  error: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 13 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  muted: { fontSize: 13, fontFamily: "Inter_400Regular" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  word: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  count: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldRow: { flexDirection: "row", gap: 8 },
  emojiInput: {
    width: 56,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: "center",
    fontSize: 18,
  },
  musicInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  approvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  approvedEmoji: { fontSize: 24 },
});
