import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue.'),
    async execute(interaction: CommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        await player.queue.splice(0, player.queue.tracks.length);
        await player.stopPlaying(false, true); // (clear current track, do not emit end event unnecessarily)
        return interaction.reply({ content: '🛑 Stopped playback and cleared the queue.' });
    },
};
