import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current playback.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        if (player.paused) {
            return interaction.reply({ content: 'Playback is already paused!', ephemeral: true });
        }

        await player.pause();
        return interaction.reply({ content: '⏸️ Paused the playback.' });
    },
};
