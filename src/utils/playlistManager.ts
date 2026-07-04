import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PlaylistTrack } from './playlistStore';
import { formatTime } from './embeds';

export const TRACKS_PER_PAGE = 10;

/** Build the paginated embed for the Playlist Manager panel */
export function buildManagerEmbed(
    playlistName: string,
    tracks: PlaylistTrack[],
    page: number,
    ownerName: string
): EmbedBuilder {
    const totalPages = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * TRACKS_PER_PAGE;
    const pageTracks = tracks.slice(start, start + TRACKS_PER_PAGE);

    let description = '';
    if (tracks.length === 0) {
        description = '*This playlist is empty. Use the buttons below to add songs!*';
    } else {
        pageTracks.forEach((t, i) => {
            const globalIdx = start + i + 1;
            description += `\`${globalIdx}.\` **[${t.title.substring(0, 50)}](${t.uri})**\n`;
            description += `   └ *${t.author}* · \`${formatTime(t.duration)}\`\n`;
        });
    }

    return new EmbedBuilder()
        .setTitle(`📋 Playlist Manager — ${playlistName}`)
        .setDescription(description || '\u200b')
        .setColor(0x1DB954)
        .setFooter({ text: `${tracks.length} track(s) · Page ${currentPage}/${totalPages} · Owned by ${ownerName}` });
}

/** Build the action buttons for the Playlist Manager panel */
export function buildManagerButtons(
    playlistName: string,
    page: number,
    totalTracks: number,
    userId: string
): ActionRowBuilder<ButtonBuilder>[] {
    const totalPages = Math.max(1, Math.ceil(totalTracks / TRACKS_PER_PAGE));
    const safeId = encodeManagerId(userId, playlistName);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`pmgr_prev_${safeId}_${page}`)
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`pmgr_next_${safeId}_${page}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
        new ButtonBuilder()
            .setCustomId(`pmgr_add_${safeId}_${page}`)
            .setLabel('➕ Add Song')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`pmgr_insert_${safeId}_${page}`)
            .setLabel('📌 Insert')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`pmgr_close_${safeId}`)
            .setLabel('❌ Close')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`pmgr_remove_${safeId}_${page}`)
            .setLabel('🗑 Remove Song')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(totalTracks === 0)
    );

    return [row1, row2];
}

/**
 * Encode userId + playlistName into a safe custom ID segment.
 * Uses base64url encoding to handle special characters in playlist names.
 */
export function encodeManagerId(userId: string, playlistName: string): string {
    const encoded = Buffer.from(playlistName, 'utf-8').toString('base64url');
    return `${userId}_${encoded}`;
}

/**
 * Decode a manager ID segment back to userId and playlistName.
 * Returns null if the segment is malformed.
 */
export function decodeManagerId(safeId: string): { userId: string; playlistName: string } | null {
    const underscoreIdx = safeId.indexOf('_');
    if (underscoreIdx === -1) return null;
    const userId = safeId.substring(0, underscoreIdx);
    const encoded = safeId.substring(underscoreIdx + 1);
    try {
        const playlistName = Buffer.from(encoded, 'base64url').toString('utf-8');
        return { userId, playlistName };
    } catch {
        return null;
    }
}
