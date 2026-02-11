# Shopify Autopilot Tools

A collection of **12 standalone tools** for automating Shopify dropshipping stores. Each tool is a single, self-contained ES Module file — copy it into your project, install the dependencies, set your env vars, and you're good to go.

Built with Node.js, Claude AI, and battle-tested on real stores.

---

## Quick Start

```bash
# 1. Copy any tool file into your project
cp tools/ai-product-optimizer.js your-project/

# 2. Install its dependencies (listed at the top of each file)
npm install @anthropic-ai/sdk dotenv

# 3. Set your env vars
echo "ANTHROPIC_API_KEY=sk-ant-xxx" >> .env

# 4. Import and use
import { optimizeDescription } from './ai-product-optimizer.js';
const html = await optimizeDescription({ title: 'Cozy Blanket', price: 29.99 });
```

---

## The Tools

### Database

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **PG Query Builder** | `pg-query-builder.js` | `pg` | Supabase-compatible chainable query builder for any PostgreSQL database. Drop-in replacement for the Supabase JS client. |

### Shopify

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **Shopify Sync** | `shopify-sync.js` | `shopify-api-node`, `pg` | Sync products & orders from Shopify to PostgreSQL. Create products, manage images, push descriptions. |

### AI-Powered (Claude)

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **Product Optimizer** | `ai-product-optimizer.js` | `@anthropic-ai/sdk` | Score product listings (0-10 on 7 factors), generate conversion-optimized descriptions, SEO metadata, and store audits. |
| **Product Research** | `ai-product-research.js` | `@anthropic-ai/sdk`, `axios` | AI product discovery with supplier pricing, trend analysis, Google Trends integration, and supplier cost lookups. |
| **Ad Generator** | `ai-ad-generator.js` | `@anthropic-ai/sdk` | Generate ad copy for Facebook, Instagram, Google Ads, and TikTok. Multiple hook angles per variant for A/B testing. |
| **Customer Service** | `ai-customer-service.js` | `@anthropic-ai/sdk` | Classify tickets, generate AI responses, detect scams. Includes 13 pre-built email templates. |

### Marketing & Ads

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **Meta Ads Manager** | `meta-ads-manager.js` | `axios` | Complete Meta/Facebook Ads API client — create campaigns, ad sets, creatives, track performance, auto-kill underperformers. |
| **Klaviyo Email** | `klaviyo-email.js` | `axios` | Klaviyo API v3 integration with pre-built email flows: abandoned cart, welcome series, post-purchase. |

### Pricing & Research

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **Price Compare** | `price-compare.js` | `axios`, `cheerio`, `@anthropic-ai/sdk` | Scrape Google Shopping & AliExpress for competitor prices. AI-powered pricing recommendations. |
| **Image Search** | `image-search.js` | `axios` | Search Pexels for product images. Free API, returns high-quality square-oriented photos. |

### Monitoring & Automation

| Tool | File | Dependencies | Description |
|------|------|-------------|-------------|
| **Store Monitor** | `store-monitor.js` | `pg` | Daily health checks for orders, products, and ads. Red/yellow/green severity alerts saved to DB. |
| **Cron Scheduler** | `cron-scheduler.js` | `cron` | Lightweight cron framework for scheduling any automation task. Register jobs, start/stop, manual triggers. |

---

## Environment Variables

Every tool reads from a `.env` file (via `dotenv`). Here's the full list across all tools:

```env
# ─── AI (Claude) ──────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-xxx

# ─── Shopify ──────────────────────────────────────────────────
SHOPIFY_STORE_NAME=your-store          # without .myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx

# ─── Database (PostgreSQL) ────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_SSL=true

# ─── Meta/Facebook Ads ───────────────────────────────────────
META_ACCESS_TOKEN=EAAxxxxxx
META_AD_ACCOUNT_ID=act_XXXXXXXXX
META_PAGE_ID=XXXXXXXXX
META_INSTAGRAM_ACCOUNT_ID=XXXXXXXXX   # optional
META_PIXEL_ID=XXXXXXXXX               # optional

# ─── Klaviyo ──────────────────────────────────────────────────
KLAVIYO_API_KEY=pk_xxxxxxxx

# ─── Pexels (free image search) ──────────────────────────────
PEXELS_API_KEY=xxxxxxxxx              # free at pexels.com/api

# ─── Store Context (for AI prompts) ──────────────────────────
STORE_NAME=My Store
STORE_NICHE=Home & Living
TARGET_AUDIENCE=Adults 25-45
BRAND_VOICE=warm and friendly
PRICE_MIN=10
PRICE_MAX=75
PRODUCT_CATEGORIES=Kitchen,Bedroom,Bathroom

# ─── Scheduler ────────────────────────────────────────────────
TIMEZONE=America/New_York
```

You only need the env vars for the tools you're using. Each tool's header documents which vars it needs.

---

## Tool Details

### PG Query Builder

Supabase-compatible query builder that works with **any** PostgreSQL database. Same chainable API — swap out Supabase without changing your code.

```js
import { db } from './pg-query-builder.js';

// Same API as Supabase JS client
const { data, error } = await db.from('products')
  .select('title, price')
  .eq('status', 'active')
  .order('price', { ascending: false })
  .limit(10);

// Insert
await db.from('products').insert({ title: 'New Product', price: 29.99 }).select();

// Update
await db.from('products').update({ price: 24.99 }).eq('id', 1);

// Upsert
await db.from('products').upsert({ id: 1, title: 'Updated' }, { onConflict: 'id' });

// Joins
const { data } = await db.from('orders').select('*, products(title, price)');

// JSON columns
const { data } = await db.from('ads').select('*').eq('performance->status', 'active');
```

### AI Product Optimizer

```js
import { analyzeDescription, optimizeDescription, generateSEO } from './ai-product-optimizer.js';

// Score a product listing
const scores = await analyzeDescription({
  title: 'Bamboo Bath Caddy',
  price: 34.99,
  original_description: '<p>A bath caddy</p>',
  images: [{ src: '...' }],
});
// { overall_score: 3.2, scores: { description_quality: 2, seo_readiness: 3, ... } }

// Generate optimized description
const html = await optimizeDescription(product, {
  tone: 'warm and empathetic',
  targetLength: 'medium',  // short|medium|long
  format: 'html',
});

// Generate SEO metadata
const seo = await generateSEO(product);
// { seo_title, seo_description, suggested_tags, primary_keyword }
```

### Meta Ads Manager

```js
import { metaAds } from './meta-ads-manager.js';

// One-call full campaign builder
const campaign = await metaAds.buildFullCampaign(
  { title: 'Cozy Blanket', handle: 'cozy-blanket', price: 29.99, images: [{ src: '...' }] },
  [{ headline: 'Sleep better tonight', body: 'Our #1 blanket...', cta: 'Shop Now' }],
  { dailyBudget: 15, countries: ['US', 'CA'], autoPublish: false }
);

// Auto-kill bad ads
const optimized = await metaAds.autoOptimizeAds(campaignId, {
  minImpressions: 500,
  maxCpc: 2.0,
  minCtr: 0.5,
});
```

### Cron Scheduler

```js
import { registerJob, startScheduler, getSchedulerStatus } from './cron-scheduler.js';

registerJob('Sync Products', '0 */6 * * *', async () => {
  return await syncProducts();
});

registerJob('Morning Check', '30 6 * * *', async () => {
  return await runDailyCheck();
});

registerJob('Weekly Prices', '0 5 * * 1', async () => {
  return await compareAllPrices();
});

startScheduler();
```

---

## How Each Tool is Self-Contained

Every tool follows the same pattern:

1. **No project imports** — each file is standalone, no `../config` or `../utils` dependencies
2. **Own config** — reads directly from `process.env` via `dotenv`
3. **Own logging** — simple `console.log` with timestamps (no Winston dependency)
4. **Full JSDoc** — every function documented with params and return types
5. **Usage examples** — header block shows exactly how to use it
6. **Listed dependencies** — `REQUIRED PACKAGES` section at the top

Copy any file, install its 1-3 npm packages, and it works.

---

## License

MIT — use these tools however you want. If they help your store make money, that's all the credit we need.
