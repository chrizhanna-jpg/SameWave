import { Router, type IRouter } from "express";

const router: IRouter = Router();

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

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Echo</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;

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
  <p>Questions or deletion requests: <a href="mailto:twin2win.support@gmail.com">twin2win.support@gmail.com</a></p>

  <hr />
  <p class="meta"><a href="/terms">Terms of Service</a></p>
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
  <p><a href="mailto:twin2win.support@gmail.com">twin2win.support@gmail.com</a></p>

  <hr />
  <p class="meta"><a href="/privacy">Privacy Policy</a></p>
  `,
);

router.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(PRIVACY_HTML);
});

router.get("/terms", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(TERMS_HTML);
});

export default router;
