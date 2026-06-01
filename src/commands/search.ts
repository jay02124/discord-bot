import { SlashCommandBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, GuildMember } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for a song and select from results.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song to search for.')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: any) {
        await interaction.deferReply();
        const query = interaction.options.get('query')?.value as string;
        const member = interaction.member as GuildMember;
        
        if (!member.voice.channel) {
            return interaction.followUp({ content: 'You need to be in a voice channel to use this command!' });
        }

        const node = client.lavalink.nodeManager.leastUsedNodes()[0];
        if (!node) {
            return interaction.followUp({ content: 'No Lavalink nodes available to search.' });
        }
        const res = await node.search({ query }, interaction.user);
        
        if (res.loadType === 'error' || res.loadType === 'empty') {
            return interaction.followUp({ content: 'No results found.' });
        }

        const tracks = res.tracks.slice(0, 5); // Limit to 5 results
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('search_select')
            .setPlaceholder('Select a song to play')
            .addOptions(tracks.map((track: any, i: number) => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${track.info.title.substring(0, 95)}`)
                    .setDescription(`Author: ${track.info.author.substring(0, 80)}`)
                    .setValue(track.info.uri)
            ));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.followUp({
            content: `Search results for **${query}**:`,
            components: [row]
        });
    },
    
    async handleSelect(interaction: any, client: any) {
        await interaction.deferReply();
        const uri = interaction.values[0];
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.followUp({ content: 'You need to be in a voice channel to play music!' });
        }

        const player = client.lavalink.createPlayer({
            guildId: interaction.guildId!,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channelId!,
            selfDeaf: true,
            selfMute: false,
            volume: 100
        });

        await player.connect();

        const res = await player.search({ query: uri }, interaction.user);
        
        if (res.loadType === 'error' || res.loadType === 'empty') {
            return interaction.followUp({ content: 'Could not load the selected track.' });
        }

        const track = res.tracks[0];
        await player.queue.add(track);
        if (!player.playing && !player.paused) await player.play();
        
        await interaction.followUp({ content: `Added **${track.info.title}** to the queue.` });
        
        // Remove the select menu from the original message
        await interaction.message.edit({ components: [] });
    }
};
