import { LavalinkManager as LavalinkClient } from 'lavalink-client';
import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class LavalinkManager extends LavalinkClient {
    constructor(client: Client) {
        super({
            nodes: [
                {
                    id: process.env.LAVALINK_HOST || 'mainNode',
                    authorization: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
                    host: process.env.LAVALINK_HOST || 'localhost',
                    port: parseInt(process.env.LAVALINK_PORT || '443'),
                    secure: process.env.LAVALINK_SECURE === 'true',
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
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('player_pause')
                            .setLabel('Play/Pause')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('player_skip')
                            .setLabel('Skip')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('player_stop')
                            .setLabel('Stop')
                            .setStyle(ButtonStyle.Danger),
                    );

                const row2 = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('player_queue')
                            .setLabel('View Queue')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('player_shuffle')
                            .setLabel('Shuffle')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('player_loop')
                            .setLabel('Loop')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('player_add')
                            .setLabel('Add')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('player_remove')
                            .setLabel('Remove')
                            .setStyle(ButtonStyle.Danger)
                    );

                channel.send({
                    embeds: [{
                        color: 0x2b2d31,
                        title: '🎵 Now Playing',
                        description: `[${track.info.title}](${track.info.uri})`,
                        fields: [
                            { name: 'Duration', value: `\`${Math.round(track.info.duration / 1000)}s\``, inline: true },
                            { name: 'Requester', value: `<@${(track.requester as any).id}>`, inline: true }
                        ]
                    }],
                    components: [row, row2]
                });
            }
        });

        this.on('queueEnd', (player, track, payload) => {
             // Let the autoPlayFunction handle it if enabled, otherwise do nothing
        });
    }
}
