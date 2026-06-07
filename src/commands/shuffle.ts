import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the current music queue.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        if (player.queue.tracks.length === 0) {
            return interaction.reply({ content: 'The queue is currently empty.', ephemeral: true });
        }

        await player.queue.shuffle();
        return interaction.reply({ content: '🔀 Queue has been shuffled!' });
    },
};
