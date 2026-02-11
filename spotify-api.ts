/**
 * Spotify Web API Integration (Standalone)
 *
 * ABOUT:
 *   Spotify's Web API gives you programmatic access to the world's largest music
 *   catalog — search for any song, get detailed track info (album art, duration,
 *   preview clips), retrieve audio features (BPM, energy, danceability, mood),
 *   and browse playlists. This tool uses the Client Credentials auth flow (no
 *   user login required) which is perfect for server-side music lookups. It
 *   handles token caching automatically so you don't waste API calls on auth.
 *
 * USE CASES:
 *   - Search and display song information in your app
 *   - Get audio analysis data (tempo, energy, mood) for music features
 *   - Pull tracks from public playlists
 *   - Build music recommendation or discovery features
 *   - Look up songs mentioned in chat/voice conversations
 *
 * DEPENDENCIES:
 *   npm install node-fetch   (or use native fetch in Node 18+)
 *
 * ENVIRONMENT VARIABLES:
 *   SPOTIFY_CLIENT_ID      - Your Spotify app Client ID
 *   SPOTIFY_CLIENT_SECRET   - Your Spotify app Client Secret
 */

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration_ms: number;
  preview_url: string | null;
  imageUrl?: string;
}

export interface SpotifyAudioFeatures {
  tempo: number;             // BPM
  key: number;               // Pitch class (0-11)
  mode: number;              // Major=1, Minor=0
  valence: number;           // 0.0 - 1.0 (musical positivity)
  energy: number;            // 0.0 - 1.0
  danceability: number;      // 0.0 - 1.0
  acousticness: number;      // 0.0 - 1.0
  instrumentalness: number;  // 0.0 - 1.0
  speechiness?: number;
  liveness?: number;
  loudness?: number;
}

export interface SpotifyPlaylistTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  addedAt: string;
  duration_ms: number;
  imageUrl?: string;
}

// ─── Token Management ────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Spotify access token using Client Credentials flow
 * Tokens are cached and reused until they expire
 */
export async function getAccessToken(config: SpotifyConfig): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed (${response.status}): ${response.statusText}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Refresh 60s early
  };

  return data.access_token;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Search for tracks by query
 */
export async function searchTracks(
  config: SpotifyConfig,
  query: string,
  limit: number = 10
): Promise<SpotifyTrack[]> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) throw new Error(`Spotify search failed: ${response.statusText}`);

  const data = await response.json() as any;

  return (data.tracks?.items || []).map((track: any) => ({
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name || 'Unknown Artist',
    album: track.album?.name || 'Unknown Album',
    duration_ms: track.duration_ms,
    preview_url: track.preview_url,
    imageUrl: track.album?.images?.[0]?.url,
  }));
}

/**
 * Get track info by ID
 */
export async function getTrack(
  config: SpotifyConfig,
  trackId: string
): Promise<SpotifyTrack> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) throw new Error(`Failed to get track: ${response.statusText}`);

  const track = await response.json() as any;

  return {
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name || 'Unknown Artist',
    album: track.album?.name || 'Unknown Album',
    duration_ms: track.duration_ms,
    preview_url: track.preview_url,
    imageUrl: track.album?.images?.[0]?.url,
  };
}

/**
 * Get audio features for a track
 * Note: This endpoint was deprecated for Client Credentials in Nov 2024.
 * Returns null if unavailable.
 */
export async function getAudioFeatures(
  config: SpotifyConfig,
  trackId: string
): Promise<SpotifyAudioFeatures | null> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `https://api.spotify.com/v1/audio-features/${trackId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) return null;

  const features = await response.json() as any;

  return {
    tempo: features.tempo,
    key: features.key,
    mode: features.mode,
    valence: features.valence,
    energy: features.energy,
    danceability: features.danceability,
    acousticness: features.acousticness,
    instrumentalness: features.instrumentalness,
    speechiness: features.speechiness,
    liveness: features.liveness,
    loudness: features.loudness,
  };
}

/**
 * Get tracks from a playlist
 */
export async function getPlaylistTracks(
  config: SpotifyConfig,
  playlistId: string,
  limit: number = 50
): Promise<SpotifyPlaylistTrack[]> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) throw new Error(`Failed to get playlist: ${response.statusText}`);

  const data = await response.json() as any;

  return (data.items || []).map((item: any) => ({
    id: item.track.id,
    name: item.track.name,
    artist: item.track.artists[0]?.name || 'Unknown Artist',
    album: item.track.album?.name || 'Unknown Album',
    addedAt: item.added_at,
    duration_ms: item.track.duration_ms,
    imageUrl: item.track.album?.images?.[0]?.url,
  }));
}

/**
 * Search for a playlist by name and get its tracks
 */
export async function searchPlaylistTracks(
  config: SpotifyConfig,
  playlistName: string,
  limit: number = 50
): Promise<SpotifyPlaylistTrack[]> {
  const token = await getAccessToken(config);

  const searchResponse = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(playlistName)}&type=playlist&limit=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!searchResponse.ok) throw new Error(`Playlist search failed: ${searchResponse.statusText}`);

  const searchData = await searchResponse.json() as any;
  const playlist = searchData.playlists?.items?.[0];

  if (!playlist) return [];

  return getPlaylistTracks(config, playlist.id, limit);
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
const config: SpotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
};

// Search for tracks
const tracks = await searchTracks(config, 'Bohemian Rhapsody');
console.log('Found:', tracks.map(t => `${t.name} by ${t.artist}`));

// Get audio features
const features = await getAudioFeatures(config, tracks[0].id);
if (features) {
  console.log(`BPM: ${features.tempo}, Energy: ${features.energy}, Valence: ${features.valence}`);
}

// Get playlist tracks
const playlistTracks = await searchPlaylistTracks(config, 'My Playlist');
playlistTracks.forEach(t => console.log(`${t.name} - ${t.artist}`));
*/
