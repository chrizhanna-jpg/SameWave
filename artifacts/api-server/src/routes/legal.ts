import type { Response } from "express";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Public contact for privacy, data deletion, terms, and safety reports. */
const CONTACT_EMAIL = "samewaveripple@gmail.com";

const PAGE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 80px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: #111;
    background: #fff;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0d10; color: #e6e8eb; }
    a { color: #6cb4ff; }
    code { background: #1a1d22; }
  }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.5px; }
  h2 { font-size: 18px; margin: 28px 0 8px; letter-spacing: -0.2px; }
  p, li { font-size: 15px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  code { padding: 1px 6px; border-radius: 4px; background: #f0f1f3; font-size: 13px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 32px 0; }
  @media (prefers-color-scheme: dark) {
    hr { border-top-color: #23262b; }
    .meta { color: #9aa1a8; }
  }
`;

const APP_NAME = "SameWave";

function layout(title: string, body: string, metaDescription?: string): string {
  const desc = metaDescription ?? `${title} for ${APP_NAME}.`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${desc.replace(/"/g, "&quot;")}" />
  <meta name="robots" content="index, follow" />
  <title>${title} — ${APP_NAME}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function sendPublicHtml(res: Response, html: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(html);
}

const PRIVACY_HTML = layout(
  "Privacy Policy",
  `
  <h1>Privacy Policy</h1>
  <p class="meta">Echo (the "App"). Last updated: April 2026.</p>

  <p>Echo is an anonymous photo-matching app. We collect the minimum amount of
  information needed to make the App work, we do not sell your data, and we do
  not use third-party advertising or tracking SDKs.</p>

  <h2>What we collect</h2>
  <ul>
    <li><strong>Photos you upload.</strong> Only the photos you choose to share are sent to our server.</li>
    <li><strong>Audio recordings you choose to attach</strong> to a photo. The "record your own vibe" feature is opt-in: nothing is recorded unless you tap the record button. Recordings are short (capped at ~10 seconds) and stored alongside the photo, so other users hear them when they see your photo. They are deleted when the photo is deleted.</li>
    <li><strong>Theme and tags</strong> derived from each photo (e.g. "morning coffee", "outdoors", "warm"). These power the matching.</li>
    <li><strong>Country</strong> you select during onboarding (country only — not your precise location). Location permission is requested only to suggest your country, and you can decline and pick manually.</li>
    <li><strong>An anonymous device identifier</strong> generated on first launch and stored on your device. We use it to recognise your device across sessions. It is not linked to your name, email, phone number, or any other personally identifying account.</li>
    <li><strong>Your interactions</strong> — which photos you marked as "Same Same" or passed on, and the resulting matches ("Echoes").</li>
    <li><strong>A push notification token</strong>, only if you opt in to notifications.</li>
  </ul>

  <p>We do <strong>not</strong> collect: your name, email, phone number, contacts, calendar, microphone, precise location, or browsing history. The App requires no account or sign-up.</p>

  <h2>How we use it</h2>
  <ul>
    <li>To show your photo to other users whose photos share a similar theme or vibe, and to show you theirs.</li>
    <li>To remember which photos you have already seen so we don't show them again.</li>
    <li>To send you a push notification when you have a new Echo, if you opted in.</li>
    <li>To detect and remove abusive content reported by other users.</li>
  </ul>

  <h2>Who can see your photos</h2>
  <p>Photos you upload are shown to other Echo users in the matching feed. They
  are shown anonymously — other users see your photo and your country, but never
  your device identifier or any personal information. You should only upload
  photos you are comfortable sharing publicly.</p>

  <h2>How long we keep it</h2>
  <ul>
    <li><strong>Free users:</strong> photos are automatically deleted 30 days after upload.</li>
    <li><strong>Pro users:</strong> photos remain until you delete them or your account is removed.</li>
    <li>Match history (your Echoes) and the seen-photo log are retained while your device identifier is active so the App can show you your past matches.</li>
  </ul>

  <h2>Your rights</h2>
  <ul>
    <li><strong>Delete a photo</strong> — remove any of your photos from inside the App.</li>
    <li><strong>Delete everything</strong> — uninstall the App and email us at the address below to request full deletion of your photos and matches.</li>
    <li><strong>Opt out of notifications</strong> — turn off notifications in your device settings at any time.</li>
  </ul>

  <h2>Children</h2>
  <p>Echo is not intended for users under 13 (or the minimum age in your country, whichever is higher). We do not knowingly collect data from children. If you believe a child has used the App, contact us and we will delete the related data.</p>

  <h2>Security</h2>
  <p>Photos and metadata are transmitted over HTTPS and stored on managed cloud infrastructure. No system is perfectly secure, so do not upload anything you would not want a stranger to see.</p>

  <h2>Changes</h2>
  <p>If we change this policy in any material way we will update the date at the top of the page and, where appropriate, surface a notice inside the App.</p>

  <h2>Contact</h2>
  <p>Questions or deletion requests: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

  <hr />
  <p class="meta"><a href="/api/terms">Terms of Service</a></p>
  `,
);

const TERMS_HTML = layout(
  "Terms of Service",
  `
  <h1>Terms of Service</h1>
  <p class="meta">Echo (the "App"). Last updated: April 2026.</p>

  <p>By using Echo you agree to these terms. If you do not agree, do not use the App.</p>

  <h2>What Echo is</h2>
  <p>Echo is an anonymous photo-matching service. You upload a photo, we match it with photos from other users, and if you both mark each other "Same Same" you create an "Echo".</p>

  <h2>Your photos</h2>
  <ul>
    <li>You must own the rights to every photo you upload, or have permission from the people in it.</li>
    <li>You give Echo a worldwide, non-exclusive, royalty-free licence to host your photo and show it to other Echo users for the purpose of matching. This licence ends when you delete the photo or it expires under our retention policy.</li>
    <li>You agree not to upload: photos of other people without their consent, sexually explicit material, content depicting minors in any sexual context, hate speech, harassment, violence, illegal content, copyrighted material you do not own, scams, spam, advertising, QR codes, or contact information.</li>
  </ul>

  <h2>Behaviour</h2>
  <p>Do not use Echo to harass, threaten, or attempt to identify other users. Do not attempt to scrape, reverse-engineer, or overload the service. We may remove content and block devices that violate these terms, with or without notice.</p>

  <h2>Reporting</h2>
  <p>Every photo can be reported from inside the App. Photos that exceed a moderation threshold are hidden automatically while we review.</p>

  <h2>No guarantees</h2>
  <p>Echo is provided "as is". We make no guarantee that matches will appear, that photos will be retained, or that the service will be available without interruption.</p>

  <h2>Liability</h2>
  <p>To the maximum extent permitted by law, Echo and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the App.</p>

  <h2>Termination</h2>
  <p>You can stop using Echo at any time by uninstalling the App. We can suspend or terminate access for any user who breaches these terms.</p>

  <h2>Changes</h2>
  <p>We may update these terms; the "last updated" date above will reflect the most recent version. Continued use of the App after a change constitutes acceptance.</p>

  <h2>Contact</h2>
  <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

  <hr />
  <p class="meta"><a href="/api/privacy">Privacy Policy</a></p>
  `,
);

// Child Sexual Abuse and Exploitation (CSAE) Standards.
// Required by Google Play's Child Safety Standards policy for any app
// that hosts user-generated content. The published URL of this page
// (`https://<api-domain>/api/csae`) is what gets pasted into the Play
// Console "Link to your app's externally published standards against
// child sexual abuse and exploitation (CSAE)" field. Keep the URL
// stable — once the listing is approved, changing the path silently
// would invalidate the declaration and risk a takedown.
const CSAE_HTML = layout(
  "Child Safety Standards",
  `
  <h1>Child Safety Standards</h1>
  <p class="meta">SameWave (the "App"). Last updated: May 2026.</p>

  <p>SameWave has zero tolerance for child sexual abuse and exploitation (CSAE)
  and child sexual abuse material (CSAM). This page sets out the standards we
  follow to keep children safe on the App, how to report content that may
  violate these standards, and how we respond to those reports. It is published
  here so that users, regulators, and platform partners can review our
  commitments at a stable URL.</p>

  <h2>Our standards</h2>
  <ul>
    <li>The App is not directed at children. Our Terms of Service prohibit use
      by anyone under 13, or under the minimum age in their country if that age
      is higher.</li>
    <li>It is strictly forbidden to upload, share, request, or solicit any
      content that sexualises, endangers, or exploits a child, including
      computer-generated or animated depictions of minors in a sexual
      context.</li>
    <li>It is strictly forbidden to use the App to contact, groom, lure, or
      attempt to sexually exploit a minor in any form.</li>
    <li>Any account or device found to upload such content, or to attempt
      contact with a minor for any of the above purposes, is permanently
      blocked from the service without warning, and the content is preserved
      where required by law for handover to the appropriate authority.</li>
  </ul>

  <h2>Reporting CSAE content or behaviour</h2>
  <p>You do not need an account to report. There are two ways to report
  suspected CSAE on SameWave:</p>
  <ul>
    <li><strong>In the App:</strong> every photo has a "Report" action in its
      detail view. Selecting it sends an immediate signal to our moderation
      pipeline. Three independent reports against the same photo automatically
      hide it from circulation pending review. You do not need to be the
      subject of the photo, or even a registered user, to report.</li>
    <li><strong>By email:</strong> anyone — user or non-user — can email
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
      with details of the content and, if possible, a screenshot or photo
      identifier. Please put "CSAE" in the subject line so it reaches us
      quickly. Reports are accepted in any language.</li>
  </ul>

  <h2>How we respond to reports</h2>
  <ul>
    <li>Reports flagged as CSAE are reviewed on a priority basis, ahead of
      other moderation queues.</li>
    <li>Where content appears to depict CSAM, it is removed from public view
      immediately and the uploading account/device is blocked.</li>
    <li>Apparent CSAM is reported to the National Center for Missing &amp;
      Exploited Children (NCMEC) via the CyberTipline, and to law-enforcement
      authorities in any other jurisdiction where reporting is required.
      Account and content metadata are preserved as evidence in line with
      applicable law.</li>
    <li>Where the report concerns a minor in physical danger, we escalate to
      local law enforcement directly.</li>
  </ul>

  <h2>Compliance with applicable laws</h2>
  <p>SameWave complies with all applicable child-protection laws in the
  jurisdictions where the App is distributed, including but not limited to the
  US 18 U.S.C. Section 2258A reporting obligations, the EU Digital Services Act, the
  UK Online Safety Act, and equivalent national legislation.</p>

  <h2>Compliance contact</h2>
  <p>For questions about these standards, requests from law enforcement, or
  press enquiries related to child safety, contact:
  <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

  <hr />
  <p class="meta"><a href="/api/privacy">Privacy Policy</a> · <a href="/api/terms">Terms of Service</a></p>
  `,
);

// Play Console "Data safety" → deletion URL must return 200 HTML without sign-in.
const DATA_DELETION_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("SameWave data deletion request")}`;

const DATA_DELETION_HTML = layout(
  "Delete your data",
  `
  <h1>Request deletion of your SameWave account and data</h1>
  <p class="meta">${APP_NAME} (Android package <code>app.echo.samewave</code>). Last updated: May 2026.</p>

  <p>Use this page to request deletion of your <strong>SameWave</strong> account
  and associated personal data (photos, ripples/waves, votes, country, sign-in
  linkage, and push tokens). You do not need to stay signed in to read this page.</p>

  <h2>Option 1 — Delete some data (keep your account)</h2>
  <p>Signed-in users can remove individual photos in the App under
  <strong>My photos</strong>. That deletes those photos from our servers without
  closing your account. See our <a href="/api/privacy">Privacy Policy</a>.</p>

  <h2>Option 2 — Delete your account and all associated data</h2>
  <p>Email us to request complete deletion of your account and all data we hold
  about you:</p>
  <p><strong><a href="${DATA_DELETION_MAILTO}">${CONTACT_EMAIL}</a></strong></p>
  <p>Please use the subject line: <code>SameWave data deletion request</code>.
  Include the Google account email you use to sign in (if helpful) so we can
  locate your account.</p>
  <p>We confirm receipt and complete verifiable requests within
  <strong>30 days</strong> (or longer only where the law requires). We may ask a
  short verification step to prevent fraudulent requests.</p>

  <h2>After deletion</h2>
  <p>Deleted data cannot be restored. We may retain minimal records where the law
  requires (for example safety or fraud investigations).</p>

  <h2>Contact</h2>
  <p>Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

  <hr />
  <p class="meta"><a href="/api/privacy">Privacy Policy</a> · <a href="/api/terms">Terms of Service</a></p>
  `,
  "How to request deletion of your SameWave account and associated data.",
);

export function sendPrivacyPage(res: Response): void {
  sendPublicHtml(res, PRIVACY_HTML);
}

export function sendDataDeletionPage(res: Response): void {
  sendPublicHtml(res, DATA_DELETION_HTML);
}

export function sendTermsPage(res: Response): void {
  sendPublicHtml(res, TERMS_HTML);
}

export function sendCsaePage(res: Response): void {
  sendPublicHtml(res, CSAE_HTML);
}

router.get("/privacy", (_req, res) => {
  sendPrivacyPage(res);
});

router.get("/terms", (_req, res) => {
  sendTermsPage(res);
});

router.get("/csae", (_req, res) => {
  sendCsaePage(res);
});

router.get("/data-deletion", (_req, res) => {
  sendDataDeletionPage(res);
});

// Play Console aliases — same HTML, stable for store crawlers.
router.get("/account-deletion", (_req, res) => {
  sendDataDeletionPage(res);
});
router.get("/delete-account-data", (_req, res) => {
  sendDataDeletionPage(res);
});

export default router;
