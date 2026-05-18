import { Alert, Platform } from "react-native";
import { reportPhoto } from "@/utils/api";
import { SUPPORT_EMAIL } from "@/data/studioLegal";

function confirmWeb(message: string): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line no-alert
  return window.confirm(message);
}

/** Ask the user to confirm reporting someone else's photo, then POST /report. */
export function confirmReportPhoto(
  photoId: string,
  options?: { countryLabel?: string },
): void {
  const place = options?.countryLabel
    ? ` from ${options.countryLabel}`
    : "";
  const run = async () => {
    const ok = await reportPhoto(photoId);
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      window.alert(
        ok
          ? "Thanks — we received your report. The photo may be hidden after several reports."
          : "Could not send your report. Sign in and try again, or email us for urgent safety issues.",
      );
      return;
    }
    Alert.alert(
      ok ? "Report sent" : "Could not report",
      ok
        ? "Thanks for helping keep SameWave safe. Multiple reports can hide a photo from circulation."
        : `Sign in and try again, or email ${SUPPORT_EMAIL} for urgent safety issues.`,
    );
  };

  const title = "Report this photo?";
  const message = `Flag this photo${place} for review. You can only report each photo once.`;

  if (Platform.OS === "ios" && typeof Alert.prompt === "function") {
    Alert.prompt(
      title,
      `${message}\n\nOptional: add a short reason.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: (reason?: string) => {
            void reportPhoto(photoId, reason?.trim() || undefined).then((ok) => {
              Alert.alert(
                ok ? "Report sent" : "Could not report",
                ok
                  ? "Thanks for helping keep SameWave safe."
                  : `Try again or email ${SUPPORT_EMAIL}.`,
              );
            });
          },
        },
      ],
      "plain-text",
    );
    return;
  }

  if (Platform.OS === "web") {
    if (confirmWeb(`${title}\n\n${message}`)) void run();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Report", style: "destructive", onPress: () => void run() },
  ]);
}

/** Ask the user to confirm deleting one of their own photos. */
export function confirmDeleteMyPhoto(onConfirm: () => void | Promise<void>): void {
  const title = "Remove this photo?";
  const message =
    "This deletes it from the server and removes it from matching. Ripples and waves tied to this photo may also disappear.";

  if (Platform.OS === "web") {
    if (confirmWeb(`${title}\n\n${message}`)) void onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Keep photo", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => void onConfirm() },
  ]);
}
