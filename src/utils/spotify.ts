import { config } from 'dotenv';
config();

let accessToken = '';
let tokenExpiresAt = 0;

export interface SpotifyTrackInfo {
    name: string;
    artist: string;
    duration: number;
}

/**
 * Parses a Spotify URL or URI to determine the type (playlist, album, track) and the ID.
 */
export function parseSpotifyUrl(url: string): { type: 'playlist' | 'album' | 'track'; id: string } | null {
    if (!url) return null;

    // Web URLs e.g., open.spotify.com/playlist/37i9dQZF1DXcBWIGgo3IvE?si=xxx
    const webMatch = url.match(/^(?:https?:\/\/)?(?:[a-z]+\.)?spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
    if (webMatch) {
        return {
            type: webMatch[1] as 'playlist' | 'album' | 'track',
            id: webMatch[2],
        };
    }

    // URI formats e.g., spotify:playlist:37i9dQZF1DXcBWIGgo3IvE
    const uriMatch = url.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]+)/);
    if (uriMatch) {
        return {
            type: uriMatch[1] as 'playlist' | 'album' | 'track',
            id: uriMatch[2],
        };
    }

    return null;
}

/**
 * Authenticates with Spotify and returns an access token.
 * Caches the token based on expiration time.
 */
export async function getSpotifyAccessToken(): Promise<string> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Spotify API credentials are not configured. Please add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to your environment variables.');
    }

    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Spotify Authentication Failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    // Cache the token, expiring it 60 seconds early to avoid race conditions
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return accessToken;
}

/**
 * Fetches all tracks from a Spotify playlist using pagination.
 */
export async function getSpotifyPlaylistTracks(playlistId: string): Promise<SpotifyTrackInfo[]> {
    const token = await getSpotifyAccessToken();
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
    const tracks: SpotifyTrackInfo[] = [];

    while (url) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Spotify Playlist Fetch Failed (${response.status}): ${errText}`);
        }

        const data = (await response.json()) as { items: any[]; next: string | null };
        for (const item of data.items) {
            if (item.track) {
                tracks.push({
                    name: item.track.name,
                    artist: item.track.artists.map((a: any) => a.name).join(', '),
                    duration: item.track.duration_ms,
                });
            }
        }
        url = data.next || '';
    }

    return tracks;
}

/**
 * Fetches all tracks from a Spotify album using pagination.
 */
export async function getSpotifyAlbumTracks(albumId: string): Promise<SpotifyTrackInfo[]> {
    const token = await getSpotifyAccessToken();
    let url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
    const tracks: SpotifyTrackInfo[] = [];

    while (url) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Spotify Album Fetch Failed (${response.status}): ${errText}`);
        }

        const data = (await response.json()) as { items: any[]; next: string | null };
        for (const item of data.items) {
            tracks.push({
                name: item.name,
                artist: item.artists.map((a: any) => a.name).join(', '),
                duration: item.duration_ms,
            });
        }
        url = data.next || '';
    }

    return tracks;
}

/**
 * Fetches details for a single Spotify track.
 */
export async function getSpotifyTrack(trackId: string): Promise<SpotifyTrackInfo> {
    const token = await getSpotifyAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Spotify Track Fetch Failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { name: string; artists: any[]; duration_ms: number };
    return {
        name: data.name,
        artist: data.artists.map((a: any) => a.name).join(', '),
        duration: data.duration_ms,
    };
}

/**
 * Searches a list of Spotify tracks on Lavalink node in parallel with concurrency chunking.
 */
export async function searchSpotifyTracksOnLavalink(
    node: any,
    spotifyTracks: SpotifyTrackInfo[],
    user: any,
    concurrencyLimit = 5
): Promise<any[]> {
    const resolvedTracks: any[] = [];

    for (let i = 0; i < spotifyTracks.length; i += concurrencyLimit) {
        const chunk = spotifyTracks.slice(i, i + concurrencyLimit);
        const searchPromises = chunk.map(async (track) => {
            const query = `ytmsearch:${track.artist} - ${track.name}`;
            try {
                const res = await node.search({ query }, user);
                if (res.tracks && res.tracks.length > 0) {
                    // Inject original Spotify metadata details to keep artist name etc., if desired
                    return res.tracks[0];
                }
            } catch (err) {
                console.error(`Failed to resolve track on Lavalink: ${track.artist} - ${track.name}`, err);
            }
            return null;
        });

        const chunkResults = await Promise.all(searchPromises);
        for (const track of chunkResults) {
            if (track) {
                resolvedTracks.push(track);
            }
        }
    }

    return resolvedTracks;
}
