import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume.')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('The volume level (1-100).')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        const volume = interaction.options.getInteger('level')!;
        await player.setVolume(volume);

        return interaction.reply({ content: `🔊 Volume set to **${volume}%**` });
    },
};
