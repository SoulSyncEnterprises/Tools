/**
 * Google Cloud Text-to-Speech Integration (Standalone)
 *
 * ABOUT:
 *   Google Cloud Text-to-Speech is Google's enterprise voice synthesis service,
 *   offering 700+ voices across 40+ languages. Their Chirp3 HD voices are among
 *   the most natural-sounding available. This tool works as a reliable fallback
 *   or alternative to ElevenLabs — it's especially useful when you need multilingual
 *   support, phone-quality audio (mulaw format), or want to stay within the
 *   Google Cloud ecosystem. It's pay-per-character and very cost-effective.
 *
 * USE CASES:
 *   - Fallback voice engine when ElevenLabs is unavailable
 *   - Multilingual text-to-speech (40+ languages)
 *   - Phone call audio synthesis (mulaw 8kHz for Twilio)
 *   - High-volume voice generation at lower cost
 *
 * DEPENDENCIES:
 *   npm install @google-cloud/text-to-speech
 *
 * ENVIRONMENT VARIABLES (pick one):
 *   GOOGLE_CLOUD_CREDENTIALS_BASE64  - Base64-encoded service account JSON
 *   GOOGLE_CLOUD_CREDENTIALS         - Raw JSON string of service account credentials
 *   GOOGLE_APPLICATION_CREDENTIALS   - Path to service account JSON file (GCP default)
 */

import textToSpeech from '@google-cloud/text-to-speech';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface GoogleTTSConfig {
  /** Base64-encoded service account JSON */
  credentialsBase64?: string;
  /** Raw JSON string of service account credentials */
  credentialsJson?: string;
  /** Or pass credentials object directly */
  credentials?: Record<string, any>;
}

export type AudioEncoding = 'LINEAR16' | 'MP3' | 'OGG_OPUS' | 'MULAW' | 'ALAW';

export interface TTSOptions {
  text: string;
  languageCode?: string;     // Default: 'en-US'
  voiceName?: string;        // Default: 'en-US-Chirp3-HD-Aoede'
  ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  audioEncoding?: AudioEncoding;
  sampleRateHertz?: number;  // Default: 24000 (or 8000 for telephony)
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create a Google Cloud TTS client from config
 */
function createClient(config: GoogleTTSConfig): textToSpeech.TextToSpeechClient {
  let credentials: Record<string, any> | undefined;

  if (config.credentials) {
    credentials = config.credentials;
  } else if (config.credentialsBase64) {
    credentials = JSON.parse(Buffer.from(config.credentialsBase64, 'base64').toString());
  } else if (config.credentialsJson) {
    credentials = JSON.parse(config.credentialsJson);
  }

  if (credentials) {
    return new textToSpeech.TextToSpeechClient({ credentials });
  }

  // Fall back to GOOGLE_APPLICATION_CREDENTIALS env var
  return new textToSpeech.TextToSpeechClient();
}

/**
 * Synthesize speech from text
 *
 * @returns Audio content as a Buffer
 */
export async function synthesizeSpeech(
  config: GoogleTTSConfig,
  options: TTSOptions
): Promise<Buffer> {
  const client = createClient(config);

  const request = {
    input: { text: options.text },
    voice: {
      languageCode: options.languageCode || 'en-US',
      name: options.voiceName || 'en-US-Chirp3-HD-Aoede',
      ssmlGender: options.ssmlGender || ('FEMALE' as const),
    },
    audioConfig: {
      audioEncoding: (options.audioEncoding || 'MP3') as any,
      sampleRateHertz: options.sampleRateHertz || 24000,
    },
  };

  const [response] = await client.synthesizeSpeech(request);

  if (!response.audioContent) {
    throw new Error('No audio content received from Google Cloud TTS');
  }

  return Buffer.from(response.audioContent);
}

/**
 * Synthesize speech for Twilio (mulaw 8kHz format, base64 encoded)
 * Ready to send directly through a Twilio media stream
 */
export async function synthesizeForTwilio(
  config: GoogleTTSConfig,
  text: string
): Promise<string> {
  const audio = await synthesizeSpeech(config, {
    text,
    audioEncoding: 'MULAW',
    sampleRateHertz: 8000,
  });

  return audio.toString('base64');
}

/**
 * List available voices for a language
 */
export async function listVoices(
  config: GoogleTTSConfig,
  languageCode?: string
): Promise<Array<{ name: string; ssmlGender: string; languageCodes: string[] }>> {
  const client = createClient(config);
  const [response] = await client.listVoices({ languageCode });

  return (response.voices || []).map(v => ({
    name: v.name || '',
    ssmlGender: String(v.ssmlGender || 'NEUTRAL'),
    languageCodes: v.languageCodes || [],
  }));
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
import fs from 'fs';

const config: GoogleTTSConfig = {
  credentialsBase64: process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64,
};

// Generate MP3 speech
const audio = await synthesizeSpeech(config, {
  text: 'Hello! This is Google Cloud Text to Speech.',
  voiceName: 'en-US-Chirp3-HD-Aoede',
  audioEncoding: 'MP3',
});
fs.writeFileSync('output.mp3', audio);

// Generate for Twilio
const twilioAudio = await synthesizeForTwilio(config, 'Hello from Twilio!');
// Send twilioAudio through your Twilio media stream

// List available English voices
const voices = await listVoices(config, 'en');
voices.forEach(v => console.log(`${v.name} - ${v.ssmlGender}`));
*/
