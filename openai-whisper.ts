/**
 * OpenAI Whisper Audio Transcription (Standalone)
 *
 * ABOUT:
 *   OpenAI Whisper is one of the best audio transcription models available — it
 *   excels at understanding speech even in noisy environments, and unlike most
 *   speech-to-text services, it handles *singing* and *music with vocals*
 *   surprisingly well. This tool takes an audio file (WAV, MP3, etc.) and returns
 *   the transcribed text with confidence scores. It automatically handles files
 *   larger than Whisper's 25MB limit by compressing them to MP3 first.
 *   Think of it as "file-based" transcription (vs. AWS Transcribe which is real-time).
 *
 * USE CASES:
 *   - Transcribe lyrics from song recordings
 *   - Convert voice memos or recordings to text
 *   - Extract spoken content from podcasts or interviews
 *   - Process uploaded audio files for searchable text
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *   System: ffmpeg (optional, for large file compression)
 *
 * ENVIRONMENT VARIABLES:
 *   OPENAI_API_KEY  - Your OpenAI API key
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface OpenAIWhisperConfig {
  apiKey: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TranscriptionResult {
  text: string;
  confidence: number;     // 0.0 - 1.0
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  text: string;
  start: number;          // Start time in seconds
  end: number;            // End time in seconds
  noSpeechProb: number;   // Probability that segment is not speech
}

export interface TranscriptionOptions {
  language?: string;       // Default: 'en'
  prompt?: string;         // Optional context hint for the model
  temperature?: number;    // 0.0 - 1.0 (lower = more deterministic)
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Transcribe audio from a file path
 *
 * @param config - OpenAI API credentials
 * @param filePath - Path to audio file (WAV, MP3, M4A, etc.)
 * @param options - Optional transcription settings
 * @returns Transcription result with text and confidence
 */
export async function transcribeFile(
  config: OpenAIWhisperConfig,
  filePath: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult | null> {
  // Check file size - Whisper has a 25MB limit
  const stats = fs.statSync(filePath);
  const MAX_SIZE = 25 * 1024 * 1024;

  let audioPath = filePath;
  let tempMp3: string | null = null;

  // Compress if too large
  if (stats.size > MAX_SIZE) {
    tempMp3 = await convertToMp3(filePath);
    if (!tempMp3) {
      throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB) and ffmpeg conversion failed`);
    }
    audioPath = tempMp3;
  }

  try {
    const audioBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);
    const mimeType = audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    // Build form data
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), fileName);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    if (options.language) formData.append('language', options.language);
    if (options.prompt) formData.append('prompt', options.prompt);
    if (options.temperature !== undefined) formData.append('temperature', String(options.temperature));

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as {
      text: string;
      segments?: Array<{ text: string; start: number; end: number; no_speech_prob: number }>;
    };

    if (!result.text || !result.text.trim()) {
      return null; // No speech detected
    }

    // Calculate confidence from segments
    let confidence = 0.8;
    const segments: TranscriptionSegment[] = [];

    if (result.segments && result.segments.length > 0) {
      const avgNoSpeechProb = result.segments.reduce((sum, s) => sum + (s.no_speech_prob || 0), 0) / result.segments.length;
      confidence = 1 - avgNoSpeechProb;

      for (const seg of result.segments) {
        segments.push({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          noSpeechProb: seg.no_speech_prob,
        });
      }
    }

    return {
      text: result.text.trim(),
      confidence,
      segments,
    };
  } finally {
    // Clean up temp file
    if (tempMp3) {
      try { fs.unlinkSync(tempMp3); } catch {}
    }
  }
}

/**
 * Transcribe lyrics from a music file
 * Same as transcribeFile but with a music-friendly prompt hint
 */
export async function transcribeLyrics(
  config: OpenAIWhisperConfig,
  filePath: string
): Promise<TranscriptionResult | null> {
  return transcribeFile(config, filePath, {
    language: 'en',
    prompt: 'These are song lyrics with singing.',
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert audio to MP3 using ffmpeg (for reducing file size)
 * Returns path to the MP3 file, or null if conversion fails
 */
async function convertToMp3(inputPath: string): Promise<string | null> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp3');

  try {
    await execAsync(`ffmpeg -i "${inputPath}" -b:a 128k -y "${outputPath}"`);
    return outputPath;
  } catch {
    return null;
  }
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: OpenAIWhisperConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
};

// Transcribe speech from any audio file
const result = await transcribeFile(config, '/path/to/recording.wav');
if (result) {
  console.log('Text:', result.text);
  console.log('Confidence:', (result.confidence * 100).toFixed(1) + '%');
}

// Transcribe song lyrics
const lyrics = await transcribeLyrics(config, '/path/to/song.wav');
if (lyrics) {
  console.log('Lyrics:', lyrics.text);
}
*/
