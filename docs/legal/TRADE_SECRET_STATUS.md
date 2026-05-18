# Trade secret protection — status checklist

Maps to the founder protection plan. Update this file when something changes.

**Legend:** ✅ Done · 🟡 Partial / verify · ⬜ Not done (your action)

---

## Step 1 — Protect the idea internally

| Item | Status | Notes |
|------|--------|--------|
| Store idea docs privately | 🟡 | Policy + NDA template in `docs/legal/`. Keep strategy decks **outside** public folders or in a private drive. |
| Keep repo private | 🟡 | Remote is `github.com/chrizhanna-jpg/SameWave`. **Verify:** GitHub → Settings → General → Danger zone → repository visibility = **Private**. |
| Mark design docs “Confidential” | 🟡 | Use header in `CONFIDENTIAL_DOC_HEADER.txt` on every internal spec. No separate design repo found in-tree yet. |
| Keep timestamped email | ⬜ | **Your action:** Email yourself (or counsel) a dated summary of the idea; keep the thread. |
| Written trade secret policy | ✅ | `TRADE_SECRET_POLICY.md` (this folder). |

---

## Step 2 — Protect when working with others

| Item | Status | Notes |
|------|--------|--------|
| NDA before algorithm access | ⬜ | Use `COLLABORATOR_NDA_TEMPLATE.md`; sign **before** sharing repo or scoring docs. |
| NDA before build help | ⬜ | Same template; limit GitHub access to collaborators only after NDA. |
| NDA before business model | ⬜ | Same; pitch decks without NDA should be high-level only. |
| Enforce confidentiality in Terms | ✅ | Terms include no reverse-engineering / misuse (`/api/terms`). |

---

## Step 3 — Build the app normally

| Item | Status | Notes |
|------|--------|--------|
| Write code | ✅ | Active development in private repo. |
| Build UI | ✅ | SameWave / Echo app in `artifacts/same-same`. |
| Test features | ✅ | Dev + closed-test path documented. |
| Use APIs | ✅ | Clerk, Render, Expo, etc. |
| Deploy TestFlight / Play testing | 🟡 | Android AAB built (`C:\w\app\aab\`); Play closed testing in progress per checklists. |
| Publish Play Store | ⬜ | Not production yet. |
| Code copyright | ✅ | Automatic on creation; keep private repo + commit history. |
| Brand / trademark | ⬜ | **Your action:** Consider UK/EU trademark for “SameWave” / “Echo” when budget allows. |

**None of the above breaks trade secrets** if inner mechanics stay confidential.

---

## Step 4 — Launch publicly

| Item | Status | Notes |
|------|--------|--------|
| Users see product, not formula | 🟡 | OK at launch if you don’t publish algorithms. |
| Public legal pages | ✅ | Privacy, Terms, CSAE, data deletion on API. |
| Trade secret still protected | 🟡 | Depends on Steps 1–2 staying true after launch. |
| Don’t publish “secret sauce” | ✅ | Policy §4; avoid blogging exact scoring/SQL. |

---

## Quick reference

| Document | Path |
|----------|------|
| Trade secret policy | `docs/legal/TRADE_SECRET_POLICY.md` |
| NDA template | `docs/legal/COLLABORATOR_NDA_TEMPLATE.md` |
| This checklist | `docs/legal/TRADE_SECRET_STATUS.md` |
| Confidential header (copy/paste) | `docs/legal/CONFIDENTIAL_DOC_HEADER.txt` |

---

*Last reviewed: May 2026*
