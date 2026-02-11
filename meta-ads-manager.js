/**
 * ═══════════════════════════════════════════════════════════════════
 *  META ADS MANAGER — Facebook & Instagram Ads API Client
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Complete Meta Ads API integration for creating campaigns, ad sets,
 *  creatives, tracking performance, and auto-optimizing ads.
 *
 *  REQUIRED ENV VARS:
 *    META_ACCESS_TOKEN=EAAxxxxxx         (long-lived user token)
 *    META_AD_ACCOUNT_ID=act_XXXXXXXXX    (ad account ID)
 *    META_PAGE_ID=XXXXXXXXX              (Facebook page ID)
 *
 *  OPTIONAL ENV VARS:
 *    META_INSTAGRAM_ACCOUNT_ID=XXXXXXXXX (for Instagram ads)
 *    META_PIXEL_ID=XXXXXXXXX             (for conversion tracking)
 *    SHOPIFY_STORE_NAME=your-store       (for product URLs)
 *
 *  REQUIRED PACKAGES:
 *    npm install axios dotenv
 *
 *  USAGE:
 *    import { metaAds } from './meta-ads-manager.js';
 *
 *    // Create a campaign
 *    const campaign = await metaAds.createCampaign({
 *      name: 'Summer Sale Campaign',
 *      dailyBudget: 20,
 *      objective: 'OUTCOME_SALES',
 *    });
 *
 *    // Create ad set with targeting
 *    const adSet = await metaAds.createAdSet({
 *      campaignId: campaign.id,
 *      name: 'Women 25-45 Home Decor',
 *      targeting: { age_min: 25, age_max: 45, genders: [2], geo_locations: { countries: ['US'] } },
 *    });
 *
 *    // Upload an image for ads
 *    const image = await metaAds.uploadImage('https://example.com/product.jpg');
 *
 *    // Create ad creative
 *    const creative = await metaAds.createCreative({
 *      name: 'Product Ad',
 *      headline: 'Transform your home',
 *      body: 'Limited time offer — shop now',
 *      cta: 'Shop Now',
 *      imageHash: image.hash,
 *      linkUrl: 'https://your-store.com/products/slug',
 *    });
 *
 *    // Build a full campaign from product + ad copy (one call)
 *    const fullCampaign = await metaAds.buildFullCampaign(product, adCopies, {
 *      dailyBudget: 15, countries: ['US', 'CA'],
 *    });
 *
 *    // Get campaign performance
 *    const insights = await metaAds.getCampaignInsights(campaignId);
 *
 *    // Auto-pause underperforming ads
 *    const optimized = await metaAds.autoOptimizeAds(campaignId, {
 *      minImpressions: 500, maxCpc: 2.0, minCtr: 0.5,
 *    });
 *
 *    // Search targeting interests
 *    const interests = await metaAds.searchInterests('home decor');
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import axios from 'axios';

// ─── CONFIG ───────────────────────────────────────────────────────

const META_API_BASE = 'https://graph.facebook.com/v21.0';

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── META ADS CLIENT ──────────────────────────────────────────────

class MetaAdsClient {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.adAccountId = process.env.META_AD_ACCOUNT_ID;
    this.pageId = process.env.META_PAGE_ID;
    this.instagramAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
    this.pixelId = process.env.META_PIXEL_ID;
    this.storeUrl = process.env.SHOPIFY_STORE_NAME
      ? `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com`
      : null;
  }

  /** Generic Meta API request helper */
  async request(endpoint, method = 'GET', data = null) {
    const url = `${META_API_BASE}${endpoint}`;
    const params = { access_token: this.accessToken };

    try {
      const response = await axios({
        method, url,
        params: method === 'GET' ? { ...params, ...(data || {}) } : params,
        data: method !== 'GET' ? data : undefined,
      });
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      log('error', `Meta API error: ${msg}`);
      throw new Error(`Meta API: ${msg}`);
    }
  }

  // ─── CAMPAIGN CREATION ────────────────────────────────────────

  /**
   * Create a campaign (top level — contains ad sets)
   * @param {object} options — { name, objective, dailyBudget, status }
   */
  async createCampaign({ name, objective = 'OUTCOME_SALES', dailyBudget, status = 'PAUSED' }) {
    log('info', `Creating Meta campaign: "${name}"...`);

    const campaign = await this.request(`/${this.adAccountId}/campaigns`, 'POST', {
      name, objective, status,
      special_ad_categories: [],
      daily_budget: Math.round(dailyBudget * 100), // Meta uses cents
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    });

    log('info', `Campaign created: ${campaign.id}`);
    return campaign;
  }

  /**
   * Create an ad set (targeting + placement + schedule)
   */
  async createAdSet({ campaignId, name, targeting, startTime, endTime,
    billingEvent = 'IMPRESSIONS', optimizationGoal = 'OFFSITE_CONVERSIONS', status = 'PAUSED' }) {
    log('info', `Creating ad set: "${name}"...`);

    const adSet = await this.request(`/${this.adAccountId}/adsets`, 'POST', {
      campaign_id: campaignId, name,
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      targeting: JSON.stringify(targeting),
      start_time: startTime || new Date().toISOString(),
      end_time: endTime || undefined,
      status,
      promoted_object: this.pixelId
        ? { pixel_id: this.pixelId, custom_event_type: 'PURCHASE' }
        : undefined,
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'marketplace', 'video_feeds', 'story', 'reels'],
      instagram_positions: ['stream', 'story', 'reels', 'explore'],
    });

    log('info', `Ad set created: ${adSet.id}`);
    return adSet;
  }

  /** Upload an image for use in ads */
  async uploadImage(imageUrl) {
    return this.request(`/${this.adAccountId}/adimages`, 'POST', { url: imageUrl });
  }

  /**
   * Create an ad creative (the actual content people see)
   */
  async createCreative({ name, headline, body, cta, imageHash, linkUrl, description }) {
    log('info', `Creating ad creative: "${name}"...`);

    const ctaMap = {
      'Shop Now': 'SHOP_NOW', 'Learn More': 'LEARN_MORE',
      'Get Offer': 'GET_OFFER', 'Order Now': 'ORDER_NOW', 'Buy Now': 'BUY_NOW',
    };

    const creative = await this.request(`/${this.adAccountId}/adcreatives`, 'POST', {
      name,
      object_story_spec: JSON.stringify({
        page_id: this.pageId,
        instagram_actor_id: this.instagramAccountId || undefined,
        link_data: {
          message: body, link: linkUrl, name: headline,
          description: description || '',
          image_hash: imageHash,
          call_to_action: { type: ctaMap[cta] || 'SHOP_NOW', value: { link: linkUrl } },
        },
      }),
    });

    log('info', `Creative created: ${creative.id}`);
    return creative;
  }

  /** Create an ad (ties creative to an ad set) */
  async createAd({ adSetId, creativeId, name, status = 'PAUSED' }) {
    const ad = await this.request(`/${this.adAccountId}/ads`, 'POST', {
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      name, status,
    });
    log('info', `Ad created: ${ad.id}`);
    return ad;
  }

  // ─── FULL CAMPAIGN BUILDER ────────────────────────────────────

  /**
   * Build a complete campaign from a product and generated ad copy.
   * Creates: campaign -> ad set -> creatives -> ads
   *
   * @param {object} product — { title, handle, price, images }
   * @param {object[]} adCopies — [{ headline, body, cta, tone }]
   * @param {object} options — { dailyBudget, ageMin, ageMax, genders, countries, interests, autoPublish }
   */
  async buildFullCampaign(product, adCopies, options = {}) {
    const {
      dailyBudget = 10, ageMin = 18, ageMax = 65,
      genders = [0], countries = ['US'], interests = [],
      autoPublish = false,
    } = options;

    const status = autoPublish ? 'ACTIVE' : 'PAUSED';
    const productUrl = this.storeUrl ? `${this.storeUrl}/products/${product.handle}` : product.url || '';

    // 1. Create Campaign
    const campaign = await this.createCampaign({
      name: `${product.title} — ${new Date().toLocaleDateString()}`,
      dailyBudget, status,
    });

    // 2. Build targeting
    const targeting = {
      age_min: ageMin, age_max: ageMax, genders,
      geo_locations: { countries },
      publisher_platforms: ['facebook', 'instagram'],
    };
    if (interests.length > 0) {
      targeting.flexible_spec = [{ interests: interests.map(i => ({ id: i.id, name: i.name })) }];
    }

    // 3. Create Ad Set
    const adSet = await this.createAdSet({
      campaignId: campaign.id,
      name: `${product.title} — Testing`,
      targeting, status,
    });

    // 4. Upload product image
    let imageHash = null;
    const productImage = product.images?.[0]?.src;
    if (productImage) {
      try {
        const imgResult = await this.uploadImage(productImage);
        imageHash = Object.values(imgResult.images || {})[0]?.hash;
      } catch (err) {
        log('warn', `Image upload failed: ${err.message}`);
      }
    }

    // 5. Create ads from copy variants
    const createdAds = [];
    for (const adCopy of adCopies.slice(0, 3)) {
      try {
        const creative = await this.createCreative({
          name: `${product.title} — ${adCopy.tone || 'variant'}`,
          headline: adCopy.headline, body: adCopy.body,
          cta: adCopy.cta || 'Shop Now',
          imageHash, linkUrl: productUrl,
        });

        const ad = await this.createAd({
          adSetId: adSet.id, creativeId: creative.id,
          name: `${product.title} — ${adCopy.tone || 'variant'}`, status,
        });

        createdAds.push({ adId: ad.id, creativeId: creative.id, hook: adCopy.tone });
      } catch (err) {
        log('error', `Failed to create ad variant: ${err.message}`);
      }
    }

    return {
      campaign_id: campaign.id, adset_id: adSet.id,
      ads_created: createdAds.length, ads: createdAds,
      status: autoPublish ? 'ACTIVE' : 'PAUSED — review in Meta Ads Manager',
      product: product.title, daily_budget: `$${dailyBudget}`,
      ads_manager_url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${this.adAccountId?.replace('act_', '')}`,
    };
  }

  // ─── PERFORMANCE TRACKING ────────────────────────────────────

  /** Pull performance data for a campaign */
  async getCampaignInsights(campaignId, datePreset = 'last_7d') {
    const insights = await this.request(`/${campaignId}/insights`, 'GET', {
      fields: 'campaign_name,impressions,clicks,ctr,cpc,spend,actions,cost_per_action_type',
      date_preset: datePreset,
    });
    return insights.data?.[0] || {};
  }

  /** Pull ad-level performance for A/B comparison */
  async getAdInsights(adId) {
    const insights = await this.request(`/${adId}/insights`, 'GET', {
      fields: 'ad_name,impressions,clicks,ctr,cpc,spend,actions',
      date_preset: 'last_7d',
    });
    return insights.data?.[0] || {};
  }

  /**
   * Auto-pause underperforming ads.
   * @param {string} campaignId
   * @param {object} killThresholds — { minImpressions, maxCpc, minCtr }
   */
  async autoOptimizeAds(campaignId, killThresholds = {}) {
    const { minImpressions = 500, maxCpc = 2.0, minCtr = 0.5 } = killThresholds;

    const adSets = await this.request(`/${campaignId}/adsets`, 'GET', { fields: 'id,name' });
    const results = [];

    for (const adSet of adSets.data || []) {
      const ads = await this.request(`/${adSet.id}/ads`, 'GET', { fields: 'id,name,status' });

      for (const ad of ads.data || []) {
        if (ad.status !== 'ACTIVE') continue;

        try {
          const insights = await this.getAdInsights(ad.id);
          const impressions = parseInt(insights.impressions || 0);
          const ctr = parseFloat(insights.ctr || 0);
          const cpc = parseFloat(insights.cpc || 0);

          if (impressions >= minImpressions) {
            if (ctr < minCtr || cpc > maxCpc) {
              await this.request(`/${ad.id}`, 'POST', { status: 'PAUSED' });
              results.push({
                ad_id: ad.id, ad_name: ad.name, action: 'PAUSED',
                reason: ctr < minCtr ? `Low CTR: ${ctr}%` : `High CPC: $${cpc}`,
                impressions, ctr, cpc,
              });
              log('info', `Auto-paused ad "${ad.name}" — CTR: ${ctr}%, CPC: $${cpc}`);
            } else {
              results.push({ ad_id: ad.id, ad_name: ad.name, action: 'KEPT', impressions, ctr, cpc });
            }
          }
        } catch (err) {
          results.push({ ad_id: ad.id, action: 'ERROR', error: err.message });
        }
      }
    }

    return results;
  }

  /** Search for targeting interests by keyword */
  async searchInterests(query) {
    const result = await this.request('/search', 'GET', { type: 'adinterest', q: query });
    return (result.data || []).map(i => ({
      id: i.id, name: i.name,
      audience_size: i.audience_size_lower_bound + ' - ' + i.audience_size_upper_bound,
      topic: i.topic,
    }));
  }
}

// ─── EXPORT ───────────────────────────────────────────────────────

export const metaAds = new MetaAdsClient();
export { MetaAdsClient };
