import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player || (!player.playing && player.queue.tracks.length === 0)) {
            return interaction.reply({ content: 'The queue is currently empty.', ephemeral: true });
        }

        const queue = player.queue.tracks;
        const current = player.queue.current;
        
        let description = '';
        if (current) {
            description += `**Now Playing:**\n[${current.info.title}](${current.info.uri}) - \`${Math.round(current.info.duration / 1000)}s\`\n\n`;
        }

        if (queue.length > 0) {
            description += '**Up Next:**\n';
            const limit = Math.min(queue.length, 10);
            for (let i = 0; i < limit; i++) {
                const track = queue[i];
                description += `\`${i + 1}.\` [${track.info.title}](${track.info.uri}) - \`${Math.round(track.info.duration / 1000)}s\`\n`;
            }
            if (queue.length > 10) {
                description += `\n*...and ${queue.length - 10} more tracks.*`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('🎵 Server Queue')
            .setColor(0x2b2d31)
            .setDescription(description);

        return interaction.reply({ embeds: [embed] });
    },
};
