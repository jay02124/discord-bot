import { LavalinkManager as LavalinkClient } from 'lavalink-client';
import { Client, TextChannel } from 'discord.js';
import { buildNowPlayingEmbed, buildPlayerButtons, buildPlaylistModeEmbed } from '../utils/embeds';

export class LavalinkManager extends LavalinkClient {
    constructor(client: Client) {
        super({
            nodes: [
                {
                    id: 'mainNode',
                    authorization: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
                    host: process.env.LAVALINK_HOST || 'localhost',
                    port: parseInt(process.env.LAVALINK_PORT || '443'),
                    secure: process.env.LAVALINK_SECURE === 'true',
                    retryDelay: 10000,
                    retryAmount: 10,
                },
            ],
            sendToShard: (guildId, payload) =>
                client.guilds.cache.get(guildId)?.shard?.send(payload),
            client: {
                id: process.env.CLIENT_ID || '',
                username: client.user?.username || 'MusicBot',
            },
            autoSkip: true,
            playerOptions: {
                clientBasedPositionUpdateInterval: 150,
                defaultSearchPlatform: 'ytmsearch',
                volumeDecrementer: 0.75,
                requesterTransformer: (requester: any) => requester,
                onDisconnect: {
                    autoReconnect: true,
                    destroyPlayer: false
                },
                onEmptyQueue: {
                    destroyAfterMs: 300000, // Destroy after 5 mins of empty queue
                    autoPlayFunction: async (player, lastTrack) => {
                        // Check if autoplay is enabled for this guild (stored in player options/customData)
                        if (player.get('autoplay')) {
                            if (lastTrack) {
                                const res = await player.search({ query: `ytmsearch:${lastTrack.info.author} ${lastTrack.info.title}` }, lastTrack.requester);
                                if (res.tracks.length > 1) {
                                    // Play the second result to avoid playing the exact same track
                                    await player.queue.add(res.tracks[1]);
                                    await player.play();
                                }
                            }
                        }
                    }
                }
            }
        });

        this.nodeManager.on('connect', (node: any) => {
            console.log(`Node ${node.options.id} connected!`);
        });

        this.nodeManager.on('error', (node: any, error: any) => {
            console.error(`Node ${node.options.id} errored: ${error.message}`);
        });

        this.on('trackStart', (player, track) => {
            if (!track) return;
            
            const channel = client.channels.cache.get(player.textChannelId!) as TextChannel;
            if (channel) {
                // Delete previous Now Playing message
                const oldNpMsgId = player.get('npMessageId') as string;
                const oldNpChanId = player.get('npChannelId') as string;
                if (oldNpMsgId && oldNpChanId) {
                    const oldChannel = client.channels.cache.get(oldNpChanId) as TextChannel;
                    if (oldChannel) {
                        oldChannel.messages.delete(oldNpMsgId).catch(() => {});
                    }
                }

                // Send new Now Playing message
                channel.send({
                    embeds: [buildNowPlayingEmbed(player, track)],
                    components: buildPlayerButtons(player)
                }).then(msg => {
                    player.set('npMessageId', msg.id);
                    player.set('npChannelId', channel.id);
                }).catch(console.error);
            }

            // Playlist Mode handling
            if (player.get('playlistModeActive')) {
                const playlistName = player.get('playlistModeName') as string;
                const tracks = player.get('playlistModeTracks') as any[];
                const panelMsgId = player.get('playlistPanelMessageId') as string;
                const panelChanId = player.get('playlistPanelChannelId') as string;
                
                if (panelMsgId && panelChanId) {
                    const panelChannel = client.channels.cache.get(panelChanId) as TextChannel;
                    if (panelChannel) {
                        const embed = buildPlaylistModeEmbed(playlistName, tracks, track.info.uri);
                        panelChannel.messages.edit(panelMsgId, { embeds: [embed] }).catch(console.error);
                    }
                }
            }
        });

        this.on('queueEnd', (player, track, payload) => {
            // Delete NP message when queue ends
            const npMsgId = player.get('npMessageId') as string;
            const npChanId = player.get('npChannelId') as string;
            if (npMsgId && npChanId) {
                const oldChannel = client.channels.cache.get(npChanId) as TextChannel;
                oldChannel?.messages.delete(npMsgId).catch(() => {});
            }
            player.set('npMessageId', null);
            player.set('npChannelId', null);
        });

        const cleanupPlayer = (player: any) => {
            // Cleanup NP Message
            const npMsgId = player.get('npMessageId') as string;
            const npChanId = player.get('npChannelId') as string;
            if (npMsgId && npChanId) {
                const oldChannel = client.channels.cache.get(npChanId) as TextChannel;
                oldChannel?.messages.delete(npMsgId).catch(() => {});
            }

            // Cleanup Playlist Mode Panel
            const panelMsgId = player.get('playlistPanelMessageId') as string;
            const panelChanId = player.get('playlistPanelChannelId') as string;
            if (panelMsgId && panelChanId) {
                const oldChannel = client.channels.cache.get(panelChanId) as TextChannel;
                oldChannel?.messages.delete(panelMsgId).catch(() => {});
            }
        };

        this.on('playerDestroy', cleanupPlayer);
    }
}
