import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { LavalinkManager } from './music/lavalink';
import { connectDB } from './utils/playlistStore';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// Load environment variables
config();

// ─── Global Error Handlers (prevent crashes on Render) ────────────────────────
process.on('unhandledRejection', (reason: any) => {
    console.error('[UnhandledRejection]', reason?.message ?? reason);
});

process.on('uncaughtException', (err: Error) => {
    console.error('[UncaughtException]', err.message, err.stack);
    // Don't exit — log and continue
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// ─── Discord Client ───────────────────────────────────────────────────────────
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

// ─── Load Events ──────────────────────────────────────────────────────────────
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

// ─── Load Commands ────────────────────────────────────────────────────────────
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

// ─── HTTP Server (keeps Render free tier alive) ───────────────────────────────
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Discord bot is running!');
    res.end();
});

server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
});

// Self-ping every 14 minutes to prevent Render free tier from sleeping
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
    setInterval(() => {
        http.get(SELF_URL, (res) => {
            console.log(`[Keep-Alive] Self-ping status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn('[Keep-Alive] Self-ping failed:', err.message);
        });
    }, 14 * 60 * 1000); // Every 14 minutes
}

// ─── Connect to MongoDB, then start the bot ───────────────────────────────────
connectDB()
    .then(() => {
        return client.login(process.env.DISCORD_TOKEN);
    })
    .catch((err) => {
        console.error('Failed to start bot:', err);
        process.exit(1);
    });
