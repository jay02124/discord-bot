import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { LavalinkManager } from './music/lavalink';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

// Create Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// Extend client to store commands
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
        lavalink: LavalinkManager;
    }
}

client.commands = new Collection();
client.lavalink = new LavalinkManager(client);

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath).default || require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath).default || require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.on('raw', (d) => client.lavalink.sendRawData(d));

client.login(process.env.DISCORD_TOKEN);
