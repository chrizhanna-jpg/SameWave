# SameWave / Echo — Trade Secret Policy

**Status:** Internal — Confidential  
**Owner:** Founder / operator of SameWave (Echo)  
**Last updated:** May 2026  
**Contact:** samewaveripple@gmail.com

This policy explains how we protect non-public information that gives SameWave a business advantage. It is **not** legal advice. Have a qualified lawyer review it for your jurisdiction (UK / EU / US as applicable).

---

## 1. Purpose

SameWave’s competitive advantage includes, without limitation:

- Photo-matching and ranking logic (themes, tags, subjects, shapes, vibes, scoring weights)
- Ripple / Wave / Atlas (“Wavefire”, “Ripplefire”) clustering and explore flows
- Push-notification and mutual-match mechanics
- Moderation, retention, and anti-abuse rules
- Product roadmap, pricing, and growth experiments not yet public

Information in these categories is treated as **trade secrets** while it is **not generally known** and we use **reasonable steps** to keep it secret.

---

## 2. What counts as a trade secret here

Protected information includes:

- Source code and algorithms not visible to end users
- Internal design documents, diagrams, and product specs
- Datasets, seed scripts, and non-public analytics
- Business plans, financial models, and investor materials
- Unreleased feature specs and A/B test plans

**Not trade secrets:** what users already see in the public app, marketing copy, published store listings, and information you intentionally disclose under NDA or in a pitch with clear confidentiality terms.

---

## 3. Reasonable measures (what we do)

| Measure | Requirement |
|--------|-------------|
| **Private repository** | GitHub (or other) repo stays **private** unless counsel approves a public open-source release. |
| **Access control** | Only people who need access get it; remove access when work ends. |
| **Confidential marking** | Internal docs start with: `CONFIDENTIAL — SameWave trade secret. Do not distribute.` |
| **NDAs** | Contractors, advisors, and collaborators sign an NDA **before** seeing algorithms, roadmap, or business model. See `COLLABORATOR_NDA_TEMPLATE.md`. |
| **No public “secret sauce” posts** | Do not publish matching formulas, SQL, scoring code, or architecture that reveals the inner mechanics. |
| **Secure comms** | No trade-secret content in public Slack/Discord channels, tweets, or unlisted-but-shareable Google Docs. |
| **Employee / founder discipline** | Laptops encrypted; don’t share screen recordings of internal tools publicly. |

---

## 4. Launch does **not** destroy trade secrets

Shipping to TestFlight, closed testing, or the Play Store is allowed. Users see **behavior**, not **implementation**.

We protect secrets by **not publishing**:

- Detailed algorithm write-ups
- Full scoring source or database schemas in public repos
- Internal playbooks that describe how to replicate the system

Copyright covers **code**; trademarks cover **brand**; trade-secret law covers **confidential know-how** that stays confidential.

---

## 5. Incident response

If confidential information may have leaked (lost laptop, wrong repo visibility, email to wrong person):

1. Contain (revoke access, make repo private, rotate keys).
2. Document what was exposed, when, and to whom.
3. Contact legal counsel if exposure is material.
4. Update this policy if a process failed.

---

## 6. Retention

Keep timestamped records that support trade-secret status, for example:

- Dated internal design emails or documents
- Signed NDAs
- Private repo creation / access logs

---

## 7. Related documents

- `COLLABORATOR_NDA_TEMPLATE.md` — mutual NDA for collaborators  
- `TRADE_SECRET_STATUS.md` — checklist and current status  
- Public: Privacy / Terms / CSAE on the API (`/api/privacy`, `/api/terms`, `/api/csae`)

---

*By working on SameWave you agree to follow this policy. Questions: samewaveripple@gmail.com*
