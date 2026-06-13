# Sahaj Sunn

**सहज सुनो · Listen effortlessly**

Kabir's songs read for meaning, and a self-inquiry operating system to live what they point to.

**Live site:** [sahajsunn.com](https://sahajsunn.com)

---

## What this is

A static multi-page site with one serverless backend function. No framework, no build step. Every page is a plain `.html` file; the backend is a single Cloudflare Pages Function that securely proxies calls to the Claude API.

| Page | Route | What it is |
|---|---|---|
| `index.html` | `/` | Home hub — nav, feature cards, thesis |
| `songs.html` | `/songs` | Songs of the Soul — eight Kabir songs |
| `inner-os.html` | `/inner-os` | The Inner OS — nine-layer architecture |
| `inner-os-live.html` | `/inner-os-live` | Live inquiry — AI-powered, calls the API |
| `functions/api/inquire.js` | `POST /api/inquire` | Secure Claude proxy + rate limiting |

---

## Project structure

```
sahaj-sunn/
├── index.html
├── songs.html
├── inner-os.html
├── inner-os-live.html
├── functions/
│   └── api/
│       └── inquire.js        ← serverless function (never expose key here)
├── .dev.vars                  ← local secrets (never commit this)
├── .gitignore
├── wrangler.toml
└── README.md
```

---

## Adding a new feature

Open `index.html` and find the `FEATURES` array near the top of the `<script>` block. Add one entry:

```js
{
  glyph: "ध्यान",
  title: "Daily Verse",
  href: "/daily",
  desc: "One verse each morning, with a reflection.",
  status: "live",     // "live" or "soon"
  nav: "Daily"
}
```

- `status: "live"` → create `daily.html` and upload it. The nav link and card appear automatically.
- `status: "soon"` → no file needed. Cloudflare serves the built-in coming-soon screen at that route.

---

## Local development

### Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — Cloudflare's local dev tool

```bash
npm install -g wrangler
```

### 1. Clone / download the project

```bash
git clone https://github.com/sachinndhimann/sahaj-sunn.git
cd sahaj-sunn
```

Or just copy your five files into a folder called `sahaj-sunn`.

### 2. Create the wrangler config

Create `wrangler.toml` in the project root:

```toml
name = "sahaj-sunn"
compatibility_date = "2024-01-01"
pages_build_output_dir = "."

# KV binding for rate limiting (only needed locally if you want to test rate limits)
# You can skip this block for basic local testing — the function works without it
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_KV_NAMESPACE_ID"          # paste from Cloudflare dashboard
preview_id = "YOUR_KV_NAMESPACE_ID"  # same value is fine for local dev
```

If you don't have a KV namespace ID yet, leave the `[[kv_namespaces]]` block out. The live inquiry will work without it — it just won't enforce rate limits locally.

### 3. Create the local secrets file

Create `.dev.vars` in the project root (Wrangler loads this automatically):

```
ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
```

Get your key from [console.anthropic.com](https://console.anthropic.com) → API keys → Create key.

### 4. Add .gitignore

Create `.gitignore`:

```
.dev.vars
node_modules/
.wrangler/
```

**Never commit `.dev.vars`.** It contains your API key.

### 5. Run locally

```bash
wrangler pages dev .
```

Wrangler will print a local URL, usually `http://localhost:8788`. Open it in your browser.

All five pages and the `/api/inquire` function run locally. The function reads `ANTHROPIC_API_KEY` from `.dev.vars`.

**To test a specific page directly:**
- `http://localhost:8788/` — Home
- `http://localhost:8788/songs` — Songs
- `http://localhost:8788/inner-os` — Architecture
- `http://localhost:8788/inner-os-live` — Live inquiry
- `http://localhost:8788/api/inquire` — API (POST only)

---

## Cloudflare deployment

### First-time setup (do this once)

**Step 1 — Push to GitHub**

Create a new GitHub repository (public or private, either works):

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sahaj-sunn.git
git push -u origin main
```

**Step 2 — Connect to Cloudflare Pages**

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → sign in → **Create a project → Connect to Git**
2. Authorise GitHub and select the `sahaj-sunn` repository
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: *(leave blank or put `.`)*
4. Click **Save and Deploy**

Your site is now live at `your-project.pages.dev`.

**Step 3 — Add the API key as a secret**

In your Pages project → **Settings → Environment variables → Add variable:**

| Variable name | Value | Type |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | **Secret** (click Encrypt) |

Click **Save** then **Redeploy** for the key to take effect.

**Step 4 — Create the rate-limit KV namespace**

This is what counts and caps requests per IP. Skip this if you want to launch without rate limiting.

1. In the Cloudflare dashboard sidebar → **Workers & Pages → KV**
2. Click **Create namespace** → name it `sahaj-rate` → **Add**
3. Copy the namespace ID shown (you'll need it for Step 5 and `wrangler.toml`)

**Step 5 — Bind the KV namespace to your Pages project**

Back in your Pages project → **Settings → Functions → KV namespace bindings → Add:**

| Variable name | KV namespace |
|---|---|
| `RATE_LIMIT` | `sahaj-rate` |

Click **Save** then **Redeploy**.

**Step 6 — Attach your custom domain**

1. Pages project → **Custom domains → Set up a custom domain**
2. Type `sahajsunn.com` → Continue
3. Then repeat for `www.sahajsunn.com`

Since your domain is already managed by Cloudflare Registrar, DNS and SSL connect instantly.

---

## Deploying updates

### Via GitHub (recommended)

```bash
git add .
git commit -m "update: describe what changed"
git push
```

Cloudflare detects the push and redeploys automatically, usually in under 60 seconds.

### Via direct upload (no Git)

In your Pages project → **Deployments → Upload assets** → drag your updated files in.

---

## Rate limiting

The live inquiry is rate-limited per IP address using Cloudflare KV:

| Window | Limit | Change in |
|---|---|---|
| Per hour | 8 requests | `PER_HOUR` at top of `functions/api/inquire.js` |
| Per day | 200 requests | `PER_DAY` at top of `functions/api/inquire.js` |

When someone hits the cap, they see a friendly message with how many minutes until the window resets. The limits only apply when the `RATE_LIMIT` KV binding is set. Without it, the function runs without limiting.

---

## Costs

| What | Cost |
|---|---|
| Cloudflare Pages hosting | Free forever |
| Custom domain (sahajsunn.com) | ~₹800–1,000 / year |
| Cloudflare KV (rate limiting) | Free up to 100k reads + 1k writes / day |
| Claude API (per live inquiry) | ~$0.001–0.003 per run (Sonnet 4.6) |

The AI cost is the only variable. At the current rate limit of 8/hour per IP, and assuming moderate traffic, expect ₹100–500/month for the API unless the site sees thousands of daily users.

---

## Tech stack

| Layer | What |
|---|---|
| Hosting | Cloudflare Pages (static) |
| Backend | Cloudflare Pages Functions (Edge, no server) |
| Rate limiting | Cloudflare KV |
| AI | Anthropic Claude Sonnet 4.6 |
| Fonts | Google Fonts — Fraunces, Spectral, DM Mono, Tiro Devanagari Hindi |
| Build | None — plain HTML, CSS, vanilla JS |

---

## Sahaj Sunn brand

- **Domain:** sahajsunn.com
- **Instagram:** @sahajsunn
- **YouTube:** Sahaj Sunn
- **Dark theme (Vat):** default — deep indigo `#181f33`, marigold `#e7ad4d`
- **Light theme (Khadi):** opt-in — warm cream `#f0e8d6`, dark walnut `#1e1810`

Theme preference persists across pages via `localStorage` (`ss-theme`).

---

## Pages linked to from the book

The Songs page (`/songs`) links to each song's YouTube recording. All links use direct `youtu.be` short URLs and open in a new tab.

---

## Contact

sachindhiman1@live.in
