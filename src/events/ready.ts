import { Events, Client, REST, Routes } from 'discord.js';

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        console.log(`Bot ready! Logged in as ${client.user?.tag}`);

        // Initialize Lavalink Manager
        client.lavalink.init({ id: client.user?.id!, username: client.user?.username });

        // Register Slash Commands
        const commands = client.commands.map(cmd => cmd.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);
            await rest.put(
                Routes.applicationCommands(client.user?.id!),
                { body: commands },
            );
            console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
        } catch (error) {
            console.error(error);
        }
    },
};
