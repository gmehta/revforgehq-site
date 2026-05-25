# RevForgeHQ — Marketing Site

Single-page static site for [RevForgeHQ](https://www.revforgehq.com) — AI consulting for revenue operations. Hosted on Cloudflare Pages, source on GitHub.

**Stack:** Plain HTML + CSS + JS. No build step. Contact form powered by [Web3Forms](https://web3forms.com).

---

## Local preview

From this directory:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

---

## Project structure

```
/
├── index.html        # Single-page site (hero, approach, capabilities, contact)
├── styles.css        # Distyl-inspired dark theme
├── script.js         # Nav, scroll animations, Web3Forms AJAX submit
├── thank-you.html    # Fallback redirect target after form submit
├── favicon.svg       # Triad mark (from assets/brand/svg/mark-light.svg)
├── assets/brand/     # Logo pack — svg/ for web, png/ for social & exports
├── bimi/
│   ├── bimi-logo.svg # BIMI-compliant logo (SVG Tiny PS) — hosted for email
│   ├── dns-records.txt # Copy-paste DNS values for Cloudflare + Zoho
│   └── vmc.pem       # Add after VMC purchase (not in repo until issued)
├── _headers          # Cloudflare Pages MIME types for BIMI assets
└── RevForgeHQ.md     # Internal business context (not linked from site)
```

---

## Editing copy

All public content lives in `index.html`. Update section text directly — no CMS or build step required.

---

## Cloudflare Pages deployment

### 1. Push to GitHub (one-time setup)

Git is initialized locally with `main` as the default branch. Remote is set to `https://github.com/gmehta/revforgehq-site.git`.

If the repo does not exist yet, create and push:

```bash
cd "/Users/mehtahome/Documents/Claude/Projects/RevForgeHD"
gh auth login          # choose GitHub.com → HTTPS → authenticate as gmehta
gh repo create revforgehq-site --public --source=. --remote=origin --push
```

If the repo already exists on GitHub:

```bash
git push -u origin main
```

Every subsequent push to `main` triggers a new Cloudflare Pages deploy once connected.

### 2. Connect repository

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. **Create** → **Pages** → **Connect to Git**
3. Authorize GitHub and select **`gmehta/revforgehq-site`**
4. Configure build settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | *(leave empty)* |
| Build output directory | `/` |

5. **Save and Deploy**

Your site will be live at `https://<project-name>.pages.dev` within a minute or two.

### 3. Verify deploy

- Open the `*.pages.dev` URL from the Cloudflare Pages project dashboard
- Scroll through all sections
- Submit the contact form with a test message — you should receive an email via Web3Forms

---

## Custom domain (Namecheap → Cloudflare)

Target: **www.revforgehq.com** (canonical) + apex **revforgehq.com**.

### Phase 1 — Add domain to Cloudflare

1. In Cloudflare: **Add a site** → enter `revforgehq.com` → choose **Free** plan
2. Cloudflare shows two nameservers (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
3. Copy both nameserver hostnames

### Phase 2 — Update Namecheap nameservers

1. Log in to [Namecheap](https://www.namecheap.com)
2. **Domain List** → `revforgehq.com` → **Manage**
3. **Nameservers** → **Custom DNS**
4. Paste the two Cloudflare nameservers → **Save**
5. Wait for propagation (usually minutes; can take up to 24 hours)

### Phase 3 — Attach domain to Pages

1. Cloudflare Dashboard → **Workers & Pages** → your Pages project
2. **Custom domains** → **Set up a custom domain**
3. Add both:
   - `www.revforgehq.com`
   - `revforgehq.com`
4. Cloudflare auto-creates DNS records and provisions SSL

### Phase 4 — Canonical redirect

In **Custom domains**, set **www.revforgehq.com** as the primary domain so apex redirects to www (or vice versa — pick one canonical URL).

The contact form redirect in `script.js` uses a relative `thank-you.html` path for AJAX success. The hidden `redirect` field is set dynamically to the current origin, so it works on both `*.pages.dev` and the custom domain without code changes.

---

## Contact form

- **Provider:** Web3Forms
- **Access key:** configured in `index.html` (public by design)
- **Fields:** name, email, company (optional), message
- **Spam protection:** honeypot field (`botcheck`)
- **UX:** AJAX submit with inline success/error banner; `thank-you.html` available as fallback redirect

To harden for production, enable Web3Forms **Restrict to Domain** once `revforgehq.com` is live.

---

## Email authentication & BIMI (Zoho Mail)

Outbound mail uses **Zoho Mail**. BIMI (Brand Indicators for Message Identification) displays your logo — and with a VMC, a blue verified checkmark — in supporting inboxes.

### Hosted BIMI assets

After deploy, the logo is available at:

`https://www.revforgehq.com/bimi/bimi-logo.svg`

After you obtain a VMC from DigiCert or Entrust, add `bimi/vmc.pem` to the repo and push. It will be served at:

`https://www.revforgehq.com/bimi/vmc.pem`

### DNS records (Cloudflare)

Copy-paste values are in **`bimi/dns-records.txt`**. Summary:

| Step | Record | Name | When |
|------|--------|------|------|
| 1 | DMARC TXT | `_dmarc` | Now — start with `p=none`, move to `p=quarantine` before BIMI |
| 2 | BIMI TXT | `default._bimi` | After VMC is deployed |

**Current status (checked via DNS):** SPF and DKIM are configured; DMARC and BIMI records are not yet published.

### VMC requirement

Zoho Mail and Gmail require a **Verified Mark Certificate (VMC)** for the blue checkmark. This needs a **registered trademark** on your logo. Order from [DigiCert](https://www.digicert.com/tls-ssl/verified-mark-certificates) or Entrust once DMARC is at `p=quarantine` or `p=reject`.

Zoho BIMI docs: [Advanced email configuration](https://www.zoho.com/mail/help/adminconsole/advanced-security-configuration.html)

---

## License

Private — © RevForgeHQ.
