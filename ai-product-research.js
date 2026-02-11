/**
 * ═══════════════════════════════════════════════════════════════════
 *  AI PRODUCT RESEARCH — AI-Powered Product Discovery & Trends
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Uses Claude AI for product research, trend analysis, and supplier
 *  cost lookups. Generates product ideas with realistic AliExpress/CJ
 *  pricing, brand fit scoring, and sourcing URLs.
 *
 *  REQUIRED ENV VARS:
 *    ANTHROPIC_API_KEY=sk-ant-api03-xxx
 *
 *  OPTIONAL ENV VARS:
 *    STORE_NAME=Your Store Name
 *    STORE_NICHE=your niche
 *    TARGET_AUDIENCE=who you sell to
 *    BRAND_VOICE=your tone
 *    PRICE_MIN=10                     (min sell price)
 *    PRICE_MAX=75                     (max sell price)
 *    PRODUCT_CATEGORIES=Kitchen,Bedroom,Bathroom   (comma-separated)
 *
 *  REQUIRED PACKAGES:
 *    npm install @anthropic-ai/sdk axios dotenv
 *
 *  USAGE:
 *    import { runProductResearch, researchTrends,
 *             lookupSupplierCost, bulkSupplierLookup } from './ai-product-research.js';
 *
 *    // Full product research pipeline (generates ideas with pricing)
 *    const research = await runProductResearch({ category: 'Kitchen', maxIdeas: 15 });
 *    // Returns: { total_ideas, products: [{ name, supplier_price_low, suggested_sell_price, margin_percent, ... }], summary }
 *
 *    // Trend analysis
 *    const trends = await researchTrends({ depth: 'deep' });
 *    // Returns: { trending_categories, hot_products, seasonal_opportunities, tiktok_viral, avoid, summary }
 *
 *    // Supplier cost lookup for a specific product
 *    const pricing = await lookupSupplierCost('bamboo bath caddy');
 *    // Returns: { suppliers: [...], recommendation: { landed_cost, suggested_sell_price, margin_percent } }
 *
 *    // Bulk lookup
 *    const results = await bulkSupplierLookup(['bath caddy', 'led mirror', 'neck pillow']);
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

// ─── CONFIG ───────────────────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function getAI() {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY env var is required');
  return anthropic;
}

const store = {
  name: process.env.STORE_NAME || 'My Store',
  niche: process.env.STORE_NICHE || 'General',
  targetAudience: process.env.TARGET_AUDIENCE || 'Online shoppers',
  brandVoice: process.env.BRAND_VOICE || 'friendly and helpful',
  priceRange: {
    min: parseInt(process.env.PRICE_MIN) || 10,
    max: parseInt(process.env.PRICE_MAX) || 75,
  },
  productCategories: (process.env.PRODUCT_CATEGORIES || 'General').split(',').map(c => c.trim()),
};

const MODEL = 'claude-sonnet-4-20250514';

function parseJSON(text) {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{ "products": [] }');
}

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── PRODUCT RESEARCH ─────────────────────────────────────────────

/**
 * Full product research pipeline: AI generates ideas with realistic
 * supplier pricing, search URLs, and brand fit scoring.
 *
 * @param {object} options
 * @param {string} options.category — focus on a specific category
 * @param {number} options.maxIdeas — how many ideas (default 15)
 * @returns {object} — { total_ideas, products, top_picks, summary }
 */
export async function runProductResearch(options = {}) {
  const { category = null, maxIdeas = 15 } = options;

  log('info', `Starting product research for ${store.name}...`);

  const prompt = `You are an expert dropshipping product researcher with deep knowledge of AliExpress, CJ Dropshipping, and Temu supplier pricing. Research ${maxIdeas} products for this store.

STORE: ${store.name}
NICHE: ${store.niche}
BRAND VOICE: ${store.brandVoice}
TARGET AUDIENCE: ${store.targetAudience}
PRICE RANGE: $${store.priceRange.min} - $${store.priceRange.max} (sell price to customer)
CATEGORIES: ${store.productCategories.join(', ')}
${category ? `FOCUS ON: ${category}` : ''}

YOUR TASK:
For each product, provide REALISTIC supplier pricing based on your knowledge of what these items actually cost on AliExpress/CJ Dropshipping.

REQUIREMENTS:
- Products must ACTUALLY exist on AliExpress/CJ (real products, not imagined ones)
- Supplier cost typically $2-$20 — be specific and realistic
- Include the EXACT search term that will find this product on AliExpress
- Score each product 1-10 on brand fit
- Mix: proven best-sellers, rising trend products, hidden gems
- No products over $${store.priceRange.max} sell price

Respond in JSON:
{
  "products": [
    {
      "name": "product name as you'd list it on Shopify",
      "category": "category name",
      "aliexpress_search": "exact search term for AliExpress",
      "supplier_price_low": 0.00,
      "supplier_price_high": 0.00,
      "estimated_shipping": 0.00,
      "landed_cost": 0.00,
      "suggested_sell_price": 0.00,
      "margin_percent": 0,
      "brand_fit_score": 0,
      "brand_fit_reason": "why this fits the brand",
      "trend_status": "best-seller|rising|hidden-gem",
      "competition": "low|medium|high",
      "image_search": "2-3 word photo search term",
      "sourcing_notes": "quality, variants, shipping times",
      "aliexpress_url": "https://www.aliexpress.com/wholesale?SearchText=URL_ENCODED_SEARCH"
    }
  ],
  "research_summary": "2-3 sentences about the overall product opportunity"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const result = parseJSON(response.content[0].text);
  const products = result.products || [];

  const topPicks = products
    .filter(p => p.brand_fit_score >= 7 && p.margin_percent >= 45)
    .sort((a, b) => b.brand_fit_score - a.brand_fit_score);

  log('info', `Generated ${products.length} product ideas`);
  log('info', `Top picks: ${topPicks.length} products with 7+ brand fit & 45%+ margin`);

  return {
    total_ideas: products.length,
    top_picks: topPicks,
    products,
    summary: result.research_summary,
  };
}

// ─── TREND RESEARCH ───────────────────────────────────────────────

/**
 * Research trending products in your niche.
 *
 * @param {object} options
 * @param {string} options.depth — 'quick' (8 products), 'standard' (12), or 'deep' (20)
 * @returns {object} — { trending_categories, hot_products, seasonal_opportunities, tiktok_viral, avoid, summary }
 */
export async function researchTrends(options = {}) {
  const { depth = 'standard' } = options;
  log('info', `Researching trends for ${store.name} (${depth})...`);

  // Try to get real Google Trends data for context
  let trendContext = '';
  try {
    const trendData = await _getGoogleDailyTrends();
    if (trendData.length > 0) {
      trendContext = `\nRECENT GOOGLE TRENDS (for context):\n${trendData.map(t => `- ${t}`).join('\n')}`;
    }
  } catch { /* AI will use its own knowledge */ }

  const productCount = depth === 'quick' ? 8 : depth === 'deep' ? 20 : 12;

  const prompt = `You are a trend analyst specializing in dropshipping and e-commerce. Provide a comprehensive trend report for this store.

STORE: ${store.name} — "${store.niche}"
TARGET AUDIENCE: ${store.targetAudience}
BRAND: ${store.brandVoice}
PRICE RANGE: $${store.priceRange.min}-$${store.priceRange.max}
CATEGORIES: ${store.productCategories.join(', ')}
${trendContext}

Identify ${productCount} specific hot products with real supplier pricing.

Respond in JSON:
{
  "trending_categories": [
    { "category": "name", "trend_direction": "rising|stable|declining", "opportunity_score": 0, "why": "explanation" }
  ],
  "hot_products": [
    {
      "product": "specific product name",
      "category": "which category",
      "why_trending": "what's driving demand",
      "aliexpress_search": "exact search term",
      "supplier_cost": "$X-$Y",
      "suggested_sell": "$X",
      "estimated_margin": "X%",
      "competition": "low|medium|high",
      "brand_fit": "how it fits your brand",
      "urgency": "source now|watch|pass",
      "source_url": "https://www.aliexpress.com/wholesale?SearchText=URL_ENCODED"
    }
  ],
  "seasonal_opportunities": [
    { "opportunity": "description", "timing": "when to act", "products": ["product ideas"] }
  ],
  "tiktok_viral": [
    { "product": "product that went viral", "hashtag": "#TikTokMadeMeBuyIt etc.", "still_viable": true, "why": "explanation" }
  ],
  "avoid": ["products/categories to avoid and why"],
  "summary": "2-3 sentence executive summary"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 5000,
    messages: [{ role: 'user', content: prompt }],
  });

  const analysis = parseJSON(response.content[0].text);
  log('info', `Trend research complete: ${analysis.hot_products?.length || 0} hot products identified`);
  return analysis;
}

// ─── SUPPLIER COST LOOKUP ─────────────────────────────────────────

/**
 * Look up supplier costs for a specific product using AI knowledge
 * of AliExpress, CJ Dropshipping, Temu, and DHgate pricing.
 *
 * @param {string} query — product name or search term
 * @returns {object} — { suppliers, recommendation, alternatives }
 */
export async function lookupSupplierCost(query) {
  log('info', `Looking up supplier costs for "${query}"...`);

  const prompt = `You are a dropshipping sourcing expert with deep knowledge of AliExpress, CJ Dropshipping, Temu, and DHgate pricing. Look up supplier costs for this product.

PRODUCT QUERY: "${query}"
STORE CONTEXT: ${store.name} (${store.niche}), sells to ${store.targetAudience}
STORE PRICE RANGE: $${store.priceRange.min}-$${store.priceRange.max}

Provide REALISTIC pricing. Include multiple supplier options.

Respond in JSON:
{
  "query": "${query}",
  "suppliers": [
    {
      "source": "aliexpress|cjdropshipping|temu|dhgate",
      "search_term": "exact search for this supplier",
      "price_range": "$X - $Y",
      "price_low": 0.00,
      "price_mid": 0.00,
      "price_high": 0.00,
      "shipping_epacket": 0.00,
      "shipping_standard": 0.00,
      "shipping_time_days": "X-Y",
      "quality_tier": "budget|mid|quality",
      "moq": 1,
      "rating_typical": 0.0,
      "orders_typical": "Xk+",
      "url": "https://www.aliexpress.com/wholesale?SearchText=URL_ENCODED"
    }
  ],
  "recommendation": {
    "best_value": "which supplier option and why",
    "landed_cost": 0.00,
    "suggested_sell_price": 0.00,
    "margin_percent": 0,
    "compare_at_price": 0.00,
    "verdict": "excellent|good|acceptable|thin_margin|skip",
    "tips": "sourcing tips for this product"
  },
  "alternatives": ["similar products that might be cheaper or better margin"]
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const result = parseJSON(response.content[0].text);
  log('info', `Found ${result.suppliers?.length || 0} supplier options`);
  return result;
}

/**
 * Bulk supplier lookup for multiple products.
 *
 * @param {string[]} queries — array of product names/search terms
 * @returns {object[]} — array of supplier lookup results
 */
export async function bulkSupplierLookup(queries) {
  const results = [];
  for (const query of queries) {
    try {
      const result = await lookupSupplierCost(query);
      results.push(result);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      results.push({ query, error: err.message });
    }
  }
  return results;
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────

async function _getGoogleDailyTrends() {
  try {
    const url = 'https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=300&geo=US&ns=15';
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    const cleanData = data.replace(/^\)\]\}'\n/, '');
    const parsed = JSON.parse(cleanData);
    const searches = parsed?.default?.trendingSearchesDays?.[0]?.trendingSearches || [];
    return searches.slice(0, 10).map(s => s.title?.query).filter(Boolean);
  } catch {
    return [];
  }
}
