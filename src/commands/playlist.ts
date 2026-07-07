import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';
import {
    createPlaylist,
    deletePlaylist,
    getUserPlaylists,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    addTracksToPlaylist,
    PlaylistTrack,
} from '../utils/playlistStore';
import { buildManagerEmbed, buildManagerButtons, encodeManagerId } from '../utils/playlistManager';
import { buildPlaylistModeEmbed, buildPlaylistModeButtons, formatTime } from '../utils/embeds';
import {
    parseSpotifyUrl,
    getSpotifyPlaylistTracks,
    getSpotifyAlbumTracks,
    getSpotifyTrack,
    searchSpotifyTracksOnLavalink,
} from '../utils/spotify';

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Manage your personal music playlists.')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new playlist, optionally importing from a YouTube or Spotify URL.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(true))
                .addStringOption(opt => opt.setName('url').setDescription('Optional YouTube or Spotify link to import songs from').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete one of your playlists.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all of your playlists.')
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View songs in a playlist.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a song to a playlist.')
                .addStringOption(opt => opt.setName('playlist').setDescription('Name of the playlist').setRequired(true))
                .addStringOption(opt => opt.setName('song').setDescription('Song name, YouTube URL, or Spotify URL (leave empty to add current)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a song from a playlist.')
                .addStringOption(opt => opt.setName('playlist').setDescription('Name of the playlist').setRequired(true))
                .addIntegerOption(opt => opt.setName('position').setDescription('Position of the song (1-indexed)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('Play all songs from a playlist in Playlist Mode.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('manage')
                .setDescription('Open the interactive Playlist Manager to add, remove, or insert songs.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist to manage').setRequired(false))
        ),

    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'create') {
            const name = interaction.options.getString('name')!;
            const url = interaction.options.getString('url');
            const result = await createPlaylist(userId, name);
            if (!result.success) return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
            if (!url) return interaction.reply({ content: result.message });

            const spotifyInfo = parseSpotifyUrl(url);
            if (spotifyInfo) {
                await interaction.deferReply();
                const node = client.lavalink.nodeManager.leastUsedNodes()[0];
                if (!node) return interaction.followUp({ content: `Playlist **${name}** created, but no music nodes available to import.` });

                try {
                    let spotifyTracks: any[] = [];
                    if (spotifyInfo.type === 'playlist') {
                        spotifyTracks = await getSpotifyPlaylistTracks(spotifyInfo.id);
                    } else if (spotifyInfo.type === 'album') {
                        spotifyTracks = await getSpotifyAlbumTracks(spotifyInfo.id);
                    } else if (spotifyInfo.type === 'track') {
                        const track = await getSpotifyTrack(spotifyInfo.id);
                        spotifyTracks = [track];
                    }

                    if (spotifyTracks.length === 0) {
                        return interaction.followUp({ content: `Playlist **${name}** created, but no tracks found in the Spotify link.` });
                    }

                    await interaction.followUp({ content: `Importing **${spotifyTracks.length}** track(s) from Spotify. Matching on YouTube...` });
                    
                    const resolvedTracks = await searchSpotifyTracksOnLavalink(node, spotifyTracks, interaction.user);
                    if (resolvedTracks.length === 0) {
                        return interaction.followUp({ content: `Playlist **${name}** created, but failed to match any tracks on YouTube.` });
                    }

                    const trackDataList = resolvedTracks.map((t: any) => ({
                        title: t.info.title, uri: t.info.uri, duration: t.info.duration,
                        author: t.info.author, artworkUrl: t.info.artworkUrl || undefined,
                    }));
                    await addTracksToPlaylist(userId, name, trackDataList);

                    const member = interaction.member as GuildMember;
                    const voiceChannel = member?.voice?.channel;
                    if (!voiceChannel) {
                        return interaction.followUp({ content: `Playlist **${name}** created with **${trackDataList.length}** songs! Join a voice channel and use /playlist play to start.` });
                    }

                    const player = client.lavalink.createPlayer({
                        guildId: interaction.guildId!, voiceChannelId: voiceChannel.id,
                        textChannelId: interaction.channelId!, selfDeaf: true, selfMute: false, volume: 100,
                    });
                    await player.connect();
                    await player.queue.add(resolvedTracks);
                    player.set('playlistModeActive', true);
                    player.set('playlistModeName', name);
                    player.set('playlistModeTracks', trackDataList);
                    player.set('playlistModeOwnerId', userId);
                    if (!player.playing && !player.paused) await player.play();

                    const embed = buildPlaylistModeEmbed(name, trackDataList, player.queue.current?.info.uri);
                    const buttons = buildPlaylistModeButtons(name);
                    const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
                    if (panelMsg) { player.set('playlistPanelChannelId', interaction.channelId!); player.set('playlistPanelMessageId', panelMsg.id); }
                    return interaction.followUp({ content: `Playlist **${name}** created with **${trackDataList.length}** songs! Now playing.` });
                } catch (error: any) {
                    console.error('Failed to import Spotify playlist:', error);
                    return interaction.followUp({ content: `Playlist **${name}** created, but import failed: ${error.message}` });
                }
            }

            await interaction.deferReply();
            const node = client.lavalink.nodeManager.leastUsedNodes()[0];
            if (!node) return interaction.followUp({ content: `Playlist **${name}** created, but no music nodes available to import.` });

            try {
                const res = await node.search({ query: url }, interaction.user);
                if (res.loadType === 'error' || res.loadType === 'empty') {
                    return interaction.followUp({ content: `Playlist **${name}** created, but no tracks found at URL.` });
                }
                let tracksToImport: any[] = res.loadType === 'playlist' ? res.tracks : [res.tracks[0]];
                if (tracksToImport.length === 0) return interaction.followUp({ content: `Playlist **${name}** created, but no tracks found.` });

                const trackDataList = tracksToImport.map((t: any) => ({
                    title: t.info.title, uri: t.info.uri, duration: t.info.duration,
                    author: t.info.author, artworkUrl: t.info.artworkUrl || undefined,
                }));
                await addTracksToPlaylist(userId, name, trackDataList);

                const member = interaction.member as GuildMember;
                const voiceChannel = member?.voice?.channel;
                if (!voiceChannel) {
                    return interaction.followUp({ content: `Playlist **${name}** created with **${trackDataList.length}** songs! Join a voice channel and use /playlist play to start.` });
                }

                const player = client.lavalink.createPlayer({
                    guildId: interaction.guildId!, voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId!, selfDeaf: true, selfMute: false, volume: 100,
                });
                await player.connect();
                await player.queue.add(tracksToImport);
                player.set('playlistModeActive', true);
                player.set('playlistModeName', name);
                player.set('playlistModeTracks', trackDataList);
                player.set('playlistModeOwnerId', userId);
                if (!player.playing && !player.paused) await player.play();

                const embed = buildPlaylistModeEmbed(name, trackDataList, player.queue.current?.info.uri);
                const buttons = buildPlaylistModeButtons(name);
                const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
                if (panelMsg) { player.set('playlistPanelChannelId', interaction.channelId!); player.set('playlistPanelMessageId', panelMsg.id); }
                return interaction.followUp({ content: `Playlist **${name}** created with **${trackDataList.length}** songs! Now playing.` });
            } catch (error: any) {
                console.error('Failed to import playlist:', error);
                return interaction.followUp({ content: `Playlist **${name}** created, but import failed: ${error.message}` });
            }
        }

        if (subcommand === 'delete') {
            const name = interaction.options.getString('name')!;
            const result = await deletePlaylist(userId, name);
            return interaction.reply({ content: result.message, flags: result.success ? undefined : MessageFlags.Ephemeral });
        }

        if (subcommand === 'list') {
            const playlists = await getUserPlaylists(userId);
            if (playlists.length === 0) return interaction.reply({ content: "No playlists yet. Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Playlists`)
                .setColor(0x1DB954)
                .setDescription(playlists.map((p, i) => `\`${i + 1}.\` **${p.name}** -- \`${p.tracks.length} track(s)\``).join('\n'));
            const select = new StringSelectMenuBuilder()
                .setCustomId('playlist_list_select_play')
                .setPlaceholder('Select a playlist to play')
                .addOptions(playlists.map(p => new StringSelectMenuOptionBuilder().setLabel(p.name).setDescription(`${p.tracks.length} track(s)`).setValue(p.name)));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
        }

        if (subcommand === 'view') {
            const name = interaction.options.getString('name')!;
            const playlists = await getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!playlist) return interaction.reply({ content: `Playlist **${name}** not found.`, flags: MessageFlags.Ephemeral });
            const embed = new EmbedBuilder().setTitle(`Playlist: ${playlist.name}`).setColor(0x1DB954);
            if (playlist.tracks.length === 0) {
                embed.setDescription('*This playlist is empty.*');
            } else {
                embed.setDescription(playlist.tracks.map((t, i) => `\`${i + 1}.\` [${t.title}](${t.uri}) -- \`${t.author}\` (\`${formatTime(t.duration)}\`)`).join('\n').substring(0, 4000));
            }
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'add') {
            const playlistName = interaction.options.getString('playlist')!;
            const songQuery = interaction.options.getString('song');
            const playlists = await getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
            if (!playlist) return interaction.reply({ content: `Playlist **${playlistName}** not found.`, flags: MessageFlags.Ephemeral });

            if (songQuery) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const node = client.lavalink.nodeManager.leastUsedNodes()[0];
                if (!node) return interaction.followUp({ content: 'No music nodes available.' });

                const spotifyInfo = parseSpotifyUrl(songQuery);
                if (spotifyInfo) {
                    try {
                        let spotifyTracks: any[] = [];
                        if (spotifyInfo.type === 'playlist') {
                            spotifyTracks = await getSpotifyPlaylistTracks(spotifyInfo.id);
                        } else if (spotifyInfo.type === 'album') {
                            spotifyTracks = await getSpotifyAlbumTracks(spotifyInfo.id);
                        } else if (spotifyInfo.type === 'track') {
                            const track = await getSpotifyTrack(spotifyInfo.id);
                            spotifyTracks = [track];
                        }

                        if (spotifyTracks.length === 0) {
                            return interaction.followUp({ content: 'No tracks found in the Spotify link.' });
                        }

                        await interaction.followUp({ content: `Importing and matching **${spotifyTracks.length}** track(s) from Spotify...` });
                        const resolvedTracks = await searchSpotifyTracksOnLavalink(node, spotifyTracks, interaction.user);
                        if (resolvedTracks.length === 0) {
                            return interaction.followUp({ content: 'Failed to resolve any matching tracks on YouTube.' });
                        }

                        const trackDataList = resolvedTracks.map((t: any) => ({
                            title: t.info.title, uri: t.info.uri, duration: t.info.duration,
                            author: t.info.author, artworkUrl: t.info.artworkUrl || undefined,
                        }));
                        await addTracksToPlaylist(userId, playlist.name, trackDataList);
                        return interaction.followUp({ content: `Successfully added **${trackDataList.length}** track(s) from Spotify to **${playlist.name}**!` });
                    } catch (error: any) {
                        console.error('Failed to add Spotify tracks to playlist:', error);
                        return interaction.followUp({ content: `Failed to add Spotify tracks: ${error.message}` });
                    }
                }

                const res = await node.search({ query: songQuery }, interaction.user);
                if (res.loadType === 'error' || res.loadType === 'empty') return interaction.followUp({ content: 'No results found.' });
                const track = res.tracks[0];
                const result = await addTrackToPlaylist(userId, playlist.name, {
                    title: track.info.title, uri: track.info.uri, duration: track.info.duration,
                    author: track.info.author, artworkUrl: track.info.artworkUrl || undefined,
                });
                return interaction.followUp({ content: result.message });
            } else {
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player || !player.queue.current) return interaction.reply({ content: 'Nothing is playing. Provide a song query or play something first!', flags: MessageFlags.Ephemeral });
                const track = player.queue.current;
                const result = await addTrackToPlaylist(userId, playlist.name, {
                    title: track.info.title, uri: track.info.uri, duration: track.info.duration,
                    author: track.info.author, artworkUrl: track.info.artworkUrl || undefined,
                });
                return interaction.reply({ content: result.message });
            }
        }

        if (subcommand === 'remove') {
            const playlistName = interaction.options.getString('playlist')!;
            const position = interaction.options.getInteger('position');
            const playlists = await getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());
            if (!playlist) return interaction.reply({ content: `Playlist **${playlistName}** not found.`, flags: MessageFlags.Ephemeral });
            if (playlist.tracks.length === 0) return interaction.reply({ content: `Playlist **${playlist.name}** is already empty.`, flags: MessageFlags.Ephemeral });

            if (position !== null) {
                const result = await removeTrackFromPlaylist(userId, playlist.name, position - 1);
                return interaction.reply({ content: result.message, flags: result.success ? undefined : MessageFlags.Ephemeral });
            } else {
                const options = playlist.tracks.slice(0, 25).map((t, i) => new StringSelectMenuOptionBuilder().setLabel(`${i + 1}. ${t.title.substring(0, 95)}`).setValue(i.toString()));
                const select = new StringSelectMenuBuilder().setCustomId(`playlist_select_remove_${playlist.name}`).setPlaceholder('Select a song to remove').addOptions(options);
                return interaction.reply({ content: `Select a song to remove from **${playlist.name}**:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], flags: MessageFlags.Ephemeral });
            }
        }

        if (subcommand === 'play') {
            const name = interaction.options.getString('name');
            const member = interaction.member as GuildMember;
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) return interaction.reply({ content: 'You need to be in a voice channel!', flags: MessageFlags.Ephemeral });

            const playlists = await getUserPlaylists(userId);
            if (playlists.length === 0) return interaction.reply({ content: "No playlists yet. Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });

            if (!name) {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('playlist_list_select_play')
                    .setPlaceholder('Select a playlist to play')
                    .addOptions(playlists.map(p => new StringSelectMenuOptionBuilder().setLabel(p.name).setDescription(`${p.tracks.length} track(s)`).setValue(p.name)));
                return interaction.reply({ content: 'Select a playlist to play:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], flags: MessageFlags.Ephemeral });
            }

            const playlist = playlists.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!playlist) return interaction.reply({ content: `Playlist **${name}** not found.`, flags: MessageFlags.Ephemeral });
            if (playlist.tracks.length === 0) return interaction.reply({ content: `Playlist **${playlist.name}** has no songs!`, flags: MessageFlags.Ephemeral });

            await interaction.deferReply();
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId!, voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId!, selfDeaf: true, selfMute: false, volume: 100,
            });
            await player.connect();
            interaction.followUp({ content: `Loading **${playlist.tracks.length}** songs from **${playlist.name}**...` });

            let loadedCount = 0;
            for (const track of playlist.tracks) {
                try {
                    const res = await player.search({ query: track.uri }, interaction.user);
                    if (res.loadType === 'track' || res.loadType === 'search' || (res.loadType === 'playlist' && res.tracks.length > 0)) {
                        await player.queue.add(res.tracks[0]); loadedCount++;
                    } else {
                        const fb = await player.search({ query: `ytmsearch:${track.author} ${track.title}` }, interaction.user);
                        if (fb.tracks.length > 0) { await player.queue.add(fb.tracks[0]); loadedCount++; }
                    }
                } catch (e) { console.error(`Failed to load ${track.title}:`, e); }
            }

            player.set('playlistModeActive', true);
            player.set('playlistModeName', playlist.name);
            player.set('playlistModeTracks', playlist.tracks);
            player.set('playlistModeOwnerId', userId);
            if (!player.playing && !player.paused) await player.play();

            const embed = buildPlaylistModeEmbed(playlist.name, playlist.tracks, player.queue.current?.info.uri);
            const buttons = buildPlaylistModeButtons(playlist.name);
            const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
            if (panelMsg) { player.set('playlistPanelChannelId', interaction.channelId!); player.set('playlistPanelMessageId', panelMsg.id); }
            return interaction.followUp({ content: `Loaded **${loadedCount}/${playlist.tracks.length}** songs. Playlist Mode is now Active.` });
        }

        if (subcommand === 'manage') {
            const name = interaction.options.getString('name');
            const playlists = await getUserPlaylists(userId);
            if (playlists.length === 0) return interaction.reply({ content: "No playlists yet. Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });

            if (!name) {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('playlist_manage_select')
                    .setPlaceholder('Select a playlist to manage')
                    .addOptions(playlists.map(p => new StringSelectMenuOptionBuilder().setLabel(p.name).setDescription(`${p.tracks.length} track(s)`).setValue(p.name)));
                return interaction.reply({ content: 'Select a playlist to manage:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], flags: MessageFlags.Ephemeral });
            }

            const playlist = playlists.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!playlist) return interaction.reply({ content: `Playlist **${name}** not found.`, flags: MessageFlags.Ephemeral });

            const embed = buildManagerEmbed(playlist.name, playlist.tracks, 1, interaction.user.username);
            const buttons = buildManagerButtons(playlist.name, 1, playlist.tracks.length, userId);
            return interaction.reply({ embeds: [embed], components: buttons });
        }
    },
};