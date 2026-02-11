/**
 * Kindroid AI Chat Integration (Standalone)
 *
 * ABOUT:
 *   Kindroid is an AI companion platform where you can create characters with
 *   unique personalities, backstories, and conversational styles. Unlike generic
 *   chatbots, Kindroid bots maintain persistent memory and feel like distinct
 *   individuals. This tool lets you send messages to a Kindroid bot and get
 *   text replies back — with built-in conversation history tracking and a
 *   detector for when the AI recommends songs (useful for music-related bots).
 *
 * USE CASES:
 *   - Power an AI companion chatbot in your app
 *   - Add personality-driven AI responses to voice calls
 *   - Build conversational experiences with persistent AI characters
 *   - Detect and act on AI-generated music recommendations
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   KINDROID_API_KEY   - Your Kindroid API key
 *   KINDROID_API_URL   - API base URL (default: https://api.kindroid.ai/v1)
 */

// ─── Configuration ───────────────────────────────────────────────────────────

export interface KindroidConfig {
  apiKey: string;
  apiUrl?: string; // Default: https://api.kindroid.ai/v1
}

const DEFAULT_API_URL = 'https://api.kindroid.ai/v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KindroidMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationSession {
  botId: string;
  history: KindroidMessage[];
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Send a message to a Kindroid AI bot and get a text response
 *
 * @param config - Your Kindroid API credentials
 * @param botId - The unique Kindroid bot ID to talk to
 * @param message - The user's message text
 * @returns The AI's response as plain text
 */
export async function sendMessage(
  config: KindroidConfig,
  botId: string,
  message: string
): Promise<string> {
  const apiUrl = config.apiUrl || DEFAULT_API_URL;

  const response = await fetch(`${apiUrl}/send-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      ai_id: botId,
      message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kindroid API error (${response.status}): ${errorText}`);
  }

  // Kindroid returns plain text, not JSON
  const reply = await response.text();
  return reply;
}

/**
 * Create a conversation session that tracks message history
 */
export function createSession(botId: string): ConversationSession {
  return {
    botId,
    history: [],
  };
}

/**
 * Send a message within a session (tracks history automatically)
 */
export async function chat(
  config: KindroidConfig,
  session: ConversationSession,
  userMessage: string
): Promise<string> {
  // Add user message to history
  session.history.push({ role: 'user', content: userMessage });

  // Get AI response
  const reply = await sendMessage(config, session.botId, userMessage);

  // Add AI response to history
  session.history.push({ role: 'assistant', content: reply });

  return reply;
}

/**
 * Detect if the AI's response contains a song recommendation
 * Kindroid bots sometimes recommend songs in the format:
 *   SONG: track name, ARTIST: artist name
 *   ARTIST: artist name, SONG: track name
 */
export function detectSongRecommendation(
  response: string
): { trackName: string; artistName: string } | null {
  const songFirstPattern = /SONG[:\s]+(.+?),?\s*ARTIST[:\s]+(.+)/i;
  const artistFirstPattern = /ARTIST[:\s]+(.+?),?\s*SONG[:\s]+(.+)/i;

  const songFirstMatch = response.match(songFirstPattern);
  if (songFirstMatch) {
    return {
      trackName: songFirstMatch[1].trim(),
      artistName: songFirstMatch[2].trim(),
    };
  }

  const artistFirstMatch = response.match(artistFirstPattern);
  if (artistFirstMatch) {
    return {
      trackName: artistFirstMatch[2].trim(),
      artistName: artistFirstMatch[1].trim(),
    };
  }

  return null;
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: KindroidConfig = {
  apiKey: process.env.KINDROID_API_KEY!,
  apiUrl: process.env.KINDROID_API_URL, // optional
};

// Simple one-off message
const reply = await sendMessage(config, 'your-bot-id', 'Hello! How are you?');
console.log('Bot says:', reply);

// Conversation with history tracking
const session = createSession('your-bot-id');
const reply1 = await chat(config, session, 'What music do you like?');
console.log('Bot:', reply1);

const reply2 = await chat(config, session, 'Can you recommend something?');
console.log('Bot:', reply2);

// Check if bot recommended a song
const song = detectSongRecommendation(reply2);
if (song) {
  console.log(`Recommended: ${song.trackName} by ${song.artistName}`);
}
*/
