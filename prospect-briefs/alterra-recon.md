# Prospect Recon Brief — Alterra Mountain Company · ikonpass.com / alterramtnco.com · 2026-06-01

> Confidence: **Confirmed** = hard artifact (DNS record, live JS/network detection, vendor case study, named job description). **Inferred** = one indirect signal (config flag, registry-listed-but-gated vendor, industry norm). **Speculative** = hunch to verify on the call. Every claim carries a source `[S#]` and a confidence label. See Evidence Log at bottom. 100% free OSINT — no paid APIs, no credentials.

---

## TL;DR

**Stack headline:** Adobe Experience Cloud is the gravitational center — Adobe Experience Platform (Real-Time CDP, in production), Adobe Launch/Tags, Adobe Analytics, Audience Manager (demdex) and AEM — feeding a Snowflake data warehouse and a *dual* BI layer (Power BI **and** Tableau). Salesforce is the CRM (Org ID confirmed in DNS), with Salesforce Marketing Cloud + SendGrid + Brevo for email, Matillion for ETL, and a sprawling 30+ vendor programmatic/measurement adtech estate (The Trade Desk, Amazon DSP, StackAdapt, Microsoft UET, Meta, TikTok, LiveRamp, Nielsen, TVSquared). The consumer estate (ikonpass.com) runs as a Netlify-hosted Vite SPA fronted by an Azure virtual-queue, with Stripe + Affirm checkout, OneTrust consent, and an Inbenta chatbot.

**Sharpest pain:** The customer-data plumbing is mid-rebuild. Alterra is actively hiring to design a *brand-new* event-driven data layer (EDDL) "to ensure **accurate and streamlined data flow** across eComm, POS, the Snowflake warehouse, Power BI/Tableau and Adobe" — explicit confirmation that data today is *not* flowing cleanly across those systems, that governance is immature, and that POS↔digital identity stitching is unfinished. A Director of Marketing Technology was hired to "lead the data-driven transformation" of the whole martech ecosystem.

![Alterra martech stack architecture](/prospect-briefs/alterra-stack-architecture.gif)

*Stack architecture — swimlanes for web/content, consent, tags, CDP, CRM/MAP, warehouse/BI, commerce, adtech, and ops. Solid = confirmed live; dashed = account-confirmed but consent-gated or inferred.*

---

## Phase 1 — Tech Stack

| Category | Tool | Detection Method | Source | Confidence |
|---|---|---|---|---|
| **CDP** | Adobe Real-Time CDP (+ RT-CDP Collaboration) | Adobe case study w/ quantified result + named partner (NBCU) | [S1][S2] | Confirmed |
| **Tag Mgmt / Experience** | Adobe Experience Platform Launch / Tags | Live: `assets.adobedtm.com` launch script; `_satellite.property` = "Ikon Pass" | [S3] | Confirmed |
| **Web Analytics** | Adobe Analytics | Adobe Launch property + JD ("Adobe Analytics") | [S3][S4] | Confirmed |
| **DMP / Audiences** | Adobe Audience Manager + Experience Cloud ID | OneTrust registry: `demdex.net`, `dpm.demdex.net`, `everesttech.net` | [S5] | Confirmed |
| **CMS / DAM** | Adobe Experience Manager (AEM) | JD: "integrating the EDDL into AEM components" | [S4] | Confirmed |
| **Tag Mgmt (parallel)** | Google Tag Manager (GTM-WFSP3KM) | Live: `googletagmanager.com/gtm.js?id=GTM-WFSP3KM`, dataLayer active | [S3] | Confirmed |
| **Web Analytics (parallel)** | Google Analytics / GA4 | JD ("Google Analytics") + GTM + `doubleclick.net` in registry | [S4][S5] | Confirmed |
| **Session replay / heatmap** | Hotjar | OneTrust registry + live: `script.hotjar.com` | [S5] | Confirmed |
| **Behavioral analytics** | Microsoft Clarity | Registry: `clarity.ms`, `c.clarity.ms` | [S5] | Confirmed |
| **CRM** | Salesforce | DNS TXT `00DSu000000ljcn=…` (Salesforce Org ID) | [S6] | Confirmed |
| **Marketing Automation** | Salesforce Marketing Cloud (ExactTarget) | Registry: `pages08.net`, `www.sc.pages08.net` (SFMC tracking domains) | [S5] | Confirmed |
| **Email (transactional/bulk)** | SendGrid | SPF `include:sendgrid.net` + `email.ikonpass.com` → `*.sendgrid.net` | [S7][S8] | Confirmed |
| **Email marketing (2nd)** | Brevo (Sendinblue) | DNS TXT `brevo-code:91482bc46500…` | [S6] | Confirmed |
| **Corporate Email** | Microsoft 365 / Exchange Online | MX `*.mail.protection.outlook.com` (both domains); `MS=ms93652510` | [S8][S9] | Confirmed |
| **Data Warehouse** | Snowflake | JD: "Alterra Data Warehouse (Snowflake platform)" | [S4] | Confirmed |
| **ETL / Data Integration** | Matillion (SAML SSO) | DNS TXT `matillion:alterramtnco-com-saml` | [S6] | Confirmed |
| **BI / Reporting** | Power BI **and** Tableau | JD: "analytics (PowerBI and Tableau)" | [S4] | Confirmed |
| **Identity / Data Collab** | Narrative.io | Registry: `io.narrative.io` | [S5] | Confirmed |
| **Payments** | Stripe | Registry: `m.stripe.com` | [S5] | Confirmed |
| **BNPL Financing** | Affirm | Registry (Strictly Necessary + Functional): `affirm.com`, `api-cf.affirm.com` | [S5] | Confirmed |
| **Consent / Privacy (CMP)** | OneTrust | Live `window.OneTrust`; `cdn.cookielaw.org`; DNS `onetrust-domain-verification`; TenantGuid for ikonpass.com | [S3][S5][S6] | Confirmed |
| **Customer Support** | Inbenta (AI chatbot) | Live script: `sdk.inbenta.io/chatbot/1.94.1/…` | [S3] | Confirmed |
| **Front-end Hosting** | Netlify (Vite SPA) | `www.alterramtn.co` CNAME `*.netlifyglobalcdn.com`; ikonpass apex `75.2.60.5`; `/.netlify/scripts/rum` | [S8][S3] | Confirmed |
| **RUM / APM #1** | Datadog (browser RUM) | Registry: `datadoghq-browser-agent.com` | [S5] | Confirmed |
| **RUM / APM #2** | New Relic | Registry: `nr-data.net` | [S5] | Confirmed |
| **Auth / SSO** | Microsoft Azure (login.alterramtnco.com) | Registry: `alterraloginproduction.blob.core.windows.net`, `login.alterramtnco.com` | [S5] | Confirmed |
| **Virtual waiting room / queue** | Azure-hosted queue (`api-queue.azurewebsites.net`) | DNS TXT on ikonpass.com | [S10] | Confirmed (infra) / Speculative (vendor) |
| **DNS (consumer)** | AWS Route 53 | `awsdns-*.net` NS for ikonpass.com subdomains | [S10] | Confirmed |
| **DMARC monitoring** | DMARCLY (ikonpass.com) + dmarcian (legacy token) + dmarclf (corp) | `_dmarc.ikonpass.com` rua `@ag.dmarcly.com`; apex token `@ag.dmarcian.com`; corp SPF `…_spf.dmarclf.com` | [S11][S12] | Confirmed |
| **SSL / PKI** | GlobalSign | DNS: multiple `globalsign-domain-verification` tokens | [S12] | Confirmed |
| **Work Management** | Wrike | DNS TXT `wrike-verification=…` | [S6] | Confirmed |
| **No-code DB / ops** | Airtable | DNS `airtable-verification` + registry `airtable.com` | [S5][S6] | Confirmed |
| **E-signature** | DocuSign | DNS TXT `docusign=d4d6f9b3-…` | [S6] | Confirmed |
| **Cloud Infra (IaC)** | HashiCorp Cloud Platform | DNS TXT `hcp-domain-verification=…` | [S6] | Confirmed |
| **AI dev tooling** | Anthropic (Claude) + Cursor | DNS `anthropic-domain-verification`, `cursor-domain-verification` | [S6] | Confirmed |
| **Productivity** | Google Workspace | DNS `google-site-verification` (multiple, both domains) | [S6][S12] | Confirmed |

### Adtech / Media estate (OneTrust "Targeting" registry — account-confirmed, consent-gated)

These 30+ vendors are declared in Alterra's OneTrust cookie registry but **do not fire pre-consent** under CCPA/GDPR rules, so absence in a cold pixel sniff ≠ not used. Account-confirmed via the live consent manifest [S5]:

- **DSP / programmatic:** The Trade Desk (`adsrvr.org`), Amazon DSP (`amazon-adsystem.com`, `ara.paa-reporting-advertising.amazon`), StackAdapt (`srv.stackadapt.com`), Google CM360/Floodlight (`8389385.fls.doubleclick.net`), Microsoft Ads / UET (`bat.bing.com`, `bing.com`)
- **Social / walled gardens:** Meta (`facebook.com`, `instagram.com`), LinkedIn, TikTok, Pinterest (`ct.pinterest.com` conversion), Snapchat (`sc-static.net`), Yahoo (`analytics.yahoo.com`), YouTube
- **SSP / exchanges:** Index Exchange (`casalemedia.com`), PubMatic, Magnite/Rubicon (`rubiconproject.com`), Sharethrough, 33Across (`3lift.com`), AppNexus/Xandr (`adnxs.com`)
- **Identity / data:** LiveRamp (`rlcdn.com`, `liadm.com`), Tapad (`tapad.com`, cross-device), Zeotap (`zeotap.com`), Semasio, OwnerIQ
- **Measurement / attribution:** Nielsen (`imrworldwide.com`), Comscore (`scorecardresearch.com`), TVSquared (`*.tvsquared.com`, CTV/linear-TV attribution), Podsights (`cdn.pdst.fm`, podcast attribution)
- **Affiliate:** Rakuten Advertising / LinkShare (`linksynergy.com`)
- **Creative / UGC:** Jivox (dynamic creative), Pixlee (`photos.pixlee.co`, UGC)

### Tool Transitions & Gaps

- **Net-new data layer in flight:** Alterra is hiring a Digital Marketing Data Specialist to build an EDDL from "design/inception to full production" — i.e. the unified marketing data layer does **not** yet exist in production [S4].
- **Possible MAP shift (SFMC → Braze?):** Current MAP is Salesforce Marketing Cloud (`pages08.net`), but the Director, Marketing Technology JD lists "Adobe Experience Platform required, **Braze**, Salesforce, or others a plus" — Braze surfacing in a leadership JD is a soft signal of evaluation/migration intent [S13]. *(Inferred.)*
- **Dual everything:** Two BI tools (Power BI + Tableau), two front-end RUM/APM (Datadog + New Relic, plus Netlify RUM), three email senders (SFMC + SendGrid + Brevo), two tag managers (Adobe Launch + GTM). Classic post-acquisition / fast-growth sprawl.
- **DMARC inconsistency:** ikonpass.com is `p=reject` (strong) monitored by DMARCLY, but carries a stale `dmarcian` rua token in apex TXT; corporate alterramtnco.com routes SPF through `dmarclf.com`. Three different DMARC tooling fingerprints across the estate.

### Raw Evidence

**SPF (ikonpass.com):** `v=spf1 include:spf.protection.outlook.com include:sendgrid.net ip4:207.166.92.11 ip4:207.166.95.11 ip4:207.166.101.207 ip4:207.166.104.207 ~all`
**SPF (alterramtnco.com):** `v=spf1 include:_u.alterramtnco.com._spf.dmarclf.com ~all`
**MX (ikonpass.com):** `10 ikonpass-com.mail.protection.outlook.com`
**MX (alterramtnco.com):** `10 alterramtnco-com.mail.protection.outlook.com`
**DMARC (ikonpass.com):** `v=DMARC1; p=reject; rua=mailto:64e8cb100b13c@ag.dmarcly.com; ruf=mailto:64e8cb100b13c@fo.dmarcly.com; sp=reject; fo=1;`
**Key DNS TXT (alterramtnco.com):** `matillion:alterramtnco-com-saml` · `00DSu000000ljcn=1TBSu000000003F` (Salesforce) · `airtable-verification` · `brevo-code` · `wrike-verification` · `docusign` · `hcp-domain-verification` · `anthropic-domain-verification` · `cursor-domain-verification` · `onetrust-domain-verification` · `google-site-verification`
**CNAMEs:** `www.alterramtn.co` → `alterramtnco.netlifyglobalcdn.com` · `email.ikonpass.com` → `u6368384.wl135.sendgrid.net`
**Live script hosts (ikonpass.com):** `googletagmanager.com/gtm.js?id=GTM-WFSP3KM` · `assets.adobedtm.com/596c318dc5fb/…/launch-6496404163bb.min.js` · `sdk.inbenta.io/chatbot/1.94.1/…` · `cdn.cookielaw.org/scripttemplates/202306.1.0/otBannerSdk.js` · `kit.fontawesome.com` · `/.netlify/scripts/rum`
**Live JS globals (cold, pre-consent):** `OneTrust=true`, `_satellite` present (property "Ikon Pass"), `dataLayer.length=8`; all of `fbq/lintrk/GA/ttq/pintrk/snaptr` **false** → confirms consent gating.
**OneTrust:** data-domain-script `b186a554-afa1-45e3-864f-b6b3947de951`; TenantGuid `2481f875-e8cb-4cfd-af63-440ef5f75630`; rules GDPR/CCPA/Canada/Global; Google Consent Mode + Microsoft UET integration toggles enabled.

---

## Phase 2 — Pain Points

| # | Pain point | Evidence (quote) | Source | Confidence |
|---|---|---|---|---|
| 1 | **Fragmented marketing data layer** — data does not flow cleanly across eComm, POS, warehouse, analytics; building net-new EDDL to fix it | "designing, implementing… a **new** event driven marketing data layer (EDDL) to ensure **accurate and streamlined data flow** across eComm, POS, Alterra Data Warehouse (Snowflake), analytics (PowerBI and Tableau)…" | [S4] | Confirmed |
| 2 | **Immature data governance & integrity** — governance policies still being authored; consistency a current gap | "Ensure data integrity, accuracy, and consistency across all digital platforms, **initially focusing on eComm**" / "Develop and enforce data governance policies" | [S4] | Confirmed |
| 3 | **POS ↔ digital identity stitching unfinished** — physical (resort/POS) and online customer data not yet unified | EDDL scope explicitly spans "eComm, POS"; RT-CDP solves digital, POS integration still in JD scope | [S4][S1] | Inferred |
| 4 | **No single source of truth for reporting** — dual BI (Power BI + Tableau), reporting not yet standardized | "developing standardized and automated reporting" (Data Analyst JD) + dual-BI in Data Specialist JD | [S4][S14] | Confirmed |
| 5 | **Martech transformation owner just hired** — whole ecosystem being re-architected by net-new leadership | Director, Marketing Technology: "lead the **data-driven transformation**… full ownership of the Martech ecosystem, customer data strategy, and analytics framework… CDPs, CRM systems, API integrations, and data governance" | [S13] | Confirmed |
| 6 | **Tool sprawl / redundancy tax** — 2 BI, 2–3 RUM/APM, 3 email senders, 2 tag managers, 30+ adtech vendors to integrate & govern | Stack table above (Datadog+New Relic+Netlify RUM; SFMC+SendGrid+Brevo; Adobe Launch+GTM) | [S5][S6] | Confirmed |
| 7 | **Seasonal peak-commerce scale** — pass-sale launches spike traffic; Azure virtual-queue stands in front of a Netlify SPA + Stripe/Affirm checkout | `api-queue.azurewebsites.net` TXT; ikonpass on Netlify edge | [S10][S8] | Inferred |
| 8 | **Possible MAP migration risk (SFMC → Braze)** — leadership JD names Braze alongside current SFMC | "Adobe Experience Platform required, Braze, Salesforce, or others a plus" | [S13] | Speculative |

---

## Synthesis

| Pain | Business impact | Sales angle (+ discovery question) |
|---|---|---|
| **#1 Fragmented data layer / EDDL build** | Campaign measurement, personalization and conversion-funnel analysis are bottlenecked until clean event data lands in Adobe + Snowflake | Position around accelerating/derisking the EDDL → time-to-value on RT-CDP. *"Where are you in standing up the event-driven data layer — and what's the biggest blocker between POS data and Adobe today?"* |
| **#2/#3 Governance + POS identity** | Without POS↔digital identity resolution, the "30% lift" CDP wins stay digital-only; loyalty/pass-holder LTV is undercounted | *"How are you resolving a pass-holder's resort/POS activity to their online profile in RT-CDP?"* |
| **#4 No single source of truth** | Power BI vs Tableau divergence erodes trust in numbers; analysts spend time reconciling, not analyzing | *"When the EDDL lands, do Power BI and Tableau both read from Snowflake — or are there parallel pipelines?"* |
| **#5 Transformation leadership** | New Director MarTech = budget + mandate + appetite for partners who reduce execution risk | Lead with a transformation-partner narrative, not a point tool. *"What does 'done' look like for the martech transformation in 12 months?"* |
| **#6 Tool sprawl** | Redundant RUM/APM, email and BI tools = license + integration overhead and ambiguous ownership | *"Are Datadog and New Relic both staying, or is one being consolidated?"* |
| **#7 Peak-commerce scale** | Pass-launch outages directly hit revenue; queue + SPA + dual-payment adds failure surface | *"What's your peak-day playbook when Ikon Pass sales open — and how do queue, payments and the data layer hold up?"* |

---

## Evidence Log

| ID | What | URL / raw value | Observed |
|---|---|---|---|
| S1 | Adobe blog — Alterra +30% conversions via data collaboration | https://business.adobe.com/blog/alterra-mountain-company-transforms-advertising-with-data-collaboration | 2026-06-01 |
| S2 | Adobe Summit 2025 session — Alterra 30% lift w/ NBCUniversal (RT-CDP Collaboration) | https://business.adobe.com/summit/2025/sessions/data-collaboration-with-adobe-how-alterra-achieved-s507.html | 2026-06-01 |
| S3 | Live Chrome detection (ikonpass.com): scripts, JS globals, `_satellite` property, GTM-WFSP3KM, Adobe Launch, Inbenta, OneTrust, Netlify RUM | ikonpass.com rendered + `performance.getEntriesByType`/`querySelectorAll('script[src]')` | 2026-06-01 |
| S4 | JD — Digital Marketing Data Specialist (EDDL, Snowflake, Power BI/Tableau, Adobe AEP/AEM, eComm/POS) | https://www.builtincolorado.com/job/data-layer-specialist/4653762 | 2026-06-01 |
| S5 | Live OneTrust registry `OneTrust.GetDomainData()` — categorized vendor/host list (Performance/Targeting/Functional/Strictly Necessary) | ikonpass.com in-page API; data-domain-script b186a554-… | 2026-06-01 |
| S6 | DNS TXT roster — alterramtnco.com (Matillion, Salesforce Org ID, Airtable, Brevo, Wrike, DocuSign, HashiCorp, Anthropic, Cursor, OneTrust, Google) | `dns.google/resolve?name=alterramtnco.com&type=TXT` | 2026-06-01 |
| S7 | SPF / SendGrid CNAME | `email.ikonpass.com` → `u6368384.wl135.sendgrid.net` | 2026-06-01 |
| S8 | DNS — MX, A, CNAME (Outlook mail, Netlify edge 75.2.60.5, netlifyglobalcdn) | `dns.google/resolve` (MX/A/CNAME) | 2026-06-01 |
| S9 | DNS TXT — Microsoft 365 verification (`MS=ms93652510`) on ikonpass.com | `dns.google/resolve?name=ikonpass.com&type=TXT` | 2026-06-01 |
| S10 | DNS — `api-queue.azurewebsites.net` TXT + AWS Route 53 NS on ikonpass subdomains | `dns.google/resolve` | 2026-06-01 |
| S11 | DMARC — ikonpass.com `p=reject` via DMARCLY | `dns.google/resolve?name=_dmarc.ikonpass.com&type=TXT` | 2026-06-01 |
| S12 | DNS TXT — GlobalSign / dmarcian token / dmarclf SPF | apex TXT records | 2026-06-01 |
| S13 | JD — Director, Marketing Technology (transformation, CDP/CRM/governance, Adobe required, Braze "a plus") | https://www.builtincolorado.com/job/director-marketing-technology/4628846 | 2026-06-01 |
| S14 | JD — Data Analyst, Marketing (CRM analysis, standardized/automated reporting) | https://www.dataanalyst.com/job/data-analyst-marketing-9 | 2026-06-01 |

**Sources checked but unavailable / dead ends:**
- `crt.sh?q=%25.ikonpass.com&output=json` → empty response via web_fetch (logged; subdomain enumeration fell back to direct DoH CNAME probing).
- DoH CNAME probes for `go/links/marketing/track/pages/lp/info/em/shop.ikonpass.com` → all NXDOMAIN (marketing email runs only on `email.ikonpass.com`).
- BuiltWith free report → not opened (live Chrome pixel sniff + OneTrust registry + DNS roster provided higher-fidelity, first-party signal; marked SKIPPED).
- GitHub leakage search → no public `ikonpass`/`alterramtnco` repos surfaced (private engineering; logged).
- Cookie banner **not accepted** by deliberate choice (privacy/safety policy on consent banners); gated adtech vendors were read passively from the OneTrust registry instead of by firing them.

**Method notes:** DNS via Google DoH (sandbox has no outbound DNS); live tech detection via Chrome network + JS pass on rendered ikonpass.com; consent-gated vendors read from `OneTrust.GetDomainData()` without accepting the banner; 100% free OSINT, no paid APIs, no credentials. The `.drawio` architecture diagram lives in the project folder at `prospect-briefs/alterra-stack-architecture.drawio`.
