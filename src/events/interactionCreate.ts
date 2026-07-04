import {
    Events,
    Client,
    Interaction,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextChannel,
    GuildMember,
} from 'discord.js';
import { getUserPlaylists, addTrackToPlaylist, removeTrackFromPlaylist, insertTrackAtPosition, PlaylistTrack } from '../utils/playlistStore';
import { buildPlaylistModeEmbed, buildPlaylistModeButtons, buildQueueEmbed, buildNowPlayingEmbed, buildPlayerButtons, formatTime } from '../utils/embeds';
import { buildManagerEmbed, buildManagerButtons, encodeManagerId, decodeManagerId, TRACKS_PER_PAGE } from '../utils/playlistManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(input: string): number | null {
    input = input.trim().toLowerCase();
    const parts = input.split(':');
    if (parts.length === 2) {
        const min = parseInt(parts[0], 10);
        const sec = parseInt(parts[1], 10);
        if (!isNaN(min) && !isNaN(sec) && sec >= 0 && sec < 60) {
            return (min * 60 + sec) * 1000;
        }
    }
    if (input.endsWith('s')) {
        const sec = parseInt(input.slice(0, -1), 10);
        if (!isNaN(sec)) return sec * 1000;
    }
    const totalSec = parseInt(input, 10);
    if (!isNaN(totalSec)) {
        return totalSec * 1000;
    }
    return null;
}

/** Refresh the playlist manager panel message */
async function refreshManagerPanel(
    interaction: any,
    userId: string,
    playlistName: string,
    page: number
): Promise<void> {
    const playlists = await getUserPlaylists(userId);
    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
    if (!playlist) return;

    const totalPages = Math.max(1, Math.ceil(playlist.tracks.length / TRACKS_PER_PAGE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const ownerName = interaction.user?.username ?? 'Unknown';
    const embed = buildManagerEmbed(playlist.name, playlist.tracks, safePage, ownerName);
    const buttons = buildManagerButtons(playlist.name, safePage, playlist.tracks.length, userId);

    await interaction.message.edit({ embeds: [embed], components: buttons }).catch(() => {});
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction: Interaction, client: Client) {

        // ═══════════════════════════════════════════════════════════════════
        // SLASH COMMANDS
        // ═══════════════════════════════════════════════════════════════════
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
                }
            }

        // ═══════════════════════════════════════════════════════════════════
        // STRING SELECT MENUS
        // ═══════════════════════════════════════════════════════════════════
        } else if (interaction.isStringSelectMenu()) {

            // ── Search result select ────────────────────────────────────────
            if (interaction.customId === 'search_select') {
                const command = client.commands.get('search');
                if (command && command.handleSelect) {
                    await command.handleSelect(interaction, client);
                }

            // ── Player: remove from live queue ──────────────────────────────
            } else if (interaction.customId === 'player_remove_select') {
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player) return interaction.reply({ content: 'No active player.', flags: MessageFlags.Ephemeral });

                const index = parseInt(interaction.values[0], 10);
                if (isNaN(index) || index < 0 || index >= player.queue.tracks.length) {
                    return interaction.reply({ content: 'Invalid song selected.', flags: MessageFlags.Ephemeral });
                }

                const removedTrack = player.queue.tracks[index];
                player.queue.splice(index, 1);
                await interaction.reply({ content: `🗑️ Removed **${removedTrack.info.title}** from the queue.`, flags: MessageFlags.Ephemeral });

            // ── Playlist list → play ────────────────────────────────────────
            } else if (interaction.customId === 'playlist_list_select_play') {
                const playlistName = interaction.values[0];
                const member = interaction.member as GuildMember;
                const voiceChannel = member?.voice?.channel;

                if (!voiceChannel) {
                    return interaction.reply({ content: 'You need to be in a voice channel to play a playlist!', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply();

                const playlists = await getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
                if (!playlist) {
                    return interaction.followUp({ content: `Playlist **${playlistName}** was not found.` });
                }

                if (playlist.tracks.length === 0) {
                    return interaction.followUp({ content: `Playlist **${playlist.name}** has no tracks.` });
                }

                const player = client.lavalink.createPlayer({
                    guildId: interaction.guildId!,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId!,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100,
                });

                await player.connect();
                await interaction.followUp({ content: `🔄 Loading **${playlist.tracks.length}** songs from **${playlist.name}**...` });

                let loadedCount = 0;
                for (const track of playlist.tracks) {
                    try {
                        const res = await player.search({ query: track.uri }, interaction.user);
                        if (res.loadType === 'track' || res.loadType === 'search' || (res.loadType === 'playlist' && res.tracks.length > 0)) {
                            await player.queue.add(res.tracks[0]);
                            loadedCount++;
                        } else {
                            const fallbackRes = await player.search({ query: `ytmsearch:${track.author} ${track.title}` }, interaction.user);
                            if (fallbackRes.tracks.length > 0) {
                                await player.queue.add(fallbackRes.tracks[0]);
                                loadedCount++;
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to load track ${track.title}:`, e);
                    }
                }

                player.set('playlistModeActive', true);
                player.set('playlistModeName', playlist.name);
                player.set('playlistModeTracks', playlist.tracks);
                player.set('playlistModeOwnerId', interaction.user.id);

                if (!player.playing && !player.paused) {
                    await player.play();
                }

                const currentTrackUri = player.queue.current?.info.uri;
                const embed = buildPlaylistModeEmbed(playlist.name, playlist.tracks, currentTrackUri);
                const buttons = buildPlaylistModeButtons(playlist.name);

                const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
                if (panelMsg) {
                    player.set('playlistPanelChannelId', interaction.channelId!);
                    player.set('playlistPanelMessageId', panelMsg.id);
                }

                return interaction.followUp({ content: `✅ Loaded **${loadedCount}/${playlist.tracks.length}** songs. Playlist Mode is now **Active**.` });

            // ── Player: playlist mode select ────────────────────────────────
            } else if (interaction.customId === 'player_playlist_select_play') {
                const playlistName = interaction.values[0];
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player) return interaction.reply({ content: 'No active player.', flags: MessageFlags.Ephemeral });

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const playlists = await getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
                if (!playlist) {
                    return interaction.followUp({ content: `Playlist **${playlistName}** was not found.` });
                }

                if (playlist.tracks.length === 0) {
                    return interaction.followUp({ content: `Playlist **${playlist.name}** is empty.` });
                }

                let loadedCount = 0;
                for (const track of playlist.tracks) {
                    try {
                        const res = await player.search({ query: track.uri }, interaction.user);
                        if (res.loadType === 'track' || res.loadType === 'search' || (res.loadType === 'playlist' && res.tracks.length > 0)) {
                            await player.queue.add(res.tracks[0]);
                            loadedCount++;
                        } else {
                            const fallback = await player.search({ query: `ytmsearch:${track.author} ${track.title}` }, interaction.user);
                            if (fallback.tracks.length > 0) {
                                await player.queue.add(fallback.tracks[0]);
                                loadedCount++;
                            }
                        }
                    } catch (e) {
                        console.error('Failed to load playlist track:', e);
                    }
                }

                player.set('playlistModeActive', true);
                player.set('playlistModeName', playlist.name);
                player.set('playlistModeTracks', playlist.tracks);
                player.set('playlistModeOwnerId', interaction.user.id);

                if (!player.playing && !player.paused) {
                    await player.play();
                }

                const currentTrackUri = player.queue.current?.info.uri;
                const embed = buildPlaylistModeEmbed(playlist.name, playlist.tracks, currentTrackUri);
                const buttons = buildPlaylistModeButtons(playlist.name);

                const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
                if (panelMsg) {
                    player.set('playlistPanelChannelId', interaction.channelId!);
                    player.set('playlistPanelMessageId', panelMsg.id);
                }

                await interaction.followUp({ content: `✅ Playlist **${playlist.name}** started! Loaded **${loadedCount}/${playlist.tracks.length}** songs.` });

            // ── Playlist: remove song via select ────────────────────────────
            } else if (interaction.customId.startsWith('playlist_select_remove_')) {
                const playlistName = interaction.customId.replace('playlist_select_remove_', '');
                const index = parseInt(interaction.values[0], 10);
                const result = await removeTrackFromPlaylist(interaction.user.id, playlistName, index);

                if (result.success) {
                    const player = client.lavalink.getPlayer(interaction.guildId!);
                    if (player && player.get('playlistModeActive') && (player.get('playlistModeName') as string).toLowerCase() === playlistName.toLowerCase()) {
                        const updatedPlaylists = await getUserPlaylists(interaction.user.id);
                        const updatedPlaylist = updatedPlaylists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
                        if (updatedPlaylist) {
                            player.set('playlistModeTracks', updatedPlaylist.tracks);
                            const panelMsgId = player.get('playlistPanelMessageId') as string;
                            const panelChanId = player.get('playlistPanelChannelId') as string;
                            if (panelMsgId && panelChanId) {
                                const panelChannel = client.channels.cache.get(panelChanId) as TextChannel;
                                if (panelChannel) {
                                    const currentTrackUri = player.queue.current?.info.uri;
                                    const embed = buildPlaylistModeEmbed(updatedPlaylist.name, updatedPlaylist.tracks, currentTrackUri);
                                    panelChannel.messages.edit(panelMsgId, { embeds: [embed] }).catch(() => {});
                                }
                            }
                        }
                    }
                }

                await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });

            // ── Manager: select playlist to manage ──────────────────────────
            } else if (interaction.customId === 'playlist_manage_select') {
                const playlistName = interaction.values[0];
                const playlists = await getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply({ content: `Playlist **${playlistName}** was not found.`, flags: MessageFlags.Ephemeral });
                }

                const embed = buildManagerEmbed(playlist.name, playlist.tracks, 1, interaction.user.username);
                const buttons = buildManagerButtons(playlist.name, 1, playlist.tracks.length, interaction.user.id);

                await interaction.update({ content: null, embeds: [embed], components: buttons });

            // ── Manager: remove song via select ─────────────────────────────
            } else if (interaction.customId.startsWith('pmgr_remove_select_')) {
                const safeId = interaction.customId.replace('pmgr_remove_select_', '');
                // safeId = {userId}_{encodedName}_{page}
                const lastUnderscore = safeId.lastIndexOf('_');
                const page = parseInt(safeId.substring(lastUnderscore + 1), 10) || 1;
                const decoded = decodeManagerId(safeId.substring(0, lastUnderscore));
                if (!decoded || decoded.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                }

                const { userId, playlistName } = decoded;
                const index = parseInt(interaction.values[0], 10);
                const result = await removeTrackFromPlaylist(userId, playlistName, index);

                if (!result.success) {
                    return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();
                await refreshManagerPanel(interaction, userId, playlistName, page);
                await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
            }

        // ═══════════════════════════════════════════════════════════════════
        // MODALS
        // ═══════════════════════════════════════════════════════════════════
        } else if (interaction.isModalSubmit()) {

            // ── Player: add song modal ──────────────────────────────────────
            if (interaction.customId === 'player_add_modal') {
                const query = interaction.fields.getTextInputValue('song_query');
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player) return interaction.reply({ content: 'No active player.', flags: MessageFlags.Ephemeral });

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const res = await player.search({ query }, interaction.user);

                if (res.loadType === 'error' || res.loadType === 'empty') {
                    return interaction.followUp({ content: 'No results found.' });
                }

                if (res.loadType === 'playlist') {
                    await player.queue.add(res.tracks);
                    return interaction.followUp({ content: `Added playlist **${res.playlist?.title || 'Unknown'}** to the queue.` });
                } else {
                    const track = res.tracks[0];
                    await player.queue.add(track);
                    return interaction.followUp({ content: `Added **${track.info.title}** to the queue.` });
                }

            // ── Player: volume modal ────────────────────────────────────────
            } else if (interaction.customId === 'player_volume_modal') {
                const volumeInput = interaction.fields.getTextInputValue('volume_level');
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player) return interaction.reply({ content: 'No active player.', flags: MessageFlags.Ephemeral });

                const volume = parseInt(volumeInput, 10);
                if (isNaN(volume) || volume < 1 || volume > 100) {
                    return interaction.reply({ content: '❌ Invalid volume level. Please enter a number between 1 and 100.', flags: MessageFlags.Ephemeral });
                }

                await player.setVolume(volume);

                const currentTrack = player.queue.current;
                if (currentTrack && interaction.message) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }

                return interaction.reply({ content: `🔊 Volume adjusted to **${volume}%**.`, flags: MessageFlags.Ephemeral });

            // ── Player: seek modal ──────────────────────────────────────────
            } else if (interaction.customId === 'player_seek_modal') {
                const seekInput = interaction.fields.getTextInputValue('seek_time');
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player) return interaction.reply({ content: 'No active player.', flags: MessageFlags.Ephemeral });
                if (!player.queue.current) return interaction.reply({ content: 'Nothing is currently playing.', flags: MessageFlags.Ephemeral });

                const ms = parseTime(seekInput);
                if (ms === null || ms < 0) {
                    return interaction.reply({ content: '❌ Invalid format. Use `mm:ss` (e.g. 1:30), `ss` (e.g. 45s), or raw seconds (e.g. 90).', flags: MessageFlags.Ephemeral });
                }

                const duration = player.queue.current.info.duration;
                if (ms > duration) {
                    return interaction.reply({ content: `❌ Timestamp exceeds song duration (\`${formatTime(duration)}\`).`, flags: MessageFlags.Ephemeral });
                }

                await player.seek(ms);

                const currentTrack = player.queue.current;
                if (currentTrack && interaction.message) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }

                return interaction.reply({ content: `⏱️ Seeked to **${formatTime(ms)}**.`, flags: MessageFlags.Ephemeral });

            // ── Manager: add song modal ─────────────────────────────────────
            } else if (interaction.customId.startsWith('pmgr_add_modal_')) {
                const rest = interaction.customId.replace('pmgr_add_modal_', '');
                const lastUnderscore = rest.lastIndexOf('_');
                const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                const decoded = decodeManagerId(rest.substring(0, lastUnderscore));

                if (!decoded || decoded.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                }

                const { userId, playlistName } = decoded;
                const query = interaction.fields.getTextInputValue('song_query');

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                try {
                    const node = (client as any).lavalink.nodeManager.leastUsedNodes()[0];
                    if (!node) {
                        return interaction.followUp({ content: '❌ No music nodes available.' });
                    }

                    const res = await node.search({ query }, interaction.user);
                    if (res.loadType === 'error' || res.loadType === 'empty' || res.tracks.length === 0) {
                        return interaction.followUp({ content: '❌ No results found for that query.' });
                    }

                    const track = res.tracks[0];
                    const trackData: PlaylistTrack = {
                        title: track.info.title,
                        uri: track.info.uri,
                        duration: track.info.duration,
                        author: track.info.author,
                        artworkUrl: track.info.artworkUrl || undefined,
                    };

                    const result = await addTrackToPlaylist(userId, playlistName, trackData);
                    if (!result.success) {
                        return interaction.followUp({ content: `❌ ${result.message}` });
                    }

                    await refreshManagerPanel(interaction, userId, playlistName, page);
                    await interaction.followUp({ content: `✅ ${result.message}` });
                } catch (err: any) {
                    console.error('Manager add song error:', err);
                    await interaction.followUp({ content: `❌ Error searching for song: ${err.message}` });
                }

            // ── Manager: insert song modal ──────────────────────────────────
            } else if (interaction.customId.startsWith('pmgr_insert_modal_')) {
                const rest = interaction.customId.replace('pmgr_insert_modal_', '');
                const lastUnderscore = rest.lastIndexOf('_');
                const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                const decoded = decodeManagerId(rest.substring(0, lastUnderscore));

                if (!decoded || decoded.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                }

                const { userId, playlistName } = decoded;
                const songQuery = interaction.fields.getTextInputValue('insert_song');
                const positionStr = interaction.fields.getTextInputValue('insert_position');
                const position = parseInt(positionStr, 10);

                if (isNaN(position) || position < 1) {
                    return interaction.reply({ content: '❌ Invalid position. Please enter a number ≥ 1.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                try {
                    const node = (client as any).lavalink.nodeManager.leastUsedNodes()[0];
                    if (!node) {
                        return interaction.followUp({ content: '❌ No music nodes available.' });
                    }

                    const res = await node.search({ query: songQuery }, interaction.user);
                    if (res.loadType === 'error' || res.loadType === 'empty' || res.tracks.length === 0) {
                        return interaction.followUp({ content: '❌ No results found for that query.' });
                    }

                    const track = res.tracks[0];
                    const trackData: PlaylistTrack = {
                        title: track.info.title,
                        uri: track.info.uri,
                        duration: track.info.duration,
                        author: track.info.author,
                        artworkUrl: track.info.artworkUrl || undefined,
                    };

                    // position is 1-indexed from user, insertTrackAtPosition wants 0-indexed
                    const result = await insertTrackAtPosition(userId, playlistName, trackData, position - 1);
                    if (!result.success) {
                        return interaction.followUp({ content: `❌ ${result.message}` });
                    }

                    await refreshManagerPanel(interaction, userId, playlistName, page);
                    await interaction.followUp({ content: `✅ ${result.message}` });
                } catch (err: any) {
                    console.error('Manager insert song error:', err);
                    await interaction.followUp({ content: `❌ Error: ${err.message}` });
                }
            }

        // ═══════════════════════════════════════════════════════════════════
        // BUTTONS
        // ═══════════════════════════════════════════════════════════════════
        } else if (interaction.isButton()) {

            // ── Playlist Manager buttons (pmgr_*) ───────────────────────────
            if (interaction.customId.startsWith('pmgr_')) {

                // ── Pagination: prev ────────────────────────────────────────
                if (interaction.customId.startsWith('pmgr_prev_')) {
                    const rest = interaction.customId.replace('pmgr_prev_', '');
                    const lastUnderscore = rest.lastIndexOf('_');
                    const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                    const decoded = decodeManagerId(rest.substring(0, lastUnderscore));
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.deferUpdate();
                    await refreshManagerPanel(interaction, decoded.userId, decoded.playlistName, page - 1);

                // ── Pagination: next ────────────────────────────────────────
                } else if (interaction.customId.startsWith('pmgr_next_')) {
                    const rest = interaction.customId.replace('pmgr_next_', '');
                    const lastUnderscore = rest.lastIndexOf('_');
                    const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                    const decoded = decodeManagerId(rest.substring(0, lastUnderscore));
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.deferUpdate();
                    await refreshManagerPanel(interaction, decoded.userId, decoded.playlistName, page + 1);

                // ── Add song button → show modal ────────────────────────────
                } else if (interaction.customId.startsWith('pmgr_add_')) {
                    const rest = interaction.customId.replace('pmgr_add_', '');
                    const lastUnderscore = rest.lastIndexOf('_');
                    const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                    const decoded = decodeManagerId(rest.substring(0, lastUnderscore));
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                    }

                    const safeId = encodeManagerId(decoded.userId, decoded.playlistName);
                    const modal = new ModalBuilder()
                        .setCustomId(`pmgr_add_modal_${safeId}_${page}`)
                        .setTitle(`Add Song to "${decoded.playlistName}"`);

                    const input = new TextInputBuilder()
                        .setCustomId('song_query')
                        .setLabel('Song Name or URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Never Gonna Give You Up')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                    await interaction.showModal(modal);

                // ── Insert at position button → show modal ──────────────────
                } else if (interaction.customId.startsWith('pmgr_insert_')) {
                    const rest = interaction.customId.replace('pmgr_insert_', '');
                    const lastUnderscore = rest.lastIndexOf('_');
                    const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                    const decoded = decodeManagerId(rest.substring(0, lastUnderscore));
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                    }

                    const safeId = encodeManagerId(decoded.userId, decoded.playlistName);
                    const modal = new ModalBuilder()
                        .setCustomId(`pmgr_insert_modal_${safeId}_${page}`)
                        .setTitle(`Insert Song into "${decoded.playlistName}"`);

                    const songInput = new TextInputBuilder()
                        .setCustomId('insert_song')
                        .setLabel('Song Name or URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. Shape of You')
                        .setRequired(true);

                    const posInput = new TextInputBuilder()
                        .setCustomId('insert_position')
                        .setLabel('Insert at Position (1 = first)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g. 3')
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(songInput),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(posInput)
                    );
                    await interaction.showModal(modal);

                // ── Remove song button → show select menu ───────────────────
                } else if (interaction.customId.startsWith('pmgr_remove_') && !interaction.customId.startsWith('pmgr_remove_select_')) {
                    const rest = interaction.customId.replace('pmgr_remove_', '');
                    const lastUnderscore = rest.lastIndexOf('_');
                    const page = parseInt(rest.substring(lastUnderscore + 1), 10) || 1;
                    const decoded = decodeManagerId(rest.substring(0, lastUnderscore));
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot manage someone else\'s playlist.', flags: MessageFlags.Ephemeral });
                    }

                    const { userId, playlistName } = decoded;
                    const playlists = await getUserPlaylists(userId);
                    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                    if (!playlist || playlist.tracks.length === 0) {
                        return interaction.reply({ content: '❌ Playlist is empty.', flags: MessageFlags.Ephemeral });
                    }

                    const start = (page - 1) * TRACKS_PER_PAGE;
                    const pageTracks = playlist.tracks.slice(start, start + TRACKS_PER_PAGE);

                    const options = pageTracks.map((t, i) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${start + i + 1}. ${t.title.substring(0, 95)}`)
                            .setDescription(t.author.substring(0, 50))
                            .setValue((start + i).toString()  // global index
                            )
                    );

                    const safeId = encodeManagerId(userId, playlistName);
                    const select = new StringSelectMenuBuilder()
                        .setCustomId(`pmgr_remove_select_${safeId}_${page}`)
                        .setPlaceholder('Select a song to remove')
                        .addOptions(options);

                    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                    await interaction.reply({
                        content: `Select a song to remove from **${playlistName}** (showing page ${page}):`,
                        components: [row],
                        flags: MessageFlags.Ephemeral,
                    });

                // ── Close manager panel ─────────────────────────────────────
                } else if (interaction.customId.startsWith('pmgr_close_')) {
                    const safeId = interaction.customId.replace('pmgr_close_', '');
                    const decoded = decodeManagerId(safeId);
                    if (!decoded || decoded.userId !== interaction.user.id) {
                        return interaction.reply({ content: '❌ You cannot close someone else\'s panel.', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.message.delete().catch(() => {});
                    return interaction.reply({ content: '✅ Playlist Manager closed.', flags: MessageFlags.Ephemeral });
                }

                return; // Done with all pmgr_ buttons
            }

            // ── Regular player buttons ──────────────────────────────────────
            const player = client.lavalink.getPlayer(interaction.guildId!);
            if (!player) {
                return interaction.reply({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
            }

            // Queue page navigation
            if (interaction.customId.startsWith('queue_page_prev_') || interaction.customId.startsWith('queue_page_next_')) {
                const parts = interaction.customId.split('_');
                const isNext = parts[2] === 'next';
                const currentPage = parseInt(parts[3], 10);
                const targetPage = isNext ? currentPage + 1 : currentPage - 1;

                const { embed, components } = buildQueueEmbed(player, targetPage);
                await interaction.update({ embeds: [embed], components });
                return;
            }

            // Playlist panel: add current song
            if (interaction.customId.startsWith('playlist_mode_add_')) {
                const playlistName = interaction.customId.replace('playlist_mode_add_', '');
                const currentTrack = player.queue.current;
                if (!currentTrack) {
                    return interaction.reply({ content: 'Nothing is currently playing.', flags: MessageFlags.Ephemeral });
                }

                const trackData: PlaylistTrack = {
                    title: currentTrack.info.title,
                    uri: currentTrack.info.uri,
                    duration: currentTrack.info.duration,
                    author: currentTrack.info.author,
                    artworkUrl: currentTrack.info.artworkUrl || undefined,
                };

                const result = await addTrackToPlaylist(interaction.user.id, playlistName, trackData);
                if (result.success) {
                    const playlists = await getUserPlaylists(interaction.user.id);
                    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
                    if (playlist) {
                        player.set('playlistModeTracks', playlist.tracks);
                        const embed = buildPlaylistModeEmbed(playlist.name, playlist.tracks, currentTrack.info.uri);
                        await interaction.message.edit({ embeds: [embed] }).catch(() => {});
                    }
                }

                return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
            }

            // Playlist panel: remove song
            if (interaction.customId.startsWith('playlist_mode_remove_')) {
                const playlistName = interaction.customId.replace('playlist_mode_remove_', '');
                const playlists = await getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist || playlist.tracks.length === 0) {
                    return interaction.reply({ content: 'Playlist is empty or not found.', flags: MessageFlags.Ephemeral });
                }

                const options = playlist.tracks.slice(0, 25).map((t, i) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${i + 1}. ${t.title.substring(0, 95)}`)
                        .setValue(i.toString())
                );

                const select = new StringSelectMenuBuilder()
                    .setCustomId(`playlist_select_remove_${playlist.name}`)
                    .setPlaceholder('Select a song to remove')
                    .addOptions(options);

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                return interaction.reply({ content: `Select a song to remove from **${playlist.name}**:`, components: [row], flags: MessageFlags.Ephemeral });
            }

            // Playlist panel: close
            if (interaction.customId === 'playlist_mode_close') {
                player.set('playlistModeActive', false);
                player.set('playlistPanelMessageId', null);
                player.set('playlistPanelChannelId', null);
                await interaction.message.delete().catch(() => {});
                return interaction.reply({ content: '❌ Playlist Mode Panel closed.', flags: MessageFlags.Ephemeral });
            }

            // ── Standard player controls ────────────────────────────────────

            if (interaction.customId === 'player_prev') {
                await interaction.deferUpdate();
                const previous = await player.queue.shiftPrevious();
                if (!previous) {
                    return interaction.followUp({ content: 'No previous tracks in history.', flags: MessageFlags.Ephemeral });
                }
                if (player.queue.current) {
                    player.queue.tracks.unshift(player.queue.current);
                }
                await player.play({ clientTrack: previous });
                return interaction.followUp({ content: '⏮️ Playing the previous track.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId === 'player_pause') {
                await interaction.deferUpdate();
                if (player.paused) {
                    await player.resume();
                    await interaction.followUp({ content: '▶️ Resumed the playback.', flags: MessageFlags.Ephemeral });
                } else {
                    await player.pause();
                    await interaction.followUp({ content: '⏸️ Paused the playback.', flags: MessageFlags.Ephemeral });
                }
                const currentTrack = player.queue.current;
                if (currentTrack) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }
            } else if (interaction.customId === 'player_skip') {
                await interaction.deferUpdate();
                await player.skip();
                await interaction.followUp({ content: '⏭️ Skipped the track.', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_stop') {
                await interaction.deferUpdate();
                await player.queue.splice(0, player.queue.tracks.length);
                await player.stopPlaying(false, true);
                await interaction.followUp({ content: '🛑 Stopped playback and cleared the queue.', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_queue') {
                if (!player.queue.current && player.queue.tracks.length === 0) {
                    return interaction.reply({ content: 'The queue is currently empty.', flags: MessageFlags.Ephemeral });
                }
                const { embed, components } = buildQueueEmbed(player, 1);
                await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_shuffle') {
                await interaction.deferUpdate();
                await player.queue.shuffle();
                await interaction.followUp({ content: '🔀 Queue has been shuffled!', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_loop') {
                await interaction.deferUpdate();
                const current = player.repeatMode;
                let nextMode: 'off' | 'track' | 'queue' = 'off';
                if (current === 'off') nextMode = 'track';
                else if (current === 'track') nextMode = 'queue';
                else if (current === 'queue') nextMode = 'off';

                await player.setRepeatMode(nextMode);
                const modeStr = nextMode === 'off' ? 'Off' : nextMode === 'track' ? 'Current Song' : 'Entire Queue';

                const currentTrack = player.queue.current;
                if (currentTrack) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }

                await interaction.followUp({ content: `🔁 Loop mode set to: **${modeStr}**`, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_autoplay') {
                await interaction.deferUpdate();
                const isAutoplay = player.get('autoplay') || false;
                player.set('autoplay', !isAutoplay);

                const currentTrack = player.queue.current;
                if (currentTrack) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }

                await interaction.followUp({ content: `🤖 Autoplay is now **${!isAutoplay ? 'Enabled' : 'Disabled'}**.`, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_seek') {
                const currentTrack = player.queue.current;
                if (!currentTrack) {
                    return interaction.reply({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
                }

                const modal = new ModalBuilder()
                    .setCustomId('player_seek_modal')
                    .setTitle('Seek to Timestamp');

                const input = new TextInputBuilder()
                    .setCustomId('seek_time')
                    .setLabel('Timestamp (e.g. 1:30, 45s, 90)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. 1:30')
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (interaction.customId === 'player_seek_back') {
                await interaction.deferUpdate();
                if (!player.queue.current) {
                    return interaction.followUp({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
                }
                const newPos = Math.max(0, player.position - 30000);
                await player.seek(newPos);

                const currentTrack = player.queue.current;
                if (currentTrack) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }
                return interaction.followUp({ content: `⏪ Rewound 30 seconds (now at **${formatTime(newPos)}**).`, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_seek_forward') {
                await interaction.deferUpdate();
                if (!player.queue.current) {
                    return interaction.followUp({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
                }
                const newPos = Math.min(player.queue.current.info.duration, player.position + 30000);
                await player.seek(newPos);

                const currentTrack = player.queue.current;
                if (currentTrack) {
                    await interaction.message.edit({
                        embeds: [buildNowPlayingEmbed(player, currentTrack)],
                        components: buildPlayerButtons(player),
                    }).catch(() => {});
                }
                return interaction.followUp({ content: `⏩ Fast forwarded 30 seconds (now at **${formatTime(newPos)}**).`, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_volume_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('player_volume_modal')
                    .setTitle('Adjust Playback Volume');

                const input = new TextInputBuilder()
                    .setCustomId('volume_level')
                    .setLabel('Volume Level (1-100)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. 50')
                    .setValue(player.volume.toString())
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (interaction.customId === 'player_playlist_mode') {
                const playlists = await getUserPlaylists(interaction.user.id);
                if (playlists.length === 0) {
                    return interaction.reply({ content: "You don't have any playlists yet! Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });
                }

                const options = playlists.map(p =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(p.name)
                        .setDescription(`${p.tracks.length} track(s)`)
                        .setValue(p.name)
                );

                const select = new StringSelectMenuBuilder()
                    .setCustomId('player_playlist_select_play')
                    .setPlaceholder('Select a playlist to play')
                    .addOptions(options);

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                await interaction.reply({ content: 'Select a playlist to play in **Playlist Mode**:', components: [row], flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_add') {
                const modal = new ModalBuilder()
                    .setCustomId('player_add_modal')
                    .setTitle('Add a Song to Queue');

                const input = new TextInputBuilder()
                    .setCustomId('song_query')
                    .setLabel('Song Name or URL')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. Never Gonna Give You Up')
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (interaction.customId === 'player_remove') {
                if (player.queue.tracks.length === 0) {
                    return interaction.reply({ content: 'The queue is currently empty.', flags: MessageFlags.Ephemeral });
                }

                const options = player.queue.tracks.slice(0, 25).map((t: any, i: number) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${i + 1}. ${t.info.title.substring(0, 95)}`)
                        .setValue(i.toString())
                );

                const select = new StringSelectMenuBuilder()
                    .setCustomId('player_remove_select')
                    .setPlaceholder('Select a song to remove')
                    .addOptions(options);

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                await interaction.reply({ content: 'Select a song to remove:', components: [row], flags: MessageFlags.Ephemeral });
            }
        }
    },
};
