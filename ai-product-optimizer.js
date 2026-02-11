/**
 * ═══════════════════════════════════════════════════════════════════
 *  AI PRODUCT OPTIMIZER — Claude-Powered Description & SEO Generator
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Uses Claude AI to analyze, score, and rewrite product descriptions
 *  for maximum conversions. Also generates SEO metadata and runs
 *  full store conversion audits.
 *
 *  REQUIRED ENV VARS:
 *    ANTHROPIC_API_KEY=sk-ant-api03-xxx
 *
 *  OPTIONAL ENV VARS:
 *    STORE_NAME=Your Store Name       (default: "My Store")
 *    STORE_NICHE=your niche           (default: "General")
 *    TARGET_AUDIENCE=who you sell to  (default: "Online shoppers")
 *    BRAND_VOICE=your tone            (default: "friendly and helpful")
 *
 *  REQUIRED PACKAGES:
 *    npm install @anthropic-ai/sdk dotenv
 *
 *  USAGE:
 *    import { analyzeDescription, optimizeDescription, generateSEO,
 *             runConversionAudit } from './ai-product-optimizer.js';
 *
 *    // Analyze a product listing (score 0-10 on 7 factors)
 *    const analysis = await analyzeDescription({
 *      title: 'Bamboo Bath Caddy',
 *      price: 34.99,
 *      original_description: '<p>A bath caddy made of bamboo</p>',
 *      images: [{ src: '...' }],
 *    });
 *    // Returns: { overall_score, scores: { description_quality, seo_readiness, ... }, critical_issues, quick_wins }
 *
 *    // Generate an optimized description
 *    const html = await optimizeDescription({
 *      title: 'Bamboo Bath Caddy',
 *      price: 34.99,
 *      original_description: '...',
 *    }, { tone: 'warm', targetLength: 'medium' });
 *
 *    // Generate SEO metadata
 *    const seo = await generateSEO({ title: 'Bamboo Bath Caddy', price: 34.99 });
 *    // Returns: { seo_title, seo_description, suggested_tags, primary_keyword, ... }
 *
 *    // Audit an entire product catalog
 *    const audit = await runConversionAudit(productsArray);
 *    // Returns: { overall_score, conversion_killers, priority_action_plan, ... }
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

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
  tone: process.env.BRAND_VOICE || 'friendly and helpful',
};

const MODEL = 'claude-sonnet-4-20250514';

function parseJSON(text) {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
}

// ─── ANALYZE DESCRIPTION ──────────────────────────────────────────

/**
 * Analyze & score an existing product description.
 * Returns scores on 7 conversion factors plus specific fixes.
 *
 * @param {object} product — { title, price, compare_at_price, product_type, tags, original_description, images, variants }
 * @returns {object} — { overall_score, scores, critical_issues, quick_wins, detailed_notes }
 */
export async function analyzeDescription(product) {
  const prompt = `You are a Shopify conversion rate optimization expert. Analyze this product listing and provide a detailed score and improvement plan.

STORE CONTEXT:
- Store: ${store.name}
- Niche: ${store.niche}
- Target audience: ${store.targetAudience}
- Brand voice: ${store.brandVoice}

PRODUCT:
- Title: ${product.title}
- Price: $${product.price}
- Compare at price: ${product.compare_at_price ? `$${product.compare_at_price}` : 'Not set'}
- Type: ${product.product_type || 'Not specified'}
- Tags: ${product.tags?.join(', ') || 'None'}
- Current description: ${product.original_description || 'EMPTY — No description exists!'}
- Number of images: ${product.images?.length || 0}
- Variants: ${JSON.stringify(product.variants?.map(v => ({ title: v.title, price: v.price })) || [])}

Score the listing from 0-10 on each factor and provide specific, actionable fixes. Respond in this exact JSON format:
{
  "overall_score": 0.0,
  "scores": {
    "description_quality": 0.0,
    "seo_readiness": 0.0,
    "trust_signals": 0.0,
    "urgency_scarcity": 0.0,
    "benefit_clarity": 0.0,
    "mobile_readability": 0.0,
    "pricing_psychology": 0.0
  },
  "critical_issues": ["list of things actively hurting conversions"],
  "quick_wins": ["easy fixes that will improve conversions fast"],
  "detailed_notes": "paragraph explaining the biggest problems and why they matter"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

// ─── OPTIMIZE DESCRIPTION ─────────────────────────────────────────

/**
 * Generate an AI-optimized product description using conversion psychology.
 *
 * @param {object} product — { title, price, compare_at_price, product_type, original_description, variants }
 * @param {object} options — { tone, includeEmoji, format, targetLength }
 * @returns {string} — optimized HTML description
 */
export async function optimizeDescription(product, options = {}) {
  const {
    tone = store.tone,
    includeEmoji = false,
    format = 'html',
    targetLength = 'medium',
  } = options;

  const lengthGuide = {
    short: '100-150 words. Punchy and scannable.',
    medium: '150-250 words. Detailed but focused.',
    long: '250-400 words. Comprehensive with storytelling.',
  };

  const prompt = `You are an elite Shopify copywriter who specializes in converting browsers into buyers. Write a product description that SELLS.

STORE:
- Brand: ${store.name}
- Voice: ${store.brandVoice}
- Audience: ${store.targetAudience}

PRODUCT:
- Title: ${product.title}
- Price: $${product.price}${product.compare_at_price ? ` (was $${product.compare_at_price})` : ''}
- Type: ${product.product_type || 'General'}
- Current description: ${product.original_description || 'None — write from scratch'}
- Variants: ${JSON.stringify(product.variants?.map(v => v.title) || [])}

REQUIREMENTS:
- Tone: ${tone}
- Length: ${lengthGuide[targetLength]}
- Format: ${format === 'html' ? 'Use clean HTML with <p>, <ul>, <strong> tags. No <h1> tags.' : 'Plain text'}
- ${includeEmoji ? 'Use relevant emojis sparingly' : 'Do NOT use emojis'}
- Lead with the #1 benefit, not features
- Include a subtle urgency element (without being cheesy)
- Address the most likely objection for this type of product
- Write for scanners — short paragraphs, bullet points for specs
- Include a "why ${store.name}" trust line
- If there's a compare_at_price, reference the savings naturally
- Optimize for SEO: naturally include relevant keywords

CONVERSION PSYCHOLOGY — weave in at least 3 of these:
1. Social proof language ("thousands love...", "top-rated...")
2. Loss aversion ("don't miss out on...")
3. Benefit stacking (feature -> so what -> benefit)
4. Sensory language (how it feels/looks/works)
5. Future pacing ("imagine..." scenarios)

Return ONLY the product description HTML/text. No commentary.`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

// ─── GENERATE SEO ─────────────────────────────────────────────────

/**
 * Generate SEO-optimized metadata for a product.
 *
 * @param {object} product — { title, price, product_type, optimized_description, original_description }
 * @returns {object} — { seo_title, seo_description, suggested_tags, primary_keyword, secondary_keywords, url_handle_suggestion }
 */
export async function generateSEO(product) {
  const prompt = `Generate SEO-optimized metadata for this Shopify product. The store is ${store.name} (${store.niche}).

Product: ${product.title}
Description: ${product.optimized_description || product.original_description || 'N/A'}
Price: $${product.price}
Type: ${product.product_type || 'General'}

Respond in JSON:
{
  "seo_title": "max 60 chars, keyword-rich, includes brand or product type",
  "seo_description": "max 155 chars, compelling with CTA, includes primary keyword",
  "suggested_tags": ["5-10 relevant tags for Shopify"],
  "primary_keyword": "the main keyword to rank for",
  "secondary_keywords": ["3-5 supporting keywords"],
  "url_handle_suggestion": "clean-seo-friendly-handle"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

// ─── CONVERSION AUDIT ─────────────────────────────────────────────

/**
 * Run a full conversion audit on a product catalog.
 *
 * @param {object[]} products — array of product objects (up to 10 sampled)
 * @returns {object} — { overall_score, conversion_killers, category_scores, priority_action_plan, summary }
 */
export async function runConversionAudit(products) {
  const prompt = `You are a Shopify conversion rate optimization consultant. Audit this store and provide a comprehensive conversion report.

STORE: ${store.name}
NICHE: ${store.niche}
TOTAL PRODUCTS: ${products?.length || 0}

PRODUCT SAMPLE (up to 10):
${(products || []).slice(0, 10).map((p, i) => `
${i + 1}. "${p.title}" — $${p.price}${p.compare_at_price ? ` (compare: $${p.compare_at_price})` : ''}
   Type: ${p.product_type || 'unset'} | Images: ${p.images?.length || 0} | Tags: ${p.tags?.join(', ') || 'none'}
   Description: ${(p.original_description || 'EMPTY').substring(0, 200)}...
   Variants: ${p.variants?.length || 0}
`).join('')}

Provide a brutal, honest audit. Respond in JSON:
{
  "overall_score": 0,
  "conversion_killers": [
    { "issue": "description", "severity": "critical|high|medium|low", "details": "what's wrong", "fix": "exact steps to fix" }
  ],
  "category_scores": {
    "product_descriptions": { "score": 0, "verdict": "" },
    "pricing_strategy": { "score": 0, "verdict": "" },
    "trust_signals": { "score": 0, "verdict": "" },
    "product_images": { "score": 0, "verdict": "" },
    "product_variety": { "score": 0, "verdict": "" },
    "seo_readiness": { "score": 0, "verdict": "" }
  },
  "priority_action_plan": [
    { "priority": 1, "action": "what to do", "expected_impact": "high/medium/low", "effort": "easy/medium/hard", "details": "step-by-step" }
  ],
  "estimated_conversion_rate_after_fixes": "X%",
  "summary": "2-3 sentence executive summary"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}
