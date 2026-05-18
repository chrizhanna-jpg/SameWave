import type { Logger } from "pino";

const DEFAULT_TO = "samewaveripple@gmail.com";

export type PhotoReportEmailInput = {
  photoId: string;
  reportCount: number;
  reason: string | null;
  reporterUserId: string;
};

/** Send a moderation alert when a photo has more than one distinct report. */
export async function sendPhotoReportAlert(
  log: Logger,
  input: PhotoReportEmailInput,
): Promise<void> {
  const to = (process.env.MODERATION_EMAIL_TO ?? DEFAULT_TO).trim();
  const from =
    process.env.MODERATION_EMAIL_FROM?.trim() ??
    "SameWave Moderation <onboarding@resend.dev>";
  const subject = `[SameWave] Photo reported (${input.reportCount} reports) · ${input.photoId.slice(0, 8)}`;
  const text = [
    "A SameWave photo received another distinct report.",
    "",
    `Photo ID: ${input.photoId}`,
    `Report count: ${input.reportCount}`,
    `Reporter user ID: ${input.reporterUserId}`,
    `Reason: ${input.reason?.trim() || "(none provided)"}`,
    "",
    `Review in your database or admin tools. Photos with ≥3 reports are hidden from matching automatically.`,
  ].join("\n");

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn(
          { status: res.status, body: body.slice(0, 200) },
          "Resend moderation email failed",
        );
      }
      return;
    } catch (err) {
      log.warn({ err }, "Resend moderation email threw");
      return;
    }
  }

  log.warn(
    {
      photoId: input.photoId,
      reportCount: input.reportCount,
      to,
    },
    "RESEND_API_KEY not set — moderation email not sent (configure Resend for production alerts)",
  );
}
