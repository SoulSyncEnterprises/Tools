/**
 * ═══════════════════════════════════════════════════════════════════
 *  AI AD GENERATOR — Multi-Platform Ad Copy Generator
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Uses Claude AI to generate conversion-focused ad copy for
 *  Facebook, Instagram, Google Ads, and TikTok. Each variant uses
 *  a different hook/angle for A/B testing.
 *
 *  REQUIRED ENV VARS:
 *    ANTHROPIC_API_KEY=sk-ant-api03-xxx
 *
 *  OPTIONAL ENV VARS:
 *    STORE_NAME=Your Store Name
 *    STORE_NICHE=your niche
 *    TARGET_AUDIENCE=who you sell to
 *    BRAND_VOICE=your tone
 *
 *  REQUIRED PACKAGES:
 *    npm install @anthropic-ai/sdk dotenv
 *
 *  USAGE:
 *    import { generateAdCopy, generateMultiPlatformAds,
 *             generateCampaignStrategy } from './ai-ad-generator.js';
 *
 *    // Generate 3 Facebook ad variants
 *    const fbAds = await generateAdCopy(product, 'facebook', { variants: 3 });
 *    // Returns: { variants: [{ hook_type, headline, body, cta, target_note }] }
 *
 *    // Generate ads for all platforms at once
 *    const allAds = await generateMultiPlatformAds(product, {
 *      platforms: ['facebook', 'instagram', 'google', 'tiktok'],
 *    });
 *
 *    // Generate a full campaign strategy
 *    const strategy = await generateCampaignStrategy(products, 50); // $50/day budget
 *    // Returns: { campaign_structure, creative_recommendations, audience_strategy, ... }
 *
 *  SUPPORTED PLATFORMS:
 *    - facebook:  headline (40 chars), body (125 primary), CTA
 *    - instagram: caption (2200 chars), hashtags (15-25)
 *    - google:    headlines (30 chars x 3-5), descriptions (90 chars x 2-4)
 *    - tiktok:    ultra-short text (100 chars), trend-aware
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
};

const MODEL = 'claude-sonnet-4-20250514';

function parseJSON(text) {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
}

// Platform-specific constraints and best practices
const PLATFORM_SPECS = {
  facebook: {
    headline_max: 40,
    body_max: 125,
    full_body_max: 500,
    cta_options: ['Shop Now', 'Learn More', 'Get Offer', 'Order Now'],
    tips: 'Hook in first line. Use social proof. Question openers work well. Emojis OK sparingly.',
  },
  instagram: {
    caption_max: 2200,
    first_line_max: 125,
    hashtag_count: '15-25',
    tips: 'Visual-first platform. Caption should complement image. Use line breaks. Story-style works.',
  },
  google: {
    headline_max: 30,
    headline_count: '3-5',
    description_max: 90,
    description_count: '2-4',
    tips: 'Keyword-rich. Include price, shipping info. Focus on search intent. No emojis.',
  },
  tiktok: {
    text_max: 100,
    tips: 'Ultra casual. Trend-aware language. Hook in 1-2 seconds. "POV" and "Wait for it" style.',
  },
};

// ─── GENERATE AD COPY ─────────────────────────────────────────────

/**
 * Generate ad copy variants for a specific platform.
 * Each variant uses a different hook angle for A/B testing.
 *
 * @param {object} product — { title, price, compare_at_price, optimized_description, original_description }
 * @param {string} platform — 'facebook', 'instagram', 'google', or 'tiktok'
 * @param {object} options — { variants, targetAudience }
 * @returns {object} — { variants: [{ hook_type, headline, body, cta, target_note }] }
 */
export async function generateAdCopy(product, platform, options = {}) {
  const { variants = 3, targetAudience = store.targetAudience } = options;
  const specs = PLATFORM_SPECS[platform];

  if (!specs) throw new Error(`Unsupported platform: ${platform}. Use: ${Object.keys(PLATFORM_SPECS).join(', ')}`);

  const prompt = `You are a top-performing paid social media advertiser. Generate ${variants} ad copy variants for this product on ${platform.toUpperCase()}.

STORE: ${store.name} — ${store.niche}
TARGET AUDIENCE: ${targetAudience}
BRAND VOICE: ${store.brandVoice}

PRODUCT:
- Title: ${product.title}
- Price: $${product.price}${product.compare_at_price ? ` (was $${product.compare_at_price})` : ''}
- Description: ${(product.optimized_description || product.original_description || '').substring(0, 500)}

PLATFORM SPECS:
${JSON.stringify(specs, null, 2)}

REQUIREMENTS:
- Each variant should use a DIFFERENT hook/angle (curiosity, social proof, problem-solution, FOMO, desire)
- Write for STOPPING the scroll — first 5 words are critical
- Include a clear CTA
- ${platform === 'instagram' ? 'Include relevant hashtags' : 'No hashtags'}
- Be specific, not generic. Avoid "amazing product" style copy.
- Every variant should be ready to run — no placeholders

Respond in JSON:
{
  "variants": [
    {
      "hook_type": "the angle used (curiosity/social_proof/problem_solution/fomo/desire)",
      "headline": "attention-grabbing headline",
      "body": "the main ad copy",
      "cta": "call to action",
      ${platform === 'instagram' ? '"hashtags": ["tag1", "tag2"],' : ''}
      "target_note": "who this variant resonates most with"
    }
  ]
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

// ─── MULTI-PLATFORM ADS ──────────────────────────────────────────

/**
 * Generate ads for ALL platforms at once.
 *
 * @param {object} product — product data
 * @param {object} options — { platforms, variants, targetAudience }
 * @returns {object} — { facebook: { variants: [...] }, instagram: { ... }, ... }
 */
export async function generateMultiPlatformAds(product, options = {}) {
  const platforms = options.platforms || ['facebook', 'instagram', 'google'];
  const results = {};

  for (const platform of platforms) {
    try {
      results[platform] = await generateAdCopy(product, platform, options);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results[platform] = { error: err.message };
    }
  }

  return results;
}

// ─── CAMPAIGN STRATEGY ────────────────────────────────────────────

/**
 * Generate a complete ad campaign strategy for a set of products.
 *
 * @param {object[]} products — array of product objects
 * @param {number} budget — daily ad budget in dollars (default 50)
 * @returns {object} — { campaign_structure, creative_recommendations, audience_strategy, budget_allocation, ... }
 */
export async function generateCampaignStrategy(products, budget = 50) {
  const productSummary = products
    .slice(0, 10)
    .map(p => `"${p.title}" — $${p.price} (score: ${p.description_score || 'unscored'})`)
    .join('\n');

  const prompt = `You are a Facebook/Instagram ads strategist for dropshipping stores. Create a campaign strategy.

STORE: ${store.name}
DAILY BUDGET: $${budget}
PRODUCTS (up to 10):
${productSummary}

Create a realistic, actionable ad strategy. Respond in JSON:
{
  "campaign_structure": {
    "phase_1_testing": {
      "duration_days": 0,
      "daily_budget": 0,
      "objective": "",
      "targeting": { "interests": [], "age_range": "", "locations": [] },
      "ad_format": "",
      "products_to_test": ["which products and why"],
      "success_metrics": { "target_ctr": "", "target_cpc": "", "kill_criteria": "" }
    },
    "phase_2_scaling": {
      "trigger": "when to move to phase 2",
      "daily_budget": 0,
      "strategy": ""
    }
  },
  "creative_recommendations": ["specific creative tips"],
  "audience_strategy": "detailed targeting approach",
  "budget_allocation": "how to split the budget",
  "expected_timeline_to_first_sale": "",
  "critical_mistakes_to_avoid": ["common dropshipping ad mistakes"]
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

export { PLATFORM_SPECS };
