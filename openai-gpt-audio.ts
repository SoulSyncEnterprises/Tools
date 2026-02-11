/**
 * OpenAI GPT-4o Audio Analysis (Standalone)
 *
 * ABOUT:
 *   GPT-4o is OpenAI's multimodal model that can natively understand audio — it
 *   doesn't just transcribe words, it actually *listens* to the music and can
 *   describe what it hears: the instruments, vocal style, production techniques,
 *   emotional arc, genre influences, and atmosphere. This tool sends an audio file
 *   to GPT-4o and gets back a vivid, human-like description of the music. It's
 *   like having a music critic analyze a track for you in seconds.
 *
 * USE CASES:
 *   - Generate rich descriptions of songs for music-sharing features
 *   - Auto-tag and categorize music by mood, genre, and instrumentation
 *   - Create accessibility descriptions of audio content
 *   - Analyze audio for content moderation or classification
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   OPENAI_API_KEY  - Your OpenAI API key
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface OpenAIAudioConfig {
  apiKey: string;
  model?: string; // Default: 'gpt-4o-audio-preview'
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioAnalysisOptions {
  /** Custom prompt for the analysis (overrides default music analysis prompt) */
  prompt?: string;
  /** Max tokens for the response */
  maxTokens?: number;
}

export interface AudioAnalysisResult {
  description: string;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Analyze an audio file using GPT-4o and get a rich description
 *
 * @param config - OpenAI API credentials
 * @param filePath - Path to audio file (WAV or MP3)
 * @param options - Optional analysis settings
 * @returns Rich text description of the audio
 */
export async function analyzeAudio(
  config: OpenAIAudioConfig,
  filePath: string,
  options: AudioAnalysisOptions = {}
): Promise<string | null> {
  const audioBuffer = fs.readFileSync(filePath);
  const base64Audio = audioBuffer.toString('base64');

  const ext = path.extname(filePath).toLowerCase();
  const format = ext === '.mp3' ? 'mp3' : 'wav';

  const defaultPrompt = `Listen to this song and describe its musical characteristics in a vivid, evocative way. Include:
- Vocal style (if any): gender, tone, technique (operatic, breathy, powerful, etc.)
- Instrumentation: specific instruments, synths, percussion style
- Production: layers, textures, builds, drops
- Emotional arc: tension, release, dynamics
- Genre blend and influences
- Overall mood and atmosphere

Keep it concise (2-3 sentences) but rich with specific musical details. Write as if describing it to someone who will experience it.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-audio-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: options.prompt || defaultPrompt,
            },
            {
              type: 'input_audio',
              input_audio: {
                data: base64Audio,
                format,
              },
            },
          ],
        },
      ],
      max_tokens: options.maxTokens || 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPT-4o Audio API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return result.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Analyze an audio file from a Buffer (instead of file path)
 */
export async function analyzeAudioBuffer(
  config: OpenAIAudioConfig,
  audioBuffer: Buffer,
  format: 'wav' | 'mp3',
  options: AudioAnalysisOptions = {}
): Promise<string | null> {
  const base64Audio = audioBuffer.toString('base64');

  const defaultPrompt = `Describe this audio in detail: vocals, instruments, mood, genre, and production style. Be concise but vivid (2-3 sentences).`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-audio-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: options.prompt || defaultPrompt },
            { type: 'input_audio', input_audio: { data: base64Audio, format } },
          ],
        },
      ],
      max_tokens: options.maxTokens || 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPT-4o Audio API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return result.choices?.[0]?.message?.content?.trim() || null;
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: OpenAIAudioConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
};

// Analyze a song
const description = await analyzeAudio(config, '/path/to/song.wav');
console.log('Description:', description);
// Example output: "A warm, finger-picked acoustic guitar drives this intimate folk ballad,
// while a breathy female vocal delivers yearning lyrics about distance and memory.
// Subtle string swells and a gentle kick drum build toward an emotionally charged
// bridge before settling back into quiet resolve."

// Custom prompt
const mood = await analyzeAudio(config, '/path/to/song.mp3', {
  prompt: 'In one word, what is the mood of this song?',
  maxTokens: 10,
});
console.log('Mood:', mood); // "Melancholic"
*/
