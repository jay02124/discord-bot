import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set loop mode or cycle through them.')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('The loop mode (off, track, queue).')
                .setRequired(false)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Current Song', value: 'track' },
                    { name: 'Entire Queue', value: 'queue' }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        const player = client.lavalink.getPlayer(interaction.guildId!);
        
        if (!player) {
            return interaction.reply({ content: 'I am not playing anything here.', ephemeral: true });
        }

        const modeOption = interaction.options.getString('mode');
        let nextMode: 'off' | 'track' | 'queue';

        if (modeOption) {
            nextMode = modeOption as 'off' | 'track' | 'queue';
        } else {
            // Cycle modes
            const current = player.repeatMode;
            if (current === 'off') nextMode = 'track';
            else if (current === 'track') nextMode = 'queue';
            else nextMode = 'off';
        }

        await player.setRepeatMode(nextMode);
        const modeStr = nextMode === 'off' ? 'Off' : nextMode === 'track' ? 'Current Song' : 'Entire Queue';
        return interaction.reply({ content: `🔁 Loop mode set to: **${modeStr}**` });
    },
};
