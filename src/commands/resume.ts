import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused playback.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        if (!player.paused) {
            return interaction.reply({ content: 'Playback is not paused!', ephemeral: true });
        }

        await player.resume();
        return interaction.reply({ content: '▶️ Resumed the playback.' });
    },
};
