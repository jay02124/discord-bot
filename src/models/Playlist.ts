import mongoose, { Document, Schema } from 'mongoose';

export interface IPlaylistTrack {
    title: string;
    uri: string;
    duration: number;
    author: string;
    artworkUrl?: string;
}

export interface IPlaylist {
    userId: string;
    name: string;
    tracks: IPlaylistTrack[];
    createdAt: Date;
}

export interface IPlaylistDocument extends IPlaylist, Document {}

const TrackSchema = new Schema<IPlaylistTrack>(
    {
        title: { type: String, required: true },
        uri: { type: String, required: true },
        duration: { type: Number, required: true },
        author: { type: String, required: true },
        artworkUrl: { type: String },
    },
    { _id: false }
);

const PlaylistSchema = new Schema<IPlaylistDocument>({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    tracks: { type: [TrackSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
});

// Compound index to enforce unique playlist names per user
PlaylistSchema.index({ userId: 1, name: 1 }, { unique: true });

const PlaylistModel = mongoose.model<IPlaylistDocument>('Playlist', PlaylistSchema);

export default PlaylistModel;
