import * as fs from 'fs';
import * as path from 'path';

export interface PlaylistTrack {
    title: string;
    uri: string;
    duration: number;
    author: string;
    artworkUrl?: string;
}

export interface Playlist {
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
}

// Map of userId -> Playlist[]
export interface PlaylistData {
    [userId: string]: Playlist[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'playlists.json');

function ensureFileExists() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2), 'utf-8');
    }
}

export function loadPlaylists(): PlaylistData {
    ensureFileExists();
    try {
        const fileContent = fs.readFileSync(FILE_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Failed to load playlists:', error);
        return {};
    }
}

export function savePlaylists(data: PlaylistData): void {
    ensureFileExists();
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save playlists:', error);
    }
}

export function getUserPlaylists(userId: string): Playlist[] {
    const data = loadPlaylists();
    return data[userId] || [];
}

export function createPlaylist(userId: string, name: string): { success: boolean; message: string } {
    const data = loadPlaylists();
    if (!data[userId]) {
        data[userId] = [];
    }

    const playlists = data[userId];
    const exists = playlists.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        return { success: false, message: `A playlist named **${name}** already exists!` };
    }

    playlists.push({
        name,
        tracks: [],
        createdAt: Date.now()
    });

    savePlaylists(data);
    return { success: true, message: `Playlist **${name}** has been created successfully!` };
}

export function deletePlaylist(userId: string, name: string): { success: boolean; message: string } {
    const data = loadPlaylists();
    const playlists = data[userId] || [];

    const index = playlists.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    if (index === -1) {
        return { success: false, message: `Playlist **${name}** was not found.` };
    }

    playlists.splice(index, 1);
    data[userId] = playlists;
    savePlaylists(data);
    return { success: true, message: `Playlist **${name}** has been deleted.` };
}

export function addTrackToPlaylist(userId: string, playlistName: string, track: PlaylistTrack): { success: boolean; message: string } {
    const data = loadPlaylists();
    const playlists = data[userId] || [];

    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.` };
    }

    // Avoid exact duplicate URIs in the same playlist to keep it clean, or allow it? Let's allow it but check if already exists to warn.
    const alreadyExists = playlist.tracks.some(t => t.uri === track.uri);
    playlist.tracks.push(track);

    savePlaylists(data);
    return {
        success: true,
        message: `Added **${track.title}** to **${playlist.name}**!${alreadyExists ? ' (Note: This song is already in this playlist)' : ''}`
    };
}

export function removeTrackFromPlaylist(userId: string, playlistName: string, trackIndex: number): { success: boolean; message: string; removedTrack?: PlaylistTrack } {
    const data = loadPlaylists();
    const playlists = data[userId] || [];

    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.` };
    }

    if (trackIndex < 0 || trackIndex >= playlist.tracks.length) {
        return { success: false, message: 'Invalid track selection.' };
    }

    const [removed] = playlist.tracks.splice(trackIndex, 1);
    savePlaylists(data);
    return {
        success: true,
        message: `Removed **${removed.title}** from **${playlist.name}**.`,
        removedTrack: removed
    };
}
