import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import {
    parseSpotifyUrl,
    getSpotifyPlaylistTracks,
    getSpotifyAlbumTracks,
    getSpotifyTrack,
    searchSpotifyTracksOnLavalink,
} from '../utils/spotify';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue (supports Spotify URL/URI).')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song name, YouTube URL, or Spotify URL to play.')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        await interaction.deferReply();
        const query = interaction.options.get('query')?.value as string;
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.followUp({ content: 'You need to be in a voice channel to play music!' });
        }

        try {
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId!,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId!,
                selfDeaf: true,
                selfMute: false,
                volume: 100
            });

            await player.connect();

            const spotifyInfo = parseSpotifyUrl(query);
            if (spotifyInfo) {
                try {
                    let spotifyTracks: any[] = [];
                    let playlistName = '';
                    if (spotifyInfo.type === 'playlist') {
                        spotifyTracks = await getSpotifyPlaylistTracks(spotifyInfo.id);
                        playlistName = 'Playlist';
                    } else if (spotifyInfo.type === 'album') {
                        spotifyTracks = await getSpotifyAlbumTracks(spotifyInfo.id);
                        playlistName = 'Album';
                    } else if (spotifyInfo.type === 'track') {
                        const track = await getSpotifyTrack(spotifyInfo.id);
                        spotifyTracks = [track];
                    }

                    if (spotifyTracks.length === 0) {
                        return interaction.followUp({ content: 'No tracks found in the Spotify link.' });
                    }

                    if (spotifyTracks.length > 1) {
                        await interaction.followUp({ content: `Importing and matching **${spotifyTracks.length}** track(s) from Spotify...` });
                    }

                    const node = player.node || client.lavalink.nodeManager.leastUsedNodes()[0];
                    const resolvedTracks = await searchSpotifyTracksOnLavalink(node, spotifyTracks, interaction.user);
                    if (resolvedTracks.length === 0) {
                        return interaction.followUp({ content: 'Failed to resolve any matching tracks on YouTube.' });
                    }

                    await player.queue.add(resolvedTracks);
                    if (!player.playing && !player.paused) await player.play();

                    if (resolvedTracks.length > 1) {
                        return interaction.followUp({ content: `Added **${resolvedTracks.length}** tracks from Spotify ${playlistName} to the queue.` });
                    } else {
                        const track = resolvedTracks[0];
                        return interaction.followUp({ content: `Added **${track.info.title}** (Spotify Match) to the queue.` });
                    }
                } catch (error: any) {
                    console.error('Failed to play Spotify URL:', error);
                    return interaction.followUp({ content: `⚠️ Spotify playback error: ${error.message}` });
                }
            }

            const res = await player.search({ query }, interaction.user);

            if (res.loadType === 'error' || res.loadType === 'empty') {
                return interaction.followUp({ content: 'No results found or there was an error.' });
            }

            if (res.loadType === 'playlist') {
                await player.queue.add(res.tracks);
                if (!player.playing && !player.paused) await player.play();
                return interaction.followUp({ content: `Added playlist **${res.playlist?.title}** to the queue.` });
            } else {
                const track = res.tracks[0];
                await player.queue.add(track);
                if (!player.playing && !player.paused) await player.play();
                return interaction.followUp({ content: `Added **${track.info.title}** to the queue.` });
            }
        } catch (error: any) {
            console.error('Play command error:', error);
            if (error.message?.includes('No available Node')) {
                return interaction.followUp({ content: '⚠️ The music server is currently unavailable. Please try again in a moment.' });
            }
            return interaction.followUp({ content: '❌ An unexpected error occurred while trying to play music.' });
        }
    },
};

