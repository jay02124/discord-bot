import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skipto')
        .setDescription('Skip to a specific track in the queue.')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('The queue position to skip to (e.g. 3).')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        const position = interaction.options.getInteger('position')!;
        const queueLength = player.queue.tracks.length;

        if (queueLength === 0) {
            return interaction.reply({ content: 'The queue is currently empty.', ephemeral: true });
        }

        if (position > queueLength) {
            return interaction.reply({ content: `There are only ${queueLength} songs in the queue. You cannot skip to position ${position}!`, ephemeral: true });
        }

        // We splice out tracks from index 0 up to position - 2 (so position - 1 tracks are removed)
        // For example, to skip to position 3: we splice out 2 tracks (indices 0 and 1).
        // The track originally at index 2 (position 3) is now index 0. Then skip() is called.
        const removedTracks = player.queue.splice(0, position - 1);
        const nextTrackName = player.queue.tracks[0]?.info.title || 'the next track';
        
        await player.skip();

        return interaction.reply({ content: `⏭️ Skipped **${removedTracks.length}** track(s) to play **${nextTrackName}**.` });
    },
};
