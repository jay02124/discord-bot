import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle autoplaying related songs when the queue ends.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        const isAutoplay = player.get('autoplay') || false;
        player.set('autoplay', !isAutoplay);

        return interaction.reply({ content: `Autoplay is now **${!isAutoplay ? 'enabled' : 'disabled'}**.` });
    },
};
