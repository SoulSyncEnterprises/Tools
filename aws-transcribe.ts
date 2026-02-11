/**
 * AWS Transcribe Streaming Integration (Standalone)
 *
 * ABOUT:
 *   AWS Transcribe is Amazon's speech-to-text service that converts spoken audio
 *   into text in real time. Unlike batch transcription (upload a file, wait for
 *   results), this tool uses the *streaming* API — meaning it listens continuously
 *   and transcribes as people speak, word by word. This is what lets an AI "hear"
 *   what someone is saying during a live phone call. It includes silence detection
 *   so it knows when someone has finished a sentence before sending the text to
 *   your AI for a response.
 *
 * USE CASES:
 *   - Real-time speech-to-text during live phone calls
 *   - Voice-controlled applications and assistants
 *   - Live captioning and transcription
 *   - Converting Twilio call audio into text for AI processing
 *
 * DEPENDENCIES:
 *   npm install @aws-sdk/client-transcribe-streaming alawmulaw
 *
 * ENVIRONMENT VARIABLES:
 *   AWS_REGION            - AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID     - AWS access key
 *   AWS_SECRET_ACCESS_KEY - AWS secret key
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface AWSTranscribeConfig {
  region?: string;      // Default: 'us-east-1'
  accessKeyId: string;
  secretAccessKey: string;
}

export interface TranscriptionOptions {
  languageCode?: string;          // Default: 'en-US'
  mediaEncoding?: 'pcm' | 'ogg-opus' | 'flac';  // Default: 'pcm'
  mediaSampleRateHertz?: number;  // Default: 8000 (for telephony)
  silenceThresholdMs?: number;    // Silence before sending batch (default: 2500)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TranscriptResult {
  transcript: string;
  isPartial: boolean;
}

export type OnTranscript = (result: TranscriptResult) => void;
export type OnBatch = (fullTranscript: string) => void | Promise<void>;

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create an AWS Transcribe streaming client
 */
export function createTranscribeClient(config: AWSTranscribeConfig): TranscribeStreamingClient {
  return new TranscribeStreamingClient({
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Start a real-time transcription stream
 *
 * Returns an object with methods to:
 * - feed audio chunks into the stream
 * - stop the transcription
 *
 * @param config - AWS credentials
 * @param options - Transcription options
 * @param onTranscript - Called for each transcript result (partial and final)
 * @param onBatch - Called when a silence pause is detected with the accumulated transcript
 */
export function startTranscription(
  config: AWSTranscribeConfig,
  options: TranscriptionOptions = {},
  onTranscript?: OnTranscript,
  onBatch?: OnBatch,
) {
  const client = createTranscribeClient(config);

  let isActive = true;
  const audioChunks: Buffer[] = [];
  let accumulatedTranscript = '';
  let silenceTimer: NodeJS.Timeout | undefined;
  const SILENCE_THRESHOLD = options.silenceThresholdMs || 2500;

  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(async () => {
      if (accumulatedTranscript.trim() && onBatch) {
        const batch = accumulatedTranscript.trim();
        accumulatedTranscript = '';
        await onBatch(batch);
      }
    }, SILENCE_THRESHOLD);
  };

  // Audio generator for AWS Transcribe
  const audioGenerator = async function* () {
    while (isActive) {
      if (audioChunks.length > 0) {
        const chunk = audioChunks.shift();
        if (chunk) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  };

  // Start the transcription
  const run = async () => {
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: options.languageCode || 'en-US',
      MediaEncoding: options.mediaEncoding || 'pcm',
      MediaSampleRateHertz: options.mediaSampleRateHertz || 8000,
      AudioStream: audioGenerator(),
    });

    try {
      const response = await client.send(command);
      resetSilenceTimer();

      for await (const event of response.TranscriptResultStream!) {
        if (!isActive) break;

        if (event.TranscriptEvent) {
          const results = event.TranscriptEvent.Transcript?.Results;
          if (results) {
            for (const result of results) {
              if (result.Alternatives && result.Alternatives.length > 0) {
                const transcript = result.Alternatives[0].Transcript;
                if (transcript && transcript.trim()) {
                  resetSilenceTimer();

                  const transcriptResult: TranscriptResult = {
                    transcript,
                    isPartial: !!result.IsPartial,
                  };

                  if (onTranscript) onTranscript(transcriptResult);

                  if (!result.IsPartial) {
                    accumulatedTranscript += transcript + ' ';
                  }
                }
              }
            }
          }
        }
      }

      // Send any remaining transcript
      if (accumulatedTranscript.trim() && onBatch) {
        await onBatch(accumulatedTranscript.trim());
      }
    } catch (error) {
      // Send any accumulated transcript before throwing
      if (accumulatedTranscript.trim() && onBatch) {
        await onBatch(accumulatedTranscript.trim());
      }
      throw error;
    } finally {
      if (silenceTimer) clearTimeout(silenceTimer);
      isActive = false;
    }
  };

  // Start in the background
  const promise = run();

  return {
    /** Feed a PCM audio chunk into the transcription stream */
    feedAudio(pcmBuffer: Buffer) {
      if (isActive) audioChunks.push(pcmBuffer);
    },

    /** Stop the transcription stream */
    stop() {
      isActive = false;
      if (silenceTimer) clearTimeout(silenceTimer);
    },

    /** Whether the stream is still active */
    get active() {
      return isActive;
    },

    /** Promise that resolves when transcription ends */
    promise,
  };
}

// ─── Mulaw Helpers ───────────────────────────────────────────────────────────

/**
 * Convert mulaw audio (from Twilio) to PCM for AWS Transcribe
 * Requires: npm install alawmulaw
 */
export async function mulawToPcm(mulawBase64: string): Promise<Buffer> {
  const alawmulaw = await import('alawmulaw');
  const mulaw = alawmulaw.default?.mulaw || alawmulaw.mulaw;
  const mulawData = Buffer.from(mulawBase64, 'base64');
  const pcmData = mulaw.decode(new Uint8Array(mulawData));
  return Buffer.from(pcmData.buffer);
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: AWSTranscribeConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

// Start transcription
const transcriber = startTranscription(
  config,
  { silenceThresholdMs: 2500 },
  // Called for each transcript result
  (result) => {
    if (result.isPartial) {
      console.log('Partial:', result.transcript);
    } else {
      console.log('Final:', result.transcript);
    }
  },
  // Called after silence with full accumulated text
  async (batch) => {
    console.log('User said:', batch);
    // Process the batch (e.g., send to AI)
  }
);

// Feed audio from Twilio media stream
ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  if (data.event === 'media' && data.media?.payload) {
    const pcm = mulawToPcm(data.media.payload);
    transcriber.feedAudio(pcm);
  }
});

// Stop when done
ws.on('close', () => transcriber.stop());
*/
