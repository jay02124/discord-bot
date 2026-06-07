import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song name or URL to play.')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        await interaction.deferReply();
        const query = interaction.options.get('query')?.value as string;
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.followUp({ content: 'You need to be in a voice channel to play music!' });
        }

        try {
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId!,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId!,
                selfDeaf: true,
                selfMute: false,
                volume: 100
            });

            await player.connect();

            const res = await player.search({ query }, interaction.user);

            if (res.loadType === 'error' || res.loadType === 'empty') {
                return interaction.followUp({ content: 'No results found or there was an error.' });
            }

            if (res.loadType === 'playlist') {
                await player.queue.add(res.tracks);
                if (!player.playing && !player.paused) await player.play();
                return interaction.followUp({ content: `Added playlist **${res.playlist?.title}** to the queue.` });
            } else {
                const track = res.tracks[0];
                await player.queue.add(track);
                if (!player.playing && !player.paused) await player.play();
                return interaction.followUp({ content: `Added **${track.info.title}** to the queue.` });
            }
        } catch (error: any) {
            console.error('Play command error:', error);
            if (error.message?.includes('No available Node')) {
                return interaction.followUp({ content: '⚠️ The music server is currently unavailable. Please try again in a moment.' });
            }
            return interaction.followUp({ content: '❌ An unexpected error occurred while trying to play music.' });
        }
    },
};
