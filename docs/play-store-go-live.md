# SameWave — Play Store go-live checklist

This is the full path from "RevenueCat is wired in code" to "real users on
Google Play can buy SameWave Pro for £1." Work top-to-bottom; each section
is a dependency of the next.

---

## Part 1 — Set up the £1 product on Play

### Google Play Console

1. Open Play Console → **SameWave** app → **Monetise → Products → In-app
   products** → "Create product".
2. Product ID: `samewave_pro` — **must** match exactly. This is the SKU
   the seed script wired into RevenueCat.
3. Name: `SameWave Pro`
   Description: `Lifetime unlock — clean share cards and full-size photo
   layout.`
4. Default price: **£1.00 GBP**. Play auto-fills localised prices for every
   country. Spot-check US ($1.29) and Eurozone (€1.19) and round if you
   want.
5. Save and **Activate**. The product must be active — an inactive product
   makes RevenueCat's offering look empty and the paywall button silently
   no-ops.

### Google Cloud — service account so RevenueCat can verify purchases

6. Play Console → **Setup → API access** → "Create new service account".
   This bounces you into Google Cloud.
7. Name: `revenuecat-samewave`. No project role needed. Create.
8. On the new service account in Cloud → **Keys** → **Add key** → **JSON**
   → download the `.json` file. Keep it private.
9. Back in Play Console → **API access** → find the service account in
   the list → **Grant access** → permissions:
   - Financial data, orders, and cancellation survey responses
   - Manage orders and subscriptions
   Apply.

### RevenueCat dashboard

10. Open RevenueCat → **SameWave** project → **Play Store** app →
    **Service Credentials** → upload the JSON from step 8. Save.
11. Same screen, scroll to Products → confirm `samewave_pro` appears and is
    attached to the `lifetime` package on the `default` offering. (The
    seed script already linked it — this is just a sanity check.)

---

## Part 2 — Wider testing on Google Play

You don't have to publish to production to get the £1 flow into other
people's hands. Play has three test tracks; each is a separate release in
Play Console with its own list of testers.

### Important rule for new personal Play developer accounts

If your Play Console account was created as a **personal account** after
November 2023, Google requires you to run a **closed test with at least 12
testers for 14 continuous days** before you're eligible to publish to the
production track. Organisation-type accounts skip this. If you're a
personal account, plan for the closed-test step below — there's no shortcut.

### Tester groups — the easy way

Rather than typing each tester's Gmail into Play, set up a **Google Group**
once and add testers to the group. Then in Play you only have to add one
"Email list" (the group). Future tester additions/removals happen in the
group, not in Play.

1. https://groups.google.com → Create group → name it `samewave-testers` →
   set "Who can join" to **Invited users only** so randoms can't self-add.
2. Invite friends/family by Gmail. They have to **accept** the invite
   before Play recognises them as a tester.

### Track 1 — Internal testing (start here)

Best for: 1–100 known testers. Rolls out in minutes, no Play review.

1. Build a signed Android App Bundle:
   ```
   eas build --platform android --profile production
   ```
   This produces a `.aab`. The `production` profile is correct here —
   Play tracks all need a release build, not an APK.
2. Play Console → **Test and release → Testing → Internal testing** →
   **Create new release** → upload the `.aab` → fill in the release notes
   (one short line is fine) → Save → Review → **Start rollout**.
3. Same screen → **Testers** tab → **Create email list** → name
   `samewave-internal` → paste the Google Group email (or individual
   Gmails) → Save.
4. Copy the **opt-in URL** at the bottom of the Testers tab and send it to
   your testers. They open it on Android, tap "Become a tester", then
   install SameWave from the Play Store as normal.

Internal testers get the live £1.00 Play Billing sheet. License-test
accounts (Setup → License testing) can buy without being charged.

### Track 2 — Closed testing (the 12-tester requirement track)

Best for: dozens to thousands of testers, and the track that satisfies
Google's 14-day requirement.

1. Same release flow as internal testing, but choose **Closed testing →
   Create track** → name it e.g. `Beta`.
2. Add the same Google Group as the email list (or a wider one — the
   12-tester rule wants 12 **opted-in** testers, not 12 invited).
3. After 14 continuous days with at least 12 opted-in testers, the
   production track unlocks.

Closed releases go through Play review (usually a few hours, sometimes a
day or two). Subsequent updates to the same closed track are typically
auto-approved.

### Track 3 — Open testing (skip unless you want public opt-in)

Anyone with the opt-in URL can install. Useful pre-launch if you want
public beta feedback. Same release flow; the opt-in URL is shareable.

### Production

Once the closed-test requirement is met (or immediately if you're an
organisation account), promote a release from any test track to
**Production** with one click. Production releases go through Play review
on the way out.

---

## Part 3 — Sanity-check before each release

- App version code in `artifacts/same-same/app.json` is **higher** than
  the previous release. Play rejects same-or-lower codes.
- The `.aab` is signed with the upload key Play already knows about. EAS
  manages this automatically as long as you keep using the same EAS
  account.
- A test purchase on the new build flips the watermark off and shows the
  stacked-photo layout on the reveal screen.
