/**
 * Make (Integromat) Webhook Integration (Standalone)
 *
 * ABOUT:
 *   Make (formerly Integromat) is a no-code automation platform that connects
 *   thousands of apps and services together. By sending a simple HTTP POST to a
 *   Make webhook URL, you can trigger complex multi-step workflows — like adding
 *   a song to a Spotify playlist, sending a Slack notification, updating a Google
 *   Sheet, or posting to social media. This tool is the bridge between your code
 *   and Make's visual automation builder. In SoulSync, it's used to automatically
 *   add songs to Spotify when the AI companion recommends one during a call.
 *
 * USE CASES:
 *   - Trigger Spotify playlist additions from your app
 *   - Send notifications to Slack, Discord, or email
 *   - Log events to Google Sheets or Airtable
 *   - Connect your app to 1000+ services without writing integrations
 *   - Automate workflows triggered by in-app events
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   MAKE_WEBHOOK_URL  - Your Make.com webhook URL
 */

// ─── Configuration ───────────────────────────────────────────────────────────

export interface MakeWebhookConfig {
  webhookUrl: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebhookPayload {
  [key: string]: any;
}

export interface WebhookResult {
  success: boolean;
  statusCode: number;
  response?: string;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Send data to a Make.com webhook
 *
 * @param config - Webhook configuration
 * @param payload - JSON data to send
 * @returns Result with success status
 */
export async function triggerWebhook(
  config: MakeWebhookConfig,
  payload: WebhookPayload
): Promise<WebhookResult> {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
    }),
  });

  const responseText = response.ok ? await response.text().catch(() => '') : '';

  return {
    success: response.ok,
    statusCode: response.status,
    response: responseText || undefined,
  };
}

/**
 * Send a song recommendation to Make for Spotify playlist automation
 * This is a common use case: AI recommends a song -> add it to Spotify
 */
export async function sendSongToMake(
  config: MakeWebhookConfig,
  trackName: string,
  artistName: string,
  metadata?: Record<string, any>
): Promise<WebhookResult> {
  return triggerWebhook(config, {
    trackName,
    artistName,
    ...metadata,
  });
}

/**
 * Send a notification/event to Make
 */
export async function sendNotification(
  config: MakeWebhookConfig,
  eventType: string,
  data: Record<string, any>
): Promise<WebhookResult> {
  return triggerWebhook(config, {
    event: eventType,
    data,
  });
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: MakeWebhookConfig = {
  webhookUrl: process.env.MAKE_WEBHOOK_URL!,
};

// Trigger a generic webhook
const result = await triggerWebhook(config, {
  action: 'new_user_signup',
  email: 'user@example.com',
  plan: 'pro',
});
console.log('Webhook sent:', result.success);

// Send a song recommendation (e.g., from AI)
await sendSongToMake(config, 'Bohemian Rhapsody', 'Queen', {
  source: 'ai-recommendation',
  callSid: 'CA123...',
});

// Send a notification
await sendNotification(config, 'call_completed', {
  duration: 300,
  companionName: 'Sofia',
});
*/
