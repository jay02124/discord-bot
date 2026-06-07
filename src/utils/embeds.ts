import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

// Helper to format milliseconds to mm:ss
export function formatTime(ms: number): string {
    if (isNaN(ms) || ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Helper to generate a clean progress bar
export function buildProgressBar(position: number, duration: number, size = 15): string {
    if (!duration || duration <= 0) duration = 1;
    const percentage = Math.min(Math.max(position / duration, 0), 1);
    const progress = Math.round(size * percentage);
    const emptyProgress = size - progress;
    
    // Spotify green/dark themed bar
    const progressText = '▬'.repeat(progress);
    const emptyProgressText = '▬'.repeat(Math.max(emptyProgress, 0));
    
    return `\`${formatTime(position)}\` ${progressText}🔘${emptyProgressText} \`${formatTime(duration)}\``;
}

// Helper to generate a clean progress bar for volume
export function buildVolumeBar(volume: number, size = 10): string {
    const percentage = Math.min(Math.max(volume / 100, 0), 1);
    const progress = Math.round(size * percentage);
    const emptyProgress = size - progress;
    return '█'.repeat(progress) + '░'.repeat(Math.max(emptyProgress, 0));
}

// Build the rich Now Playing embed
export function buildNowPlayingEmbed(player: any, track: any): EmbedBuilder {
    const title = track.info.title || 'Unknown Title';
    const author = track.info.author || 'Unknown Author';
    const uri = track.info.uri || '';
    const duration = track.info.duration || 0;
    const position = player.position || 0;
    const requester = track.requester ? `<@${(track.requester as any).id}>` : 'Unknown';
    const artworkUrl = track.info.artworkUrl || null;
    
    const embed = new EmbedBuilder()
        .setTitle('⚡ NOW PLAYING')
        .setDescription(`### **${title}**\n*by **${author}***\n\n[Open Song Link](${uri})`)
        .setColor(player.paused ? 0x2b2d31 : 0x1DB954) // Grey if paused, Spotify Green if playing
        .addFields(
            { name: 'Progress Bar', value: buildProgressBar(position, duration), inline: false },
            { name: 'Volume Level', value: `🔊 \`${buildVolumeBar(player.volume)}\` \`[${player.volume}%]\``, inline: true },
            { name: 'Requester', value: requester, inline: true },
            { name: 'Loop Mode', value: `🔁 \`${player.repeatMode.toUpperCase()}\``, inline: true },
            { name: 'Autoplay', value: `🤖 \`${player.get('autoplay') ? 'Enabled' : 'Disabled'}\``, inline: true },
            { name: 'Next Up', value: player.queue.tracks.length > 0 ? `⏭️ ${player.queue.tracks[0].info.title.substring(0, 50)}` : 'None', inline: true }
        );

    if (artworkUrl) {
        embed.setThumbnail(artworkUrl);
    }

    return embed;
}

// Build all player button rows
export function buildPlayerButtons(player: any): ActionRowBuilder<ButtonBuilder>[] {
    // Row 1: Playback Controls (Prev, Pause/Play, Skip, Stop, Seek)
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('player_prev')
            .setLabel('⏮️ Prev')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_pause')
            .setLabel(player.paused ? '▶️ Play' : '⏸️ Pause')
            .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('player_skip')
            .setLabel('⏭️ Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_stop')
            .setLabel('🛑 Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('player_seek')
            .setLabel('⏱️ Seek')
            .setStyle(ButtonStyle.Secondary)
    );

    // Row 2: Navigation (Loop, Shuffle, Rewind, Fast Forward, Queue)
    const loopLabel = player.repeatMode === 'track' ? '🔂 Loop: Song' : player.repeatMode === 'queue' ? '🔁 Loop: Queue' : '🔁 Loop: Off';
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('player_loop')
            .setLabel(loopLabel)
            .setStyle(player.repeatMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_shuffle')
            .setLabel('🔀 Shuffle')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_seek_back')
            .setLabel('⏪ -30s')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_seek_forward')
            .setLabel('⏩ +30s')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_queue')
            .setLabel('📋 View Queue')
            .setStyle(ButtonStyle.Secondary)
    );

    // Row 3: Queue & Volume Management (Playlist Mode, Autoplay, Add Track, Remove Track, Vol Modal Button)
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('player_playlist_mode')
            .setLabel('🎵 Playlist Mode')
            .setStyle(player.get('playlistModeActive') ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_autoplay')
            .setLabel(`🤖 Autoplay: ${player.get('autoplay') ? 'ON' : 'OFF'}`)
            .setStyle(player.get('autoplay') ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_add')
            .setLabel('➕ Add to Q')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('player_remove')
            .setLabel('➖ Remove from Q')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('player_volume_btn')
            .setLabel('🔊 Set Vol')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2, row3];
}

// Build Paginated Queue Embed
export function buildQueueEmbed(player: any, page = 1): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const queue = player.queue.tracks;
    const current = player.queue.current;
    const embed = new EmbedBuilder()
        .setTitle('🎵 Server Music Queue')
        .setColor(0x1DB954);

    let description = '';
    if (current) {
        description += `**Now Playing:**\n[${current.info.title}](${current.info.uri}) - \`${formatTime(current.info.duration)}\` (Requested by: <@${(current.requester as any).id}>)\n\n`;
    }

    const tracksPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(queue.length / tracksPerPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * tracksPerPage;
    const end = start + tracksPerPage;
    const pageTracks = queue.slice(start, end);

    if (queue.length > 0) {
        description += `**Up Next (Total: ${queue.length} tracks):**\n`;
        pageTracks.forEach((track: any, index: number) => {
            const trackIndex = start + index + 1;
            description += `\`${trackIndex}.\` [${track.info.title}](${track.info.uri}) - \`${formatTime(track.info.duration)}\` (Requested by: <@${(track.requester as any).id}>)\n`;
        });
    } else {
        description += '*No upcoming tracks.*';
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Page ${currentPage} of ${totalPages} | Loop Mode: ${player.repeatMode.toUpperCase()}` });

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (totalPages > 1) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`queue_page_prev_${currentPage}`)
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId(`queue_page_next_${currentPage}`)
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages)
        );
        components.push(row);
    }

    return { embed, components };
}

// Build Playlist Mode Embed (a Spotify-like panel showing playlist tracks)
export function buildPlaylistModeEmbed(playlistName: string, tracks: any[], currentUri: string | undefined): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`🎵 Playlist Mode: ${playlistName}`)
        .setDescription(`Total Tracks: **${tracks.length}**`)
        .setColor(0x1DB954);

    let trackList = '';
    if (tracks.length === 0) {
        trackList = '*This playlist is currently empty.*';
    } else {
        tracks.forEach((track, index) => {
            const isPlaying = currentUri && track.uri === currentUri;
            const marker = isPlaying ? '▶️ ' : '  ';
            const boldStart = isPlaying ? '**' : '';
            const boldEnd = isPlaying ? '**' : '';
            trackList += `${marker}\`${index + 1}.\` ${boldStart}[${track.title}](${track.uri}) - \`${formatTime(track.duration)}\`${boldEnd}\n`;
        });
    }

    embed.addFields({ name: 'Tracks List', value: trackList.substring(0, 1024) });
    return embed;
}

// Build Playlist Mode control buttons
export function buildPlaylistModeButtons(playlistName: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`playlist_mode_add_${playlistName}`)
            .setLabel('➕ Save Playing to Playlist')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`playlist_mode_remove_${playlistName}`)
            .setLabel('➖ Remove Song')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('playlist_mode_close')
            .setLabel('❌ Close Panel')
            .setStyle(ButtonStyle.Secondary)
    );
}
