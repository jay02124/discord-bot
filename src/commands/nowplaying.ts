import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player || !player.playing || !player.queue.current) {
            return interaction.reply({ content: 'Nothing is currently playing.', ephemeral: true });
        }

        const track = player.queue.current;
        const position = player.position;

        const embed = new EmbedBuilder()
            .setTitle('🎵 Now Playing')
            .setColor(0x2b2d31)
            .setDescription(`[${track.info.title}](${track.info.uri})`)
            .addFields(
                { name: 'Duration', value: `\`${Math.round(position / 1000)}s / ${Math.round(track.info.duration / 1000)}s\``, inline: true },
                { name: 'Requester', value: `<@${(track.requester as any).id}>`, inline: true }
            );

        return interaction.reply({ embeds: [embed] });
    },
};
