import mongoose from 'mongoose';
import PlaylistModel, { IPlaylistTrack } from '../models/Playlist';

// ─── Types (re-exported for backward compatibility) ──────────────────────────

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

// ─── DB Connection ────────────────────────────────────────────────────────────

let isConnected = false;

export async function connectDB(): Promise<void> {
    if (isConnected) return;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not defined in environment variables!');
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        });
        isConnected = true;
        console.log('✅ Connected to MongoDB successfully!');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        throw err;
    }

    mongoose.connection.on('disconnected', () => {
        isConnected = false;
        console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
        isConnected = true;
        console.log('✅ MongoDB reconnected!');
    });

    mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
    });
}

// ─── Store Functions ──────────────────────────────────────────────────────────

export async function getUserPlaylists(userId: string): Promise<Playlist[]> {
    const docs = await PlaylistModel.find({ userId }).lean().exec();
    return docs.map(doc => ({
        name: doc.name,
        tracks: doc.tracks as PlaylistTrack[],
        createdAt: new Date(doc.createdAt).getTime(),
    }));
}

export async function createPlaylist(userId: string, name: string): Promise<{ success: boolean; message: string }> {
    const exists = await PlaylistModel.exists({ userId, name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
    if (exists) {
        return { success: false, message: `A playlist named **${name}** already exists!` };
    }

    await PlaylistModel.create({ userId, name, tracks: [], createdAt: new Date() });
    return { success: true, message: `Playlist **${name}** has been created successfully!` };
}

export async function deletePlaylist(userId: string, name: string): Promise<{ success: boolean; message: string }> {
    const result = await PlaylistModel.deleteOne({ userId, name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
    if (result.deletedCount === 0) {
        return { success: false, message: `Playlist **${name}** was not found.` };
    }
    return { success: true, message: `Playlist **${name}** has been deleted.` };
}

export async function addTrackToPlaylist(userId: string, playlistName: string, track: PlaylistTrack): Promise<{ success: boolean; message: string }> {
    const playlist = await PlaylistModel.findOne({ userId, name: { $regex: new RegExp(`^${escapeRegex(playlistName)}$`, 'i') } });
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.` };
    }

    const alreadyExists = playlist.tracks.some(t => t.uri === track.uri);
    playlist.tracks.push(track as IPlaylistTrack);
    await playlist.save();

    return {
        success: true,
        message: `Added **${track.title}** to **${playlist.name}**!${alreadyExists ? ' (Note: This song is already in this playlist)' : ''}`,
    };
}

export async function removeTrackFromPlaylist(userId: string, playlistName: string, trackIndex: number): Promise<{ success: boolean; message: string; removedTrack?: PlaylistTrack }> {
    const playlist = await PlaylistModel.findOne({ userId, name: { $regex: new RegExp(`^${escapeRegex(playlistName)}$`, 'i') } });
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.` };
    }

    if (trackIndex < 0 || trackIndex >= playlist.tracks.length) {
        return { success: false, message: 'Invalid track selection.' };
    }

    const [removed] = playlist.tracks.splice(trackIndex, 1);
    await playlist.save();

    return {
        success: true,
        message: `Removed **${removed.title}** from **${playlist.name}**.`,
        removedTrack: removed as PlaylistTrack,
    };
}

export async function addTracksToPlaylist(userId: string, playlistName: string, tracks: PlaylistTrack[]): Promise<{ success: boolean; message: string; addedCount: number }> {
    const playlist = await PlaylistModel.findOne({ userId, name: { $regex: new RegExp(`^${escapeRegex(playlistName)}$`, 'i') } });
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.`, addedCount: 0 };
    }

    for (const track of tracks) {
        playlist.tracks.push(track as IPlaylistTrack);
    }
    await playlist.save();

    return {
        success: true,
        message: `Added **${tracks.length}** tracks to **${playlist.name}**!`,
        addedCount: tracks.length,
    };
}

export async function insertTrackAtPosition(userId: string, playlistName: string, track: PlaylistTrack, position: number): Promise<{ success: boolean; message: string }> {
    const playlist = await PlaylistModel.findOne({ userId, name: { $regex: new RegExp(`^${escapeRegex(playlistName)}$`, 'i') } });
    if (!playlist) {
        return { success: false, message: `Playlist **${playlistName}** was not found.` };
    }

    const clampedPos = Math.min(Math.max(0, position), playlist.tracks.length);
    playlist.tracks.splice(clampedPos, 0, track as IPlaylistTrack);
    await playlist.save();

    return {
        success: true,
        message: `Inserted **${track.title}** at position **${clampedPos + 1}** in **${playlist.name}**.`,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
