import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnect the bot and destroy the player.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        await player.destroy();
        return interaction.reply({ content: '👋 Disconnected and destroyed the player.' });
    },
};
