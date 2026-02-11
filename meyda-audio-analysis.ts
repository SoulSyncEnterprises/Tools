/**
 * Meyda Audio Feature Analysis (Standalone)
 *
 * ABOUT:
 *   Meyda is an open-source audio feature extraction library that runs entirely
 *   on your own machine — no API calls, no cloud services, no costs. It analyzes
 *   WAV files and extracts low-level audio features like loudness (RMS), spectral
 *   brightness, zero-crossing rate, and rhythmic patterns. This tool then maps
 *   those raw features into human-friendly descriptors similar to Spotify's audio
 *   features: energy, valence (happy/sad), danceability, acousticness, and
 *   estimated BPM. It also includes a natural language description generator that
 *   turns numbers into phrases like "uplifting and energetic acoustic track."
 *
 * USE CASES:
 *   - Analyze your own audio files without any API key or internet
 *   - Generate Spotify-like audio features for local/uploaded music
 *   - Auto-describe music in natural language for sharing or display
 *   - Build music recommendation features based on audio similarity
 *   - Estimate BPM and musical characteristics of any WAV file
 *
 * DEPENDENCIES:
 *   npm install meyda music-metadata
 *
 * NO ENVIRONMENT VARIABLES REQUIRED - runs entirely locally!
 */

import * as fs from 'fs';
import * as MeydaModule from 'meyda';
import * as mm from 'music-metadata';

// ESM module compatibility
const Meyda = (MeydaModule as any).default || MeydaModule;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioFeatures {
  tempo: number;             // Estimated BPM
  energy: number;            // 0.0 - 1.0 (from RMS/loudness)
  valence: number;           // 0.0 - 1.0 (estimated from spectral brightness)
  acousticness: number;      // 0.0 - 1.0 (from spectral flatness)
  danceability: number;      // 0.0 - 1.0 (from rhythm analysis)
  instrumentalness: number;  // 0.0 - 1.0 (from spectral profile)
  spectralCentroid: number;  // Raw spectral centroid value
  spectralFlatness: number;  // Raw spectral flatness value
  zcr: number;               // Zero crossing rate
  sampleRate: number;        // File sample rate
  duration: number;          // Duration in seconds
}

export interface MusicDescription {
  summary: string;
  mood: string;
  style: string;
  tempo: string;
  details: string;
}

// ─── Core Analysis ───────────────────────────────────────────────────────────

/**
 * Analyze a WAV file and extract audio features
 *
 * @param filePath - Path to a WAV file
 * @returns Audio features including estimated Spotify-like values
 */
export async function analyzeWavFile(filePath: string): Promise<AudioFeatures> {
  // Read metadata
  const metadata = await mm.parseFile(filePath);
  const sampleRate = metadata.format.sampleRate || 44100;
  const duration = metadata.format.duration || 0;

  // Read raw audio data
  const fileBuffer = fs.readFileSync(filePath);

  // Convert to normalized samples (assumes 16-bit PCM WAV, skip 44-byte header)
  const headerSize = 44;
  const samples: number[] = [];
  for (let i = headerSize; i < fileBuffer.length - 1; i += 2) {
    samples.push(fileBuffer.readInt16LE(i) / 32768);
  }

  if (samples.length === 0) {
    throw new Error('Could not extract audio samples from WAV file');
  }

  // Analyze with Meyda across multiple windows
  const bufferSize = 2048;
  const hopSize = 1024;
  const numWindows = Math.floor((samples.length - bufferSize) / hopSize);

  let totalRms = 0;
  let totalZcr = 0;
  let totalSpectralCentroid = 0;
  let totalSpectralFlatness = 0;
  let validWindows = 0;

  for (let i = 0; i < Math.min(numWindows, 100); i++) {
    const windowIndex = Math.floor(i * numWindows / 100);
    const start = windowIndex * hopSize;
    const window = samples.slice(start, start + bufferSize);

    if (window.length < bufferSize) continue;

    try {
      const features = Meyda.extract(
        ['rms', 'zcr', 'spectralCentroid', 'spectralFlatness'],
        window
      );

      if (features) {
        if (features.rms) totalRms += features.rms;
        if (features.zcr) totalZcr += features.zcr;
        if (features.spectralCentroid) totalSpectralCentroid += features.spectralCentroid;
        if (features.spectralFlatness) totalSpectralFlatness += features.spectralFlatness;
        validWindows++;
      }
    } catch {
      // Skip problematic windows
    }
  }

  if (validWindows === 0) {
    throw new Error('Could not analyze audio features');
  }

  // Calculate averages
  const avgRms = totalRms / validWindows;
  const avgZcr = totalZcr / validWindows;
  const avgSpectralCentroid = totalSpectralCentroid / validWindows;
  const avgSpectralFlatness = totalSpectralFlatness / validWindows;

  // Map to Spotify-like features
  const energy = Math.min(1, avgRms * 4);
  const acousticness = 1 - Math.min(1, avgSpectralFlatness * 2);
  const normalizedCentroid = Math.min(1, avgSpectralCentroid / (sampleRate / 4));
  const valence = normalizedCentroid * 0.6 + energy * 0.4;
  const danceability = energy * 0.5 + (1 - Math.abs(avgZcr - 0.1) * 5) * 0.5;
  const instrumentalness = avgSpectralFlatness < 0.3 ? 0.6 : 0.3;
  const tempo = estimateTempo(samples, sampleRate);

  return {
    tempo,
    energy: clamp(energy),
    valence: clamp(valence),
    acousticness: clamp(acousticness),
    danceability: clamp(danceability),
    instrumentalness: clamp(instrumentalness),
    spectralCentroid: avgSpectralCentroid,
    spectralFlatness: avgSpectralFlatness,
    zcr: avgZcr,
    sampleRate,
    duration,
  };
}

// ─── Natural Language Description ────────────────────────────────────────────

/**
 * Convert audio features to a natural language description
 */
export function describeAudio(
  features: AudioFeatures,
  trackName: string,
  artist?: string
): MusicDescription {
  const mood = getMood(features.valence, features.energy);
  const styleDescriptors = getStyle(features);
  const style = styleDescriptors.join(', ');
  const tempoDesc = getTempoDescription(features.tempo);

  const artistPart = artist ? ` by ${artist}` : '';
  const summary = `"${trackName}"${artistPart} - ${mood} ${style} track`;

  const details = `"${trackName}"${artistPart} is a ${mood} ${style} track ` +
    `with a ${tempoDesc} pace at ${Math.round(features.tempo)} BPM. ` +
    (features.danceability > 0.6 ? 'It has a great beat for moving to. ' : '') +
    (features.acousticness > 0.6 ? 'It has a warm, organic acoustic sound. ' : '') +
    (features.instrumentalness > 0.5 ? "It's mostly instrumental. " : '') +
    (features.energy > 0.7 ? "It's full of energy! " : '') +
    (features.valence > 0.7 ? 'It has a really positive, happy vibe.' :
     features.valence < 0.3 ? 'It has a more somber, emotional tone.' : '');

  return {
    summary,
    mood,
    style,
    tempo: tempoDesc,
    details: details.trim(),
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

function getMood(valence: number, energy: number): string {
  if (valence > 0.7 && energy > 0.7) return 'uplifting and energetic';
  if (valence > 0.7 && energy > 0.4) return 'cheerful and lively';
  if (valence > 0.7) return 'peaceful and content';
  if (valence > 0.5 && energy > 0.7) return 'exciting and dynamic';
  if (valence > 0.5 && energy > 0.4) return 'balanced and pleasant';
  if (valence > 0.5) return 'relaxed and easy-going';
  if (valence > 0.3 && energy > 0.7) return 'intense and powerful';
  if (valence > 0.3 && energy > 0.4) return 'thoughtful and complex';
  if (valence > 0.3) return 'contemplative and mellow';
  if (energy > 0.7) return 'dark and aggressive';
  if (energy > 0.4) return 'brooding and tense';
  return 'melancholic and introspective';
}

function getStyle(features: AudioFeatures): string[] {
  const descriptors: string[] = [];
  if (features.acousticness > 0.7) descriptors.push('acoustic');
  else if (features.acousticness < 0.2) descriptors.push('electronic');
  if (features.danceability > 0.7) descriptors.push('danceable');
  else if (features.danceability < 0.3) descriptors.push('freeform');
  if (features.instrumentalness > 0.7) descriptors.push('instrumental');
  else if (features.instrumentalness < 0.1) descriptors.push('vocal-driven');
  if (features.energy > 0.8) descriptors.push('high-energy');
  else if (features.energy < 0.3) descriptors.push('ambient');
  return descriptors.length > 0 ? descriptors : ['melodic'];
}

function getTempoDescription(bpm: number): string {
  if (bpm < 70) return 'very slow and deliberate';
  if (bpm < 90) return 'slow and relaxed';
  if (bpm < 110) return 'moderate';
  if (bpm < 130) return 'upbeat';
  if (bpm < 150) return 'fast and driving';
  return 'very fast and intense';
}

function estimateTempo(samples: number[], sampleRate: number): number {
  const frameSize = 1024;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const energies: number[] = [];
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += samples[start + j] * samples[start + j];
    }
    energies.push(energy / frameSize);
  }

  const flux: number[] = [];
  for (let i = 1; i < energies.length; i++) {
    flux.push(Math.max(0, energies[i] - energies[i - 1]));
  }

  const minLag = Math.floor(sampleRate * hopSize / frameSize / 200);
  const maxLag = Math.floor(sampleRate * hopSize / frameSize / 60);

  let bestLag = minLag;
  let bestCorr = 0;

  for (let lag = minLag; lag <= Math.min(maxLag, flux.length / 2); lag++) {
    let corr = 0;
    for (let i = 0; i < flux.length - lag; i++) {
      corr += flux[i] * flux[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const secondsPerBeat = (bestLag * hopSize) / sampleRate;
  let bpm = 60 / secondsPerBeat;

  if (bpm < 60) bpm *= 2;
  if (bpm > 200) bpm /= 2;
  return Math.round(bpm);
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
// Analyze a WAV file
const features = await analyzeWavFile('/path/to/song.wav');
console.log(`BPM: ${features.tempo}`);
console.log(`Energy: ${features.energy.toFixed(2)}`);
console.log(`Valence: ${features.valence.toFixed(2)}`);

// Get natural language description
const description = describeAudio(features, 'My Song', 'My Artist');
console.log(description.summary);
// => '"My Song" by My Artist - uplifting and energetic acoustic, danceable track'
console.log(description.details);
// => Full description paragraph
*/
