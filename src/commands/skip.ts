import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing song.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        await player.skip();
        return interaction.reply({ content: 'Skipped the current track.' });
    },
};
