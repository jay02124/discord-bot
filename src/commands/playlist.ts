import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, MessageFlags, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { createPlaylist, deletePlaylist, getUserPlaylists, addTrackToPlaylist, removeTrackFromPlaylist, addTracksToPlaylist } from '../utils/playlistStore';
import { buildPlaylistModeEmbed, buildPlaylistModeButtons, formatTime } from '../utils/embeds';

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Manage your personal music playlists.')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new playlist, optionally importing from a YouTube playlist URL.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(true))
                .addStringOption(opt => opt.setName('url').setDescription('Optional YouTube playlist link to import songs from').setRequired(false))
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
                .addStringOption(opt => opt.setName('song').setDescription('Song name or URL (leaves empty to add currently playing)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a song from a playlist.')
                .addStringOption(opt => opt.setName('playlist').setDescription('Name of the playlist').setRequired(true))
                .addIntegerOption(opt => opt.setName('position').setDescription('Position of the song in the playlist (1-indexed)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('Play all songs from a playlist in Playlist Mode.')
                .addStringOption(opt => opt.setName('name').setDescription('Name of the playlist').setRequired(false))
        ),

    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'create') {
            const name = interaction.options.getString('name')!;
            const url = interaction.options.getString('url');

            const result = createPlaylist(userId, name);
            if (!result.success) {
                return interaction.reply({ content: result.message, flags: result.success ? undefined : MessageFlags.Ephemeral });
            }

            if (!url) {
                return interaction.reply({ content: result.message });
            }

            await interaction.deferReply();

            const node = client.lavalink.nodeManager.leastUsedNodes()[0];
            if (!node) {
                return interaction.followUp({ content: `Playlist **${name}** was created, but no music servers were available to import tracks from the URL.` });
            }

            try {
                const res = await node.search({ query: url }, interaction.user);
                if (res.loadType === 'error' || res.loadType === 'empty') {
                    return interaction.followUp({ content: `Playlist **${name}** was created, but we couldn't resolve any tracks from the provided URL.` });
                }

                let tracksToImport: any[] = [];
                if (res.loadType === 'playlist') {
                    tracksToImport = res.tracks;
                } else if (res.loadType === 'track' || res.loadType === 'search') {
                    tracksToImport = [res.tracks[0]];
                }

                if (tracksToImport.length === 0) {
                    return interaction.followUp({ content: `Playlist **${name}** was created, but no tracks were found in the provided URL.` });
                }

                const trackDataList = tracksToImport.map(track => ({
                    title: track.info.title,
                    uri: track.info.uri,
                    duration: track.info.duration,
                    author: track.info.author,
                    artworkUrl: track.info.artworkUrl || undefined
                }));

                addTracksToPlaylist(userId, name, trackDataList);

                const member = interaction.member as GuildMember;
                const voiceChannel = member?.voice?.channel;

                if (!voiceChannel) {
                    return interaction.followUp({
                        content: `✅ Playlist **${name}** created and **${trackDataList.length}** song(s) imported from the URL!\n⚠️ *Note: You must be in a voice channel to start playing the playlist.*`
                    });
                }

                const player = client.lavalink.createPlayer({
                    guildId: interaction.guildId!,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId!,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100
                });

                await player.connect();

                await player.queue.add(tracksToImport);

                player.set('playlistModeActive', true);
                player.set('playlistModeName', name);
                player.set('playlistModeTracks', trackDataList);
                player.set('playlistModeOwnerId', userId);

                if (!player.playing && !player.paused) {
                    await player.play();
                }

                const currentTrackUri = player.queue.current?.info.uri;
                const embed = buildPlaylistModeEmbed(name, trackDataList, currentTrackUri);
                const buttons = buildPlaylistModeButtons(name);

                const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
                if (panelMsg) {
                    player.set('playlistPanelChannelId', interaction.channelId!);
                    player.set('playlistPanelMessageId', panelMsg.id);
                }

                return interaction.followUp({
                    content: `✅ Playlist **${name}** created with **${trackDataList.length}** song(s) imported!\n▶️ Playing in Playlist Mode now.`
                });
            } catch (error: any) {
                console.error('Failed to import and play playlist:', error);
                return interaction.followUp({
                    content: `✅ Playlist **${name}** was created, but an error occurred while importing tracks: ${error.message || error}`
                });
            }
        }

        if (subcommand === 'delete') {
            const name = interaction.options.getString('name')!;
            const result = deletePlaylist(userId, name);
            return interaction.reply({ content: result.message, flags: result.success ? undefined : MessageFlags.Ephemeral });
        }

        if (subcommand === 'list') {
            const playlists = getUserPlaylists(userId);
            if (playlists.length === 0) {
                return interaction.reply({ content: "You don't have any playlists yet! Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Playlists`)
                .setColor(0x1DB954)
                .setDescription(playlists.map((p, i) => `\`${i + 1}.\` **${p.name}** - \`${p.tracks.length} track(s)\``).join('\n'));

            const options = playlists.map(p =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(p.name)
                    .setDescription(`${p.tracks.length} track(s)`)
                    .setValue(p.name)
            );

            const select = new StringSelectMenuBuilder()
                .setCustomId('playlist_list_select_play')
                .setPlaceholder('Select a playlist to play')
                .addOptions(options);

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        if (subcommand === 'view') {
            const name = interaction.options.getString('name')!;
            const playlists = getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === name.toLowerCase());

            if (!playlist) {
                return interaction.reply({ content: `Playlist **${name}** was not found.`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Playlist: ${playlist.name}`)
                .setColor(0x1DB954);

            if (playlist.tracks.length === 0) {
                embed.setDescription('*This playlist is empty.*');
            } else {
                const list = playlist.tracks.map((t, i) => `\`${i + 1}.\` [${t.title}](${t.uri}) - \`${t.author}\` (\`${formatTime(t.duration)}\`)`).join('\n');
                embed.setDescription(list.substring(0, 4000));
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'add') {
            const playlistName = interaction.options.getString('playlist')!;
            const songQuery = interaction.options.getString('song');
            const playlists = getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

            if (!playlist) {
                return interaction.reply({ content: `Playlist **${playlistName}** was not found.`, flags: MessageFlags.Ephemeral });
            }

            // If query is provided, search and add it
            if (songQuery) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const node = client.lavalink.nodeManager.leastUsedNodes()[0];
                if (!node) {
                    return interaction.followUp({ content: 'No music nodes available to search.' });
                }

                const res = await node.search({ query: songQuery }, interaction.user);
                if (res.loadType === 'error' || res.loadType === 'empty') {
                    return interaction.followUp({ content: 'No results found.' });
                }

                const track = res.tracks[0];
                const trackData = {
                    title: track.info.title,
                    uri: track.info.uri,
                    duration: track.info.duration,
                    author: track.info.author,
                    artworkUrl: track.info.artworkUrl || undefined
                };

                const result = addTrackToPlaylist(userId, playlist.name, trackData);
                return interaction.followUp({ content: result.message });
            } else {
                // Try to add the currently playing song
                const player = client.lavalink.getPlayer(interaction.guildId!);
                if (!player || !player.queue.current) {
                    return interaction.reply({ content: 'Nothing is currently playing. Provide a song query or play a track first!', flags: MessageFlags.Ephemeral });
                }

                const track = player.queue.current;
                const trackData = {
                    title: track.info.title,
                    uri: track.info.uri,
                    duration: track.info.duration,
                    author: track.info.author,
                    artworkUrl: track.info.artworkUrl || undefined
                };

                const result = addTrackToPlaylist(userId, playlist.name, trackData);
                return interaction.reply({ content: result.message });
            }
        }

        if (subcommand === 'remove') {
            const playlistName = interaction.options.getString('playlist')!;
            const position = interaction.options.getInteger('position');
            const playlists = getUserPlaylists(userId);
            const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

            if (!playlist) {
                return interaction.reply({ content: `Playlist **${playlistName}** was not found.`, flags: MessageFlags.Ephemeral });
            }

            if (playlist.tracks.length === 0) {
                return interaction.reply({ content: `Playlist **${playlist.name}** is already empty.`, flags: MessageFlags.Ephemeral });
            }

            if (position !== null) {
                const index = position - 1;
                const result = removeTrackFromPlaylist(userId, playlist.name, index);
                return interaction.reply({ content: result.message, flags: result.success ? undefined : MessageFlags.Ephemeral });
            } else {
                // Send select menu to remove song
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
        }

        if (subcommand === 'play') {
            const name = interaction.options.getString('name');
            const member = interaction.member as GuildMember;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({ content: 'You need to be in a voice channel to play a playlist!', flags: MessageFlags.Ephemeral });
            }

            const playlists = getUserPlaylists(userId);
            if (playlists.length === 0) {
                return interaction.reply({ content: "You don't have any playlists yet! Use `/playlist create <name>` to get started.", flags: MessageFlags.Ephemeral });
            }

            if (!name) {
                const options = playlists.map(p =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(p.name)
                        .setDescription(`${p.tracks.length} track(s)`)
                        .setValue(p.name)
                );

                const select = new StringSelectMenuBuilder()
                    .setCustomId('playlist_list_select_play')
                    .setPlaceholder('Select a playlist to play')
                    .addOptions(options);

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
                return interaction.reply({ content: 'Select a playlist to play in Playlist Mode:', components: [row], flags: MessageFlags.Ephemeral });
            }

            const playlist = playlists.find(p => p.name.toLowerCase() === name.toLowerCase());

            if (!playlist) {
                return interaction.reply({ content: `Playlist **${name}** was not found.`, flags: MessageFlags.Ephemeral });
            }

            if (playlist.tracks.length === 0) {
                return interaction.reply({ content: `Playlist **${playlist.name}** has no songs in it!`, flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();

            // Create/get player
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId!,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId!,
                selfDeaf: true,
                selfMute: false,
                volume: 100
            });

            await player.connect();

            interaction.followUp({ content: `🔄 Loading **${playlist.tracks.length}** songs from playlist **${playlist.name}** into the queue...` });

            // Load tracks into player queue
            let loadedCount = 0;
            for (const track of playlist.tracks) {
                try {
                    const res = await player.search({ query: track.uri }, interaction.user);
                    if (res.loadType === 'track' || res.loadType === 'search' || (res.loadType === 'playlist' && res.tracks.length > 0)) {
                        await player.queue.add(res.tracks[0]);
                        loadedCount++;
                    } else {
                        // Fallback search with title + author if URL search fails
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

            // Set Playlist Mode active
            player.set('playlistModeActive', true);
            player.set('playlistModeName', playlist.name);
            player.set('playlistModeTracks', playlist.tracks);
            player.set('playlistModeOwnerId', userId);

            // Start playing if not active
            if (!player.playing && !player.paused) {
                await player.play();
            }

            // Send the Playlist Mode Panel
            const currentTrackUri = player.queue.current?.info.uri;
            const embed = buildPlaylistModeEmbed(playlist.name, playlist.tracks, currentTrackUri);
            const buttons = buildPlaylistModeButtons(playlist.name);

            const panelMsg = await (interaction.channel as any)?.send({ embeds: [embed], components: [buttons] });
            if (panelMsg) {
                player.set('playlistPanelChannelId', interaction.channelId!);
                player.set('playlistPanelMessageId', panelMsg.id);
            }

            return interaction.followUp({ content: `✅ Loaded **${loadedCount}/${playlist.tracks.length}** songs successfully. Playlist Mode is now **Active**.` });
        }
    }
};
