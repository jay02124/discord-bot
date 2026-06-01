# Discord Music Bot

A feature-rich Discord music bot built with Node.js, TypeScript, discord.js v14, and Lavalink.

## Features
- Search and play music from YouTube/Spotify
- Interactive Search UI
- Autoplay related tracks
- Standard music controls (play, pause, skip, stop, queue)
- Slash commands only
- Built for easy deployment

## Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- A Discord Bot Token
- A Lavalink Node (public or self-hosted)

## Local Setup

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Configuration**
   Rename `.env.example` to `.env` and fill in your details:
   ```env
   DISCORD_TOKEN=YOUR_TOKEN
   CLIENT_ID=YOUR_APP_ID
   LAVALINK_HOST=PUBLIC_NODE_HOST
   LAVALINK_PORT=443
   LAVALINK_PASSWORD=password
   LAVALINK_SECURE=true
   ```

3. **Run the Bot**
   ```bash
   npm run dev
   ```

## Docker Deployment

This bot is ready to be deployed on services like Render, Railway, or any Docker-compatible host.

1. Provide your environment variables to the host platform.
2. Build and run the Docker image using the provided `Dockerfile`.
