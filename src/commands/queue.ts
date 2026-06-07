import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildQueueEmbed } from '../utils/embeds';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue.')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('The queue page to view.')
                .setRequired(false)
                .setMinValue(1)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
            return interaction.reply({ content: 'The queue is currently empty.', ephemeral: true });
        }

        const page = interaction.options.getInteger('page') || 1;
        const { embed, components } = buildQueueEmbed(player, page);

        return interaction.reply({ embeds: [embed], components });
    },
};
