/**
 * ═══════════════════════════════════════════════════════════════════
 *  KLAVIYO EMAIL — Email Marketing Flows & Performance Tracker
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Klaviyo API v3 integration for creating automated email flows,
 *  tracking performance, and managing subscribers. Includes pre-built
 *  flow templates for abandoned cart, welcome series, and post-purchase.
 *
 *  REQUIRED ENV VARS:
 *    KLAVIYO_API_KEY=pk_xxxxxxxx
 *
 *  REQUIRED PACKAGES:
 *    npm install axios dotenv
 *
 *  USAGE:
 *    import { createFlow, setupAllFlows, getFlowStatus,
 *             getSubscriberLists, getFlowDefinitions,
 *             EMAIL_FLOWS } from './klaviyo-email.js';
 *
 *    // Create a single email flow in Klaviyo
 *    const flow = await createFlow('abandoned_cart');
 *    // Returns: { flowId, flowName, emails: 3, status: 'draft', emailTemplates: [...] }
 *
 *    // Deploy all 3 flows at once
 *    const results = await setupAllFlows();
 *
 *    // Check which flows are active in Klaviyo
 *    const statuses = await getFlowStatus();
 *
 *    // Get subscriber lists
 *    const lists = await getSubscriberLists();
 *
 *    // View available flow definitions (without creating them)
 *    const defs = getFlowDefinitions();
 *
 *  INCLUDED FLOWS:
 *    1. Abandoned Cart Recovery (3 emails: reminder, 10% off, 15% final)
 *    2. Welcome Series (3 emails: welcome+10% off, bestsellers, last chance)
 *    3. Post-Purchase (3 emails: shipping+loyalty, review request, cross-sell)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import axios from 'axios';

// ─── CONFIG ───────────────────────────────────────────────────────

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const API_KEY = process.env.KLAVIYO_API_KEY;

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

function getHeaders() {
  if (!API_KEY) throw new Error('KLAVIYO_API_KEY env var is required');
  return {
    Authorization: `Klaviyo-API-Key ${API_KEY}`,
    'Content-Type': 'application/json',
    revision: '2024-10-15',
  };
}

async function klaviyoRequest(endpoint, method = 'GET', data = null) {
  const url = `${KLAVIYO_API_BASE}${endpoint}`;
  try {
    const response = await axios({
      method, url, headers: getHeaders(),
      data: method !== 'GET' ? data : undefined,
      params: method === 'GET' ? data : undefined,
    });
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.errors?.[0]?.detail || err.message;
    log('error', `Klaviyo API error: ${msg}`);
    throw new Error(`Klaviyo: ${msg}`);
  }
}

// ─── EMAIL FLOW TEMPLATES ─────────────────────────────────────────

export const EMAIL_FLOWS = {
  abandoned_cart: {
    name: 'Abandoned Cart Recovery',
    trigger: { type: 'metric', metric: 'Checkout Started', filter: 'Has not completed checkout' },
    revenueImpact: '5-15% of lost sales recovered',
    emails: [
      {
        name: 'Gentle Reminder',
        delay: { hours: 1 },
        subjectLines: [
          'You left something behind...',
          'Still interested? Your items are waiting',
          "Complete your order - {{first_name|default:'there'}}",
        ],
        discountCode: null,
      },
      {
        name: 'Urgency + 10% Discount',
        delay: { hours: 6 },
        subjectLines: [
          'Your cart expires soon + 10% off inside',
          "Still thinking? Here's 10% off to help decide",
        ],
        discountCode: 'COMEBACK10',
        discountPercent: 10,
      },
      {
        name: 'Final Call - 15% Off',
        delay: { hours: 18 },
        subjectLines: [
          'Last chance - your items are selling out',
          'Final reminder: 15% off expires tonight',
        ],
        discountCode: 'LASTCHANCE15',
        discountPercent: 15,
      },
    ],
  },

  welcome_series: {
    name: 'Welcome Series',
    trigger: { type: 'list', action: 'Subscribed to List' },
    revenueImpact: '10-25% of subscribers make first purchase',
    emails: [
      {
        name: 'Welcome + 10% Discount',
        delay: { minutes: 0 },
        subjectLines: [
          "Welcome! Here's 10% off",
          'Thanks for joining! Your exclusive discount inside',
        ],
        discountCode: 'WELCOME10',
        discountPercent: 10,
      },
      {
        name: 'Best Sellers Showcase',
        delay: { days: 2 },
        subjectLines: [
          "Our customers' favorites (you'll love these)",
          "What's trending right now",
        ],
        discountCode: null,
      },
      {
        name: 'Last Chance for Discount',
        delay: { days: 3 },
        subjectLines: [
          'Your 10% off expires tomorrow!',
          'Discount alert: 24 hours left',
        ],
        discountCode: 'WELCOME10',
      },
    ],
  },

  post_purchase: {
    name: 'Post-Purchase Sequence',
    trigger: { type: 'metric', metric: 'Placed Order' },
    revenueImpact: '15-30% additional lifetime value',
    emails: [
      {
        name: 'Shipping Update + Loyalty Discount',
        delay: { days: 3 },
        subjectLines: [
          'Your order is on the way!',
          'Shipped! Track your package here',
        ],
        discountCode: 'LOYAL15',
        discountPercent: 15,
      },
      {
        name: 'Review Request + Reward',
        delay: { days: 3, after: 'delivered' },
        subjectLines: [
          'How\'s your purchase?',
          "We'd love your feedback (+ a gift inside)",
        ],
        discountCode: null,
      },
      {
        name: 'Cross-Sell Recommendations',
        delay: { days: 7 },
        subjectLines: [
          'You might also like these...',
          'Based on your recent purchase',
        ],
        discountCode: null,
      },
    ],
  },
};

// ─── CREATE FLOW ──────────────────────────────────────────────────

/**
 * Create an email flow in Klaviyo from the built-in templates.
 *
 * @param {string} flowName — 'abandoned_cart', 'welcome_series', or 'post_purchase'
 * @returns {object} — { flowId, flowName, emails, status, emailTemplates }
 */
export async function createFlow(flowName) {
  const flowDef = EMAIL_FLOWS[flowName];
  if (!flowDef) {
    throw new Error(`Unknown flow: ${flowName}. Available: ${Object.keys(EMAIL_FLOWS).join(', ')}`);
  }

  log('info', `Creating Klaviyo flow "${flowDef.name}"...`);

  const flow = await klaviyoRequest('/flows/', 'POST', {
    data: {
      type: 'flow',
      attributes: {
        name: flowDef.name,
        status: 'draft',
        trigger_type: flowDef.trigger.type === 'metric' ? 'metric' : 'list',
      },
    },
  });

  const flowId = flow.data?.id;
  log('info', `Flow created: ${flowId}`);

  return {
    flowId,
    flowName: flowDef.name,
    emails: flowDef.emails.length,
    status: 'draft',
    note: 'Flow created in Klaviyo as draft. Add email content in Klaviyo dashboard.',
    emailTemplates: flowDef.emails.map(e => ({
      name: e.name,
      delay: e.delay,
      subjectLines: e.subjectLines,
      discountCode: e.discountCode || null,
    })),
  };
}

// ─── SETUP ALL FLOWS ──────────────────────────────────────────────

/**
 * Deploy all 3 email flows at once.
 *
 * @returns {object} — { flows: { abandoned_cart: {...}, welcome_series: {...}, post_purchase: {...} } }
 */
export async function setupAllFlows() {
  const flowNames = Object.keys(EMAIL_FLOWS);
  const results = {};

  for (const name of flowNames) {
    try {
      results[name] = await createFlow(name);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results[name] = { error: err.message };
    }
  }

  return { flows: results };
}

// ─── FLOW STATUS ──────────────────────────────────────────────────

/**
 * Check which flows are active in Klaviyo.
 *
 * @returns {object[]} — [{ id, name, status, created }]
 */
export async function getFlowStatus() {
  try {
    const flows = await klaviyoRequest('/flows/', 'GET');
    return (flows.data || []).map(f => ({
      id: f.id,
      name: f.attributes?.name,
      status: f.attributes?.status,
      created: f.attributes?.created,
    }));
  } catch (err) {
    log('warn', `Failed to get flow status: ${err.message}`);
    return [];
  }
}

// ─── SUBSCRIBER LISTS ─────────────────────────────────────────────

/**
 * Get subscriber lists from Klaviyo.
 *
 * @returns {object[]} — [{ id, name, created }]
 */
export async function getSubscriberLists() {
  const lists = await klaviyoRequest('/lists/', 'GET');
  return (lists.data || []).map(l => ({
    id: l.id,
    name: l.attributes?.name,
    created: l.attributes?.created,
  }));
}

// ─── FLOW DEFINITIONS ────────────────────────────────────────────

/**
 * Get available flow definitions (for reference — doesn't call API).
 *
 * @returns {object[]} — summary of all available flows and their emails
 */
export function getFlowDefinitions() {
  return Object.entries(EMAIL_FLOWS).map(([key, flow]) => ({
    id: key,
    name: flow.name,
    trigger: flow.trigger,
    revenueImpact: flow.revenueImpact,
    emails: flow.emails.map(e => ({
      name: e.name,
      delay: e.delay,
      discountCode: e.discountCode || null,
    })),
  }));
}

/**
 * Get all discount codes used across all email flows.
 */
export function getAllDiscountCodes() {
  const codes = new Set();
  for (const flow of Object.values(EMAIL_FLOWS)) {
    for (const email of flow.emails) {
      if (email.discountCode) codes.add(email.discountCode);
    }
  }
  return [...codes];
}
