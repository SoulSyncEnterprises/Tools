/**
 * LALAL.AI Stem Separation Integration (Standalone)
 *
 * ABOUT:
 *   LALAL.AI is an AI-powered audio splitter that separates a mixed song into
 *   individual stems — isolating vocals, drums, bass, guitar, piano, synths,
 *   strings, and wind instruments from each other. This is the technology behind
 *   "remove vocals from a song" tools, but it goes much further. In this project,
 *   it's used to isolate vocals before running lyrics transcription (Whisper works
 *   much better on clean vocal tracks than full mixes). The full pipeline: upload
 *   file -> start separation -> poll for completion -> download the stems.
 *
 * USE CASES:
 *   - Isolate vocals from a song for better lyrics transcription
 *   - Create karaoke/instrumental versions of tracks
 *   - Extract individual instrument stems for remixing
 *   - Improve speech clarity by removing background music
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   LALAL_LICENSE_KEY  - Your LALAL.AI API license key
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface LalalConfig {
  licenseKey: string;
  apiBase?: string; // Default: https://www.lalal.ai/api/v1
}

const DEFAULT_API_BASE = 'https://www.lalal.ai/api/v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StemType = 'vocals' | 'drums' | 'bass' | 'electric_guitar' | 'acoustic_guitar' | 'piano' | 'synthesizer' | 'strings' | 'wind';
export type SplitterType = 'phoenix' | 'orion' | 'cassiopeia';

export interface SeparationOptions {
  stem?: StemType;             // Default: 'vocals'
  splitter?: SplitterType;     // Default: 'orion' (balanced quality/speed)
  encoderFormat?: 'wav' | 'mp3' | 'flac';  // Default: 'wav'
  dereverb?: boolean;          // Default: false
}

export interface SeparationResult {
  vocalUrl?: string;
  instrumentalUrl?: string;
  vocalPath?: string;          // Set after download
  instrumentalPath?: string;   // Set after download
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Check remaining processing minutes on your account
 */
export async function checkRemainingMinutes(config: LalalConfig): Promise<number> {
  const apiBase = config.apiBase || DEFAULT_API_BASE;

  try {
    const response = await fetch(`${apiBase}/limits/minutes_left/`, {
      method: 'POST',
      headers: {
        'X-License-Key': config.licenseKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return 0;
    const data = await response.json() as { minutes_left: number };
    return data.minutes_left || 0;
  } catch {
    return 0;
  }
}

/**
 * Upload an audio file to LALAL.AI
 * @returns Source ID for the uploaded file
 */
export async function uploadFile(
  config: LalalConfig,
  filePath: string
): Promise<string> {
  const apiBase = config.apiBase || DEFAULT_API_BASE;
  const audioBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const response = await fetch(`${apiBase}/upload/`, {
    method: 'POST',
    headers: {
      'X-License-Key': config.licenseKey,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LALAL.AI upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { id: string };
  return result.id;
}

/**
 * Start a stem separation job
 * @returns Task ID for tracking the job
 */
export async function startSeparation(
  config: LalalConfig,
  sourceId: string,
  options: SeparationOptions = {}
): Promise<string> {
  const apiBase = config.apiBase || DEFAULT_API_BASE;

  const response = await fetch(`${apiBase}/split/stem_separator/`, {
    method: 'POST',
    headers: {
      'X-License-Key': config.licenseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_id: sourceId,
      presets: {
        stem: options.stem || 'vocals',
        splitter: options.splitter || 'orion',
        encoder_format: options.encoderFormat || 'wav',
        dereverb_enabled: options.dereverb || false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LALAL.AI split failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { task_id: string };
  return result.task_id;
}

/**
 * Check the status of a separation job
 */
export async function checkStatus(
  config: LalalConfig,
  taskId: string
): Promise<{ status: string; result?: SeparationResult }> {
  const apiBase = config.apiBase || DEFAULT_API_BASE;

  const response = await fetch(`${apiBase}/check/`, {
    method: 'POST',
    headers: {
      'X-License-Key': config.licenseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task_ids: [taskId] }),
  });

  if (!response.ok) {
    throw new Error(`LALAL.AI check failed: ${response.statusText}`);
  }

  const data = await response.json() as { result?: Record<string, any> };
  const taskResult = data.result?.[taskId];

  if (!taskResult) {
    return { status: 'unknown' };
  }

  if (taskResult.status === 'success' && taskResult.result?.tracks) {
    const tracks = taskResult.result.tracks as Array<{ type: string; label: string; url: string }>;
    const vocalTrack = tracks.find((t: any) => t.type === 'stem' || t.label === 'vocals');
    const instrumentalTrack = tracks.find((t: any) => t.type === 'back' || t.label === 'no_vocals');

    return {
      status: 'success',
      result: {
        vocalUrl: vocalTrack?.url,
        instrumentalUrl: instrumentalTrack?.url,
      },
    };
  }

  return { status: taskResult.status };
}

/**
 * Wait for a separation job to complete
 */
export async function waitForCompletion(
  config: LalalConfig,
  taskId: string,
  maxWaitMs: number = 600000,
  pollIntervalMs: number = 5000
): Promise<SeparationResult | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { status, result } = await checkStatus(config, taskId);

    if (status === 'success' && result) return result;
    if (status === 'error') throw new Error('LALAL.AI processing failed');

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('LALAL.AI processing timed out');
}

/**
 * Download a stem file from a URL
 */
export async function downloadStem(url: string, outputPath: string): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok) return false;

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return true;
}

/**
 * Full pipeline: Upload file, separate vocals, download result
 *
 * @param config - LALAL.AI credentials
 * @param inputPath - Path to audio file
 * @param outputDir - Directory to save the vocal stem
 * @param options - Separation options
 * @returns Path to the isolated vocals file, or null
 */
export async function separateVocals(
  config: LalalConfig,
  inputPath: string,
  outputDir: string,
  options: SeparationOptions = {}
): Promise<string | null> {
  // Check remaining minutes
  const remaining = await checkRemainingMinutes(config);
  if (remaining < 5) {
    throw new Error(`Not enough LALAL.AI minutes remaining (${remaining})`);
  }

  // Upload
  const sourceId = await uploadFile(config, inputPath);

  // Start separation
  const taskId = await startSeparation(config, sourceId, {
    stem: 'vocals',
    ...options,
  });

  // Wait for completion
  const result = await waitForCompletion(config, taskId);
  if (!result?.vocalUrl) return null;

  // Download vocals
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const vocalsPath = path.join(outputDir, `${baseName}_vocals.wav`);
  const downloaded = await downloadStem(result.vocalUrl, vocalsPath);

  return downloaded ? vocalsPath : null;
}

/**
 * Clean up temporary stem files
 */
export function cleanupFiles(files: string[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: LalalConfig = {
  licenseKey: process.env.LALAL_LICENSE_KEY!,
};

// Check your balance
const minutes = await checkRemainingMinutes(config);
console.log(`Remaining minutes: ${minutes}`);

// Full pipeline: separate vocals from a song
const vocalsPath = await separateVocals(config, '/path/to/song.wav', '/tmp');
if (vocalsPath) {
  console.log('Vocals saved to:', vocalsPath);
  // Now transcribe the isolated vocals for better accuracy
}

// Step by step (for more control)
const sourceId = await uploadFile(config, '/path/to/song.wav');
const taskId = await startSeparation(config, sourceId, { stem: 'drums' });
const result = await waitForCompletion(config, taskId);
console.log('Drum track URL:', result?.vocalUrl);
*/
