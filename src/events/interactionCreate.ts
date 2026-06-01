import { Events, Client, Interaction, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

export default {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction: Interaction, client: Client) {
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
        } else if (interaction.isStringSelectMenu()) {
            // Handle search UI selection
            if (interaction.customId === 'search_select') {
                const command = client.commands.get('search');
                if (command && command.handleSelect) {
                    await command.handleSelect(interaction, client);
                }
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
            }
        } else if (interaction.isModalSubmit()) {
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
            }
        } else if (interaction.isButton()) {
            const player = client.lavalink.getPlayer(interaction.guildId!);
            if (!player) {
                return interaction.reply({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId === 'player_pause') {
                if (player.paused) {
                    await player.resume();
                    await interaction.reply({ content: '▶️ Resumed the playback.', flags: MessageFlags.Ephemeral });
                } else {
                    await player.pause();
                    await interaction.reply({ content: '⏸️ Paused the playback.', flags: MessageFlags.Ephemeral });
                }
            } else if (interaction.customId === 'player_skip') {
                await player.skip();
                await interaction.reply({ content: '⏭️ Skipped the track.', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_stop') {
                await player.queue.splice(0, player.queue.tracks.length);
                await player.stopPlaying(false, true);
                await interaction.reply({ content: '🛑 Stopped playback and cleared the queue.', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_queue') {
                if (!player.queue.tracks.length) {
                    return interaction.reply({ content: 'The queue is currently empty.', flags: MessageFlags.Ephemeral });
                }
                const tracks = player.queue.tracks.slice(0, 10).map((t, i) => `${i + 1}. **${t.info.title}**`);
                const content = `**Upcoming Queue:**\n${tracks.join('\n')}${player.queue.tracks.length > 10 ? `\n*...and ${player.queue.tracks.length - 10} more*` : ''}`;
                await interaction.reply({ content, flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_shuffle') {
                await player.queue.shuffle();
                await interaction.reply({ content: '🔀 Queue has been shuffled!', flags: MessageFlags.Ephemeral });
            } else if (interaction.customId === 'player_loop') {
                const current = player.repeatMode;
                let nextMode: 'off' | 'track' | 'queue' = 'off';
                if (current === 'off') nextMode = 'track';
                else if (current === 'track') nextMode = 'queue';
                else if (current === 'queue') nextMode = 'off';

                await player.setRepeatMode(nextMode);
                const modeStr = nextMode === 'off' ? 'Off' : nextMode === 'track' ? 'Current Song' : 'Entire Queue';
                await interaction.reply({ content: `🔁 Loop mode set to: **${modeStr}**`, flags: MessageFlags.Ephemeral });
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

                const options = player.queue.tracks.slice(0, 25).map((t, i) => 
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
