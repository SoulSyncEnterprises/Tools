/**
 * Twilio Voice & SMS Integration (Standalone)
 *
 * ABOUT:
 *   Twilio is a cloud communications platform that lets your app make and receive
 *   phone calls, send SMS text messages, and stream live audio over WebSockets.
 *   This tool handles incoming voice calls (with customizable call flows using TwiML),
 *   outbound calls, SMS messaging, and real-time audio media streams — which is how
 *   you'd pipe live phone audio into an AI for real-time conversation. Think of it
 *   as the "phone line" layer that connects your app to the real telephone network.
 *
 * USE CASES:
 *   - Build an AI phone assistant that answers calls
 *   - Send SMS notifications or commands
 *   - Stream live call audio to speech-to-text services
 *   - Create interactive voice menus (IVR)
 *
 * DEPENDENCIES:
 *   npm install twilio ws
 *
 * ENVIRONMENT VARIABLES:
 *   TWILIO_ACCOUNT_SID    - Your Twilio Account SID
 *   TWILIO_AUTH_TOKEN      - Your Twilio Auth Token
 *   TWILIO_PHONE_NUMBER    - Your Twilio phone number (e.g. +1234567890)
 *   APP_DOMAIN             - Your app domain for WebSocket URLs (e.g. myapp.com)
 */

import Twilio from 'twilio'; // Requires esModuleInterop: true in tsconfig, or use: import * as Twilio from 'twilio'

// ─── Configuration ───────────────────────────────────────────────────────────

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  appDomain?: string; // For WebSocket media stream URLs
}

export function createTwilioClient(config: TwilioConfig) {
  const client = Twilio(config.accountSid, config.authToken);
  return client;
}

// ─── TwiML Generators ────────────────────────────────────────────────────────

/**
 * Generate TwiML to greet a caller and connect to a media stream
 * Use this when you want real-time audio streaming (for AI conversation, etc.)
 */
export function generateMediaStreamTwiml(options: {
  greetingText: string;
  streamUrl: string; // wss://yourdomain.com/your-websocket-path
  callSid: string;
  customParams?: Record<string, string>;
  goodbyeText?: string;
}): string {
  const paramTags = options.customParams
    ? Object.entries(options.customParams)
        .map(([name, value]) => `      <Parameter name="${name}" value="${value}" />`)
        .join('\n')
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${options.greetingText}</Say>
  <Connect>
    <Stream url="${options.streamUrl}">
      <Parameter name="callSid" value="${options.callSid}" />
${paramTags}
    </Stream>
  </Connect>
  <Say voice="Polly.Joanna">${options.goodbyeText || 'The call has ended. Goodbye!'}</Say>
</Response>`;
}

/**
 * Generate simple TwiML that speaks text to the caller
 */
export function generateSayTwiml(messages: string[], voice: string = 'Polly.Joanna'): string {
  const sayTags = messages
    .map(msg => `  <Say voice="${voice}">${msg}</Say>\n  <Pause length="1"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${sayTags}
</Response>`;
}

// ─── Webhook Handlers ────────────────────────────────────────────────────────

/** Shape of Twilio voice webhook POST body */
export interface TwilioVoiceWebhookBody {
  From: string;
  To: string;
  CallSid: string;
  CallStatus: string;
  Direction: string;
}

/** Shape of Twilio SMS webhook POST body */
export interface TwilioSmsWebhookBody {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
}

/** Shape of Twilio call status webhook POST body */
export interface TwilioCallStatusBody {
  CallSid: string;
  CallStatus: string;
  Duration?: string;
}

/**
 * Parse and validate an incoming Twilio voice webhook
 */
export function parseVoiceWebhook(body: Record<string, any>): TwilioVoiceWebhookBody {
  return {
    From: body.From,
    To: body.To,
    CallSid: body.CallSid,
    CallStatus: body.CallStatus,
    Direction: body.Direction,
  };
}

/**
 * Parse and validate an incoming Twilio SMS webhook
 */
export function parseSmsWebhook(body: Record<string, any>): TwilioSmsWebhookBody {
  return {
    From: body.From,
    To: body.To,
    Body: body.Body,
    MessageSid: body.MessageSid,
  };
}

// ─── Outbound Calls & SMS ────────────────────────────────────────────────────

/**
 * Make an outbound call
 */
export async function makeCall(
  config: TwilioConfig,
  to: string,
  twimlUrl: string
): Promise<string> {
  const client = createTwilioClient(config);
  const call = await client.calls.create({
    to,
    from: config.phoneNumber,
    url: twimlUrl,
  });
  return call.sid;
}

/**
 * Send an SMS message
 */
export async function sendSms(
  config: TwilioConfig,
  to: string,
  body: string
): Promise<string> {
  const client = createTwilioClient(config);
  const message = await client.messages.create({
    to,
    from: config.phoneNumber,
    body,
  });
  return message.sid;
}

// ─── Media Stream Helpers ────────────────────────────────────────────────────

/** Twilio media stream event types */
export type TwilioStreamEvent = 'connected' | 'start' | 'media' | 'stop' | 'mark';

export interface TwilioStreamMessage {
  event: TwilioStreamEvent;
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    callSid: string;
    customParameters: Record<string, string>;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64-encoded mulaw audio
  };
  stop?: {
    callSid: string;
    accountSid: string;
  };
}

/**
 * Parse an incoming Twilio media stream WebSocket message
 */
export function parseStreamMessage(raw: string): TwilioStreamMessage {
  return JSON.parse(raw) as TwilioStreamMessage;
}

/**
 * Send audio back to Twilio through the media stream WebSocket
 * Audio must be base64-encoded mulaw at 8kHz
 */
export function createMediaPayload(streamSid: string, audioBase64: string): string {
  return JSON.stringify({
    event: 'media',
    streamSid,
    media: { payload: audioBase64 },
  });
}

/**
 * Send a mark event (useful for keep-alive or tracking playback position)
 */
export function createMarkPayload(streamSid: string, markName: string): string {
  return JSON.stringify({
    event: 'mark',
    streamSid,
    mark: { name: markName },
  });
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
import express from 'express';
import { parseVoiceWebhook, generateMediaStreamTwiml, generateSayTwiml } from './twilio-voice';

const app = express();
app.use(express.urlencoded({ extended: true }));

const config: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  appDomain: process.env.APP_DOMAIN,
};

// Handle incoming calls
app.post('/webhooks/voice', (req, res) => {
  const webhook = parseVoiceWebhook(req.body);
  console.log(`Incoming call from ${webhook.From}`);

  const twiml = generateMediaStreamTwiml({
    greetingText: 'Hello! Connecting you now.',
    streamUrl: `wss://${config.appDomain}/media-stream`,
    callSid: webhook.CallSid,
    customParams: { userId: 'user-123' },
  });

  res.type('text/xml').send(twiml);
});

// Handle call status updates
app.post('/webhooks/call-status', (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus} (${Duration}s)`);
  res.sendStatus(200);
});
*/
