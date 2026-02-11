/**
 * ═══════════════════════════════════════════════════════════════════
 *  PRICE COMPARE — Google Shopping & AliExpress Price Scraper
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Scrapes Google Shopping and AliExpress to compare prices for any
 *  product. Includes AI-powered pricing recommendations via Claude.
 *
 *  REQUIRED ENV VARS:
 *    ANTHROPIC_API_KEY=sk-ant-api03-xxx   (for AI pricing recommendations)
 *
 *  REQUIRED PACKAGES:
 *    npm install axios cheerio @anthropic-ai/sdk dotenv
 *
 *  USAGE:
 *    import { searchGoogleShopping, searchAliExpress, comparePrice,
 *             getPricingRecommendation } from './price-compare.js';
 *
 *    // Search Google Shopping for competitor prices
 *    const googleResults = await searchGoogleShopping('bamboo bath caddy');
 *    // Returns: [{ title, price, seller, url, source: 'google_shopping' }]
 *
 *    // Search AliExpress for supplier costs
 *    const aliResults = await searchAliExpress('bamboo bath caddy');
 *    // Returns: [{ title, price, url, source: 'aliexpress' }]
 *
 *    // Full comparison (Google + AliExpress + margin analysis)
 *    const comparison = await comparePrice({
 *      title: 'Bamboo Bath Caddy',
 *      price: 34.99,
 *    });
 *    // Returns: { product, our_price, competitors, summary }
 *
 *    // AI pricing recommendation
 *    const rec = await getPricingRecommendation(
 *      { title: 'Bamboo Bath Caddy', price: 34.99 },
 *      competitorResults
 *    );
 *    // Returns: { recommended_price, pricing_strategy, rationale, confidence }
 *
 *  NOTE: Web scraping results depend on Google/AliExpress page structure.
 *  Results may be empty if the sites change their HTML or block requests.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

// ─── CONFIG ───────────────────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = 'claude-sonnet-4-20250514';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

function parseJSON(text) {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
}

// ─── GOOGLE SHOPPING ──────────────────────────────────────────────

/**
 * Search Google Shopping for competitor prices.
 *
 * @param {string} query — product search term
 * @param {number} limit — max results (default 5)
 * @returns {object[]} — [{ title, price, seller, url, source }]
 */
export async function searchGoogleShopping(query, limit = 5) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`;

    const { data: html } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 10000,
    });

    const $ = cheerio.load(html);
    const results = [];

    $('.sh-dgr__content').each((i, el) => {
      if (i >= limit) return false;

      const title = $(el).find('.tAxDx').text().trim();
      const priceText = $(el).find('.a8Pemb').text().trim();
      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
      const seller = $(el).find('.aULzUe').text().trim();
      const link = $(el).find('a').attr('href');

      if (title && price) {
        results.push({
          title, price, seller,
          url: link ? `https://www.google.com${link}` : null,
          source: 'google_shopping',
        });
      }
    });

    return results;
  } catch (err) {
    log('warn', `Google Shopping search failed for "${query}": ${err.message}`);
    return [];
  }
}

// ─── ALIEXPRESS ───────────────────────────────────────────────────

/**
 * Search AliExpress for supplier pricing.
 *
 * @param {string} query — product search term
 * @param {number} limit — max results (default 5)
 * @returns {object[]} — [{ title, price, url, source }]
 */
export async function searchAliExpress(query, limit = 5) {
  try {
    const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;

    const { data: html } = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(html);
    const results = [];

    $('[class*="SearchResult"]').each((i, el) => {
      if (i >= limit) return false;

      const title = $(el).find('[class*="title"]').text().trim();
      const priceText = $(el).find('[class*="price"]').first().text().trim();
      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
      const link = $(el).find('a').attr('href');

      if (title && price) {
        results.push({
          title, price,
          url: link?.startsWith('http') ? link : `https://aliexpress.com${link}`,
          source: 'aliexpress',
        });
      }
    });

    return results;
  } catch (err) {
    log('warn', `AliExpress search failed for "${query}": ${err.message}`);
    return [];
  }
}

// ─── FULL COMPARISON ──────────────────────────────────────────────

/**
 * Run a full price comparison for a product.
 * Searches Google Shopping + AliExpress, calculates margins.
 *
 * @param {object} product — { title, price }
 * @returns {object} — { product, our_price, competitors, summary }
 */
export async function comparePrice(product) {
  log('info', `Comparing prices for "${product.title}"...`);

  const searchQuery = product.title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 80);

  const [googleResults, aliResults] = await Promise.all([
    searchGoogleShopping(searchQuery),
    searchAliExpress(searchQuery),
  ]);

  const allResults = [...googleResults, ...aliResults];

  const competitors = allResults.map(r => {
    const totalCost = r.price + (r.shipping || 0);
    const margin = product.price - totalCost;
    const marginPercent = product.price > 0 ? (margin / product.price) * 100 : 0;

    return {
      source: r.source,
      source_url: r.url,
      source_title: r.title,
      source_price: r.price,
      shipping_cost: r.shipping || 0,
      total_landed_cost: totalCost,
      our_price: product.price,
      margin_percent: Math.round(marginPercent * 100) / 100,
      margin_amount: Math.round(margin * 100) / 100,
      is_competitive: product.price <= totalCost * 1.5,
      recommendation:
        marginPercent > 50 ? 'keep'
        : marginPercent > 30 ? 'keep'
        : marginPercent > 10 ? 'lower'
        : marginPercent < 0 ? 'raise'
        : 'review',
    };
  });

  return {
    product: product.title,
    our_price: product.price,
    competitors,
    summary: _generatePriceSummary(product, competitors),
  };
}

// ─── AI PRICING RECOMMENDATION ────────────────────────────────────

/**
 * Get AI-powered pricing recommendation from Claude.
 * Requires ANTHROPIC_API_KEY.
 *
 * @param {object} product — { title, price, compare_at_price }
 * @param {object[]} comparisons — competitor results from comparePrice()
 * @returns {object} — { recommended_price, pricing_strategy, rationale, confidence }
 */
export async function getPricingRecommendation(product, comparisons) {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY required for AI pricing recommendations');

  const prompt = `You are a pricing strategist for dropshipping stores. Analyze this competitive data and recommend optimal pricing.

OUR PRODUCT: "${product.title}"
OUR PRICE: $${product.price}
${product.compare_at_price ? `COMPARE AT: $${product.compare_at_price}` : 'No compare-at-price set'}

COMPETITOR DATA:
${comparisons.map(c => `- ${c.source}: "${c.source_title}" at $${c.source_price} (${c.seller || 'unknown seller'})`).join('\n')}

Respond in JSON:
{
  "recommended_price": 0.00,
  "recommended_compare_at": 0.00,
  "pricing_strategy": "description of the strategy",
  "rationale": "why this price point works",
  "price_positioning": "cheapest|value|premium|overpriced",
  "confidence": "high|medium|low",
  "warnings": ["any concerns about this product's viability"]
}`;

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

// ─── HELPERS ──────────────────────────────────────────────────────

function _generatePriceSummary(product, comparisons) {
  if (comparisons.length === 0) return 'No competitor data found.';

  const avgCompPrice = comparisons.reduce((sum, c) => sum + c.source_price, 0) / comparisons.length;
  const lowestPrice = Math.min(...comparisons.map(c => c.source_price));
  const highestPrice = Math.max(...comparisons.map(c => c.source_price));
  const avgMargin = comparisons.reduce((sum, c) => sum + c.margin_percent, 0) / comparisons.length;

  return {
    competitor_count: comparisons.length,
    avg_competitor_price: Math.round(avgCompPrice * 100) / 100,
    lowest_competitor_price: lowestPrice,
    highest_competitor_price: highestPrice,
    our_price: product.price,
    avg_margin_percent: Math.round(avgMargin * 100) / 100,
    position: product.price < avgCompPrice ? 'below_average'
            : product.price > avgCompPrice * 1.2 ? 'above_average'
            : 'competitive',
  };
}
