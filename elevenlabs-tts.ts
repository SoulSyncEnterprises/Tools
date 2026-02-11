/**
 * ElevenLabs Text-to-Speech Integration (Standalone)
 *
 * ABOUT:
 *   ElevenLabs is a leading AI voice synthesis platform that produces some of the
 *   most realistic and expressive text-to-speech audio available. You can use
 *   pre-made voices or clone your own. This tool converts any text into spoken
 *   audio — outputting MP3 for general use or mulaw format specifically for
 *   phone calls (Twilio). It's what makes an AI "speak" with a natural human voice
 *   instead of sounding robotic.
 *
 * USE CASES:
 *   - Give your AI chatbot or phone assistant a realistic voice
 *   - Generate voiceovers or narration from text
 *   - Stream AI-generated speech into live phone calls
 *   - Create audio content (podcasts, audiobooks) programmatically
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   ELEVENLABS_API_KEY  - Your ElevenLabs API key
 */

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ElevenLabsConfig {
  apiKey: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type OutputFormat =
  | 'mp3_44100_128'      // Standard MP3
  | 'mp3_22050_32'       // Low quality MP3
  | 'pcm_16000'          // PCM 16kHz
  | 'pcm_22050'          // PCM 22kHz
  | 'pcm_24000'          // PCM 24kHz
  | 'pcm_44100'          // PCM 44.1kHz
  | 'ulaw_8000';         // mulaw 8kHz (for Twilio/telephony)

export interface VoiceSettings {
  stability: number;         // 0.0 - 1.0 (lower = more expressive)
  similarity_boost: number;  // 0.0 - 1.0 (higher = closer to original voice)
  style?: number;            // 0.0 - 1.0 (style exaggeration, v2 models only)
  use_speaker_boost?: boolean;
}

export interface TTSOptions {
  voiceId: string;
  text: string;
  modelId?: string;          // Default: eleven_flash_v2_5
  outputFormat?: OutputFormat;
  voiceSettings?: VoiceSettings;
}

const DEFAULT_MODEL = 'eleven_flash_v2_5';
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
};

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Convert text to speech audio
 *
 * @returns Audio data as a Buffer
 */
export async function textToSpeech(
  config: ElevenLabsConfig,
  options: TTSOptions
): Promise<Buffer> {
  const format = options.outputFormat || 'mp3_44100_128';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId}?output_format=${format}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.apiKey,
    },
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId || DEFAULT_MODEL,
      voice_settings: options.voiceSettings || DEFAULT_VOICE_SETTINGS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Convert text to speech for Twilio (mulaw 8kHz format, base64 encoded)
 * Ready to send directly through a Twilio media stream
 */
export async function textToSpeechForTwilio(
  config: ElevenLabsConfig,
  voiceId: string,
  text: string
): Promise<string> {
  const audioBuffer = await textToSpeech(config, {
    voiceId,
    text,
    outputFormat: 'ulaw_8000',
  });

  return audioBuffer.toString('base64');
}

/**
 * List available voices on your ElevenLabs account
 */
export async function listVoices(
  config: ElevenLabsConfig
): Promise<Array<{ voice_id: string; name: string; category: string }>> {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': config.apiKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to list voices: ${response.statusText}`);
  }

  const data = await response.json() as { voices: Array<{ voice_id: string; name: string; category: string }> };
  return data.voices;
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
import fs from 'fs';

const config: ElevenLabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY!,
};

// Generate speech as MP3
const audio = await textToSpeech(config, {
  voiceId: 'your-voice-id',
  text: 'Hello! This is a test of ElevenLabs text to speech.',
});
fs.writeFileSync('output.mp3', audio);

// Generate speech for Twilio (base64 mulaw)
const twilioAudio = await textToSpeechForTwilio(
  config,
  'your-voice-id',
  'Hello from Twilio!'
);
// Send twilioAudio through your Twilio media stream WebSocket

// List available voices
const voices = await listVoices(config);
voices.forEach(v => console.log(`${v.name} (${v.voice_id}) - ${v.category}`));
*/
