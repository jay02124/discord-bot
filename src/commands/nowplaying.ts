import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { buildNowPlayingEmbed, buildPlayerButtons } from '../utils/embeds';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player || !player.queue.current) {
            return interaction.reply({ content: 'Nothing is currently playing.', ephemeral: true });
        }

        const track = player.queue.current;
        const embed = buildNowPlayingEmbed(player, track);
        const components = buildPlayerButtons(player);

        return interaction.reply({ embeds: [embed], components });
    },
};
