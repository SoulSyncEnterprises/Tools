/**
 * ═══════════════════════════════════════════════════════════════════
 *  AI CUSTOMER SERVICE — Automated Ticket Classification & Response
 * ═══════════════════════════════════════════════════════════════════
 *
 *  AI-powered customer service agent that classifies tickets, generates
 *  personalized responses, detects scams, and includes 13 pre-built
 *  email templates for common scenarios.
 *
 *  REQUIRED ENV VARS:
 *    ANTHROPIC_API_KEY=sk-ant-api03-xxx
 *
 *  OPTIONAL ENV VARS:
 *    STORE_NAME=Your Store Name
 *    STORE_NICHE=your niche
 *    BRAND_VOICE=your tone
 *
 *  REQUIRED PACKAGES:
 *    npm install @anthropic-ai/sdk dotenv
 *
 *  USAGE:
 *    import { classifyTicket, generateResponse, getTemplate,
 *             listTemplates, detectScam, fillTemplate,
 *             TEMPLATES, CHAT_RESPONSES } from './ai-customer-service.js';
 *
 *    // Classify a customer message (category, priority, sentiment)
 *    const ticket = await classifyTicket('Where is my order #1234?');
 *    // Returns: { category: 'order_tracking', priority: 'medium', sentiment: 'neutral', summary: '...' }
 *
 *    // Generate AI response to a customer message
 *    const response = await generateResponse('My item arrived broken', {
 *      customerName: 'Sarah',
 *      orderData: { orderId: '#1234', totalPrice: 29.99 },
 *    });
 *    // Returns: { response: '...', classification: {...}, templateSuggestion: '...' }
 *
 *    // Use a pre-built template
 *    const filled = fillTemplate('defective_item', {
 *      customer_name: 'Sarah',
 *      your_name: 'Support Team',
 *    });
 *
 *    // List all templates
 *    const templates = listTemplates();
 *
 *    // Detect scam red flags
 *    const scamCheck = detectScam({
 *      multipleAddresses: true,
 *      rushRequest: true,
 *      highValue: true,
 *    });
 *
 *  TEMPLATE CATEGORIES:
 *    order_tracking, shipping, returns, complaints, product_questions, payment, discount
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
  brandVoice: process.env.BRAND_VOICE || 'friendly and helpful',
};

const MODEL = 'claude-sonnet-4-20250514';

function parseJSON(text) {
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────

export const TEMPLATES = [
  {
    id: 'order_status', category: 'order_tracking', name: 'Order Status Inquiry', priority: 'medium',
    subject: 'Order #[ORDER_NUMBER] Status Update',
    body: `Hi [CUSTOMER_NAME],\n\nThanks for reaching out!\n\nI just checked on your order (#[ORDER_NUMBER]) and it's currently [STATUS]:\n\n✓ Processed: [DATE]\n✓ Shipped: [DATE]\n✓ Tracking Number: [TRACKING_NUMBER]\n✓ Expected Delivery: [DATE_RANGE]\n\nYou can track your package in real-time here:\n[TRACKING_LINK]\n\nIf you have any other questions, just let me know!\n\nBest,\n[YOUR_NAME]\n[STORE_NAME]`,
  },
  {
    id: 'tracking_not_updating', category: 'order_tracking', name: 'Tracking Not Updating', priority: 'medium',
    subject: 'Re: Tracking Update for Order #[ORDER_NUMBER]',
    body: `Hi [CUSTOMER_NAME],\n\nI understand your tracking hasn't updated yet. This is actually normal!\n\nHere's what's happening:\n• Your order has been shipped and is in transit\n• Tracking often takes 2-3 days to show movement\n• International shipments may have longer gaps between scans\n\nYour package is on its way and should arrive by [DATE].\n\nI'll keep an eye on this for you!\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'shipping_time', category: 'shipping', name: 'Shipping Time', priority: 'medium',
    subject: 'Re: Shipping Information',
    body: `Hi [CUSTOMER_NAME],\n\nGreat question! Here's our shipping timeline:\n\nProcessing: 2-3 business days\nStandard Shipping: 10-20 business days (FREE)\nExpress Shipping: 7-12 business days ($9.99)\n\nFor your order specifically:\n• Order Date: [DATE]\n• Expected Delivery: [DATE_RANGE]\n\nAll orders include tracking!\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'where_is_package', category: 'shipping', name: 'Where is My Package?', priority: 'medium',
    subject: 'Re: Package Location - Order #[ORDER_NUMBER]',
    body: `Hi [CUSTOMER_NAME],\n\nLet me help you locate your package!\n\nOrder #[ORDER_NUMBER]\nTracking: [TRACKING_NUMBER]\nLast Update: [LAST_SCAN_LOCATION] on [DATE]\nStatus: [STATUS]\n\nTrack here: [TRACKING_LINK]\n\nI'm monitoring this personally!\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'return_request', category: 'returns', name: 'Return Request (Within 30 Days)', priority: 'medium',
    subject: 'Re: Return Request - Order #[ORDER_NUMBER]',
    body: `Hi [CUSTOMER_NAME],\n\nI'm sorry the item didn't work out! We want to make this right.\n\nReturn process:\n1. Reply with reason + photos (if defective)\n2. I'll send return instructions\n3. Ship back in original condition\n4. Refund in 5-7 business days\n\nOR would you prefer:\n• 20% discount to keep the item?\n• Exchange for a different product?\n\nLet me know!\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'defective_item', category: 'returns', name: 'Defective Item', priority: 'urgent',
    subject: 'Re: Defective Item - Immediate Resolution',
    body: `Hi [CUSTOMER_NAME],\n\nI'm so sorry you received a defective item!\n\nHere's what I'm going to do:\n\n✓ Send you a replacement immediately (no cost)\n✓ Include expedited shipping\n✓ Add a 15% discount code for your next order\n\nNo need to return the defective item.\n\nYour replacement ships today!\n\nBest,\n[YOUR_NAME]`,
    autoApproveThreshold: 30,
  },
  {
    id: 'refund_status', category: 'returns', name: 'Refund Status', priority: 'medium',
    subject: 'Refund Processed - Order #[ORDER_NUMBER]',
    body: `Hi [CUSTOMER_NAME],\n\nYour refund has been processed!\n\n• Amount: $[AMOUNT]\n• Date Processed: [DATE]\n• Refund Method: [METHOD]\n• Expected in Account: 5-7 business days\n\nIf you don't see it after 10 business days, let me know.\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'product_compatibility', category: 'product_questions', name: 'Product Compatibility', priority: 'low',
    subject: 'Re: Product Compatibility Question',
    body: `Hi [CUSTOMER_NAME],\n\nGreat question about compatibility!\n\n[PRODUCT_NAME] works with:\n✓ [COMPATIBLE_ITEM_1]\n✓ [COMPATIBLE_ITEM_2]\n✓ [COMPATIBLE_ITEM_3]\n\nWant to make sure you get the right fit? Happy to help verify!\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'general_complaint', category: 'complaints', name: 'General Complaint', priority: 'urgent',
    subject: 'Re: Your Recent Experience - We Want to Make This Right',
    body: `Hi [CUSTOMER_NAME],\n\nI'm truly sorry you had this experience.\n\nHere's what I'm doing immediately:\n1. [SPECIFIC_ACTION]\n2. [COMPENSATION]\n3. [PREVENTIVE_MEASURE]\n\nCan I send you [COMPENSATION] to make up for the inconvenience?\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'package_damaged', category: 'complaints', name: 'Package Damaged in Transit', priority: 'urgent',
    subject: 'Re: Damaged Package - Immediate Resolution',
    body: `Hi [CUSTOMER_NAME],\n\nI'm so sorry your package arrived damaged!\n\nOption 1: Full Refund (processed immediately)\nOption 2: Replacement + 20% off next order (ships today)\n\nNo need to return the damaged item.\nWhich would you prefer?\n\nBest,\n[YOUR_NAME]`,
    autoApproveThreshold: 20,
  },
  {
    id: 'discount_request', category: 'discount', name: 'Asking for Discount', priority: 'low',
    subject: 'Re: Special Offer Just for You!',
    body: `Hi [CUSTOMER_NAME],\n\nThanks for your interest!\n\n10% off your first order: WELCOME10\nFree shipping on orders over $50\nJoin our email list for exclusive sales (up to 30% off!)\n\nWant me to send you our bestsellers in your price range?\n\nBest,\n[YOUR_NAME]`,
  },
  {
    id: 'payment_declined', category: 'payment', name: 'Payment Declined', priority: 'urgent',
    subject: 'Re: Payment Issue - Let\'s Get This Resolved',
    body: `Hi [CUSTOMER_NAME],\n\nI see your payment didn't go through. Common solutions:\n1. Double-check card number and CVV\n2. Make sure billing address matches card\n3. Contact your bank\n4. Try a different payment method\n\nWe accept all major credit cards, PayPal, and Shop Pay.\n\nWant me to send you a direct checkout link?\n\nBest,\n[YOUR_NAME]`,
  },
];

export const CHAT_RESPONSES = [
  { id: 'greeting', trigger: 'greeting', response: `Hi there! Thanks for reaching out. How can I help you today?` },
  { id: 'order_status', trigger: 'order status', response: `I'd be happy to check on your order! Can you provide your order number? It starts with # and can be found in your confirmation email.` },
  { id: 'tracking', trigger: 'tracking', response: `Great! I found your order. Your tracking number is [TRACKING]. Expected delivery: [DATE]. Anything else?` },
  { id: 'shipping', trigger: 'shipping time', response: `Standard shipping is FREE (10-20 days). Express is $9.99 (7-12 days). Which works best?` },
  { id: 'return', trigger: 'return', response: `No problem! We have a 30-day money-back guarantee. Would you like return instructions, or is there something specific I can help fix?` },
  { id: 'discount', trigger: 'discount', response: `I can offer 10% off with code WELCOME10! Plus free shipping on orders over $50.` },
];

export const SCAM_RED_FLAGS = [
  'Multiple orders to different addresses',
  'Rush request with high-value order',
  'Asking for refund before delivery',
  'Claims item not received immediately',
  'Threatens bad review for discount',
];

export const PRIORITY_LEVELS = {
  urgent: { label: 'URGENT', responseTime: '2 hours', triggers: ['payment issues', 'defective items', 'shipping >30 days'] },
  medium: { label: 'MEDIUM', responseTime: '24 hours', triggers: ['order status', 'product questions', 'return requests'] },
  low: { label: 'LOW', responseTime: '48 hours', triggers: ['discount requests', 'general feedback'] },
};

// ─── CLASSIFY TICKET ──────────────────────────────────────────────

/**
 * Classify an incoming customer message into category + priority + sentiment.
 *
 * @param {string} message — the customer's message
 * @param {object} orderData — optional order context
 * @returns {object} — { category, priority, sentiment, summary }
 */
export async function classifyTicket(message, orderData = null) {
  const prompt = `You are a customer service classifier for a Shopify store. Classify this customer message.

MESSAGE: "${message}"
${orderData ? `ORDER DATA: ${JSON.stringify(orderData)}` : ''}

Respond in JSON:
{
  "category": "one of: order_tracking, shipping, returns, complaints, product_questions, payment, discount",
  "priority": "one of: urgent, medium, low",
  "sentiment": "positive, neutral, negative, angry",
  "summary": "1-sentence summary of what the customer wants"
}`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJSON(response.content[0].text);
}

// ─── GENERATE RESPONSE ───────────────────────────────────────────

/**
 * Generate an AI-powered customer service response.
 *
 * @param {string} customerMessage — the customer's message
 * @param {object} context — { customerName, orderData, customerEmail }
 * @returns {object} — { response, classification, templateSuggestion }
 */
export async function generateResponse(customerMessage, context = {}) {
  const { orderData, customerName } = context;

  // Classify first to find relevant templates
  const classification = await classifyTicket(customerMessage, orderData);
  const relevantTemplates = TEMPLATES
    .filter(t => t.category === classification.category)
    .map(t => `[${t.name}]: ${t.body.substring(0, 200)}...`)
    .join('\n');

  const prompt = `You are a customer service agent for ${store.name} (${store.niche}).

BRAND VOICE: ${store.brandVoice}
CUSTOMER MESSAGE: "${customerMessage}"
CLASSIFICATION: ${JSON.stringify(classification)}
${orderData ? `ORDER DATA: ${JSON.stringify(orderData)}` : ''}
${customerName ? `CUSTOMER NAME: ${customerName}` : ''}

REFERENCE TEMPLATES (use as style guide, don't copy verbatim):
${relevantTemplates}

RULES:
- Be empathetic and solution-focused
- For refunds under $20, approve immediately
- For defective items, offer replacement + discount
- Never argue with the customer
- Include specific next steps
- Keep it concise (under 200 words)
- Match the store's brand voice

Write a personalized response. Return ONLY the response text.`;

  const response = await getAI().messages.create({
    model: MODEL, max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return {
    response: response.content[0].text.trim(),
    classification,
    templateSuggestion: classification.category,
  };
}

// ─── TEMPLATE HELPERS ─────────────────────────────────────────────

/**
 * Fill a template with data.
 *
 * @param {string} templateId — template ID (e.g., 'defective_item')
 * @param {object} data — key-value pairs for placeholders
 * @returns {object|null} — filled template or null
 */
export function fillTemplate(templateId, data = {}) {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(data)) {
    const placeholder = `[${key.toUpperCase()}]`;
    subject = subject.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }

  return { ...template, subject, body };
}

/**
 * Get a template by ID.
 */
export function getTemplate(templateId) {
  return TEMPLATES.find(t => t.id === templateId) || null;
}

/**
 * List all available templates.
 */
export function listTemplates() {
  return TEMPLATES.map(t => ({
    id: t.id, name: t.name, category: t.category, priority: t.priority,
  }));
}

// ─── SCAM DETECTION ───────────────────────────────────────────────

/**
 * Check for scam red flags in order data.
 *
 * @param {object} orderData — { multipleAddresses, rushRequest, highValue, refundBeforeDelivery, immediateNotReceived }
 * @returns {object} — { isRisky, flags, recommendation }
 */
export function detectScam(orderData) {
  const flags = [];

  if (orderData.multipleAddresses) flags.push('Multiple orders to different addresses');
  if (orderData.rushRequest && orderData.highValue) flags.push('Rush request with high-value order');
  if (orderData.refundBeforeDelivery) flags.push('Asking for refund before delivery');
  if (orderData.immediateNotReceived) flags.push('Claims item not received immediately');

  return {
    isRisky: flags.length > 0,
    flags,
    recommendation: flags.length >= 2 ? 'Require verification' : flags.length === 1 ? 'Monitor closely' : 'Normal',
    allRedFlags: SCAM_RED_FLAGS,
  };
}
