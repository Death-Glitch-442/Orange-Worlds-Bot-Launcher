# Hubs Navigator Bot

## Overview
A bot control panel for automating navigation in Mozilla Hubs instances. Uses Puppeteer for browser automation and the Bedrock Passport API for authentication.

## Architecture
- **Frontend**: React + Vite dashboard with real-time WebSocket status updates
- **Backend**: Express server with Puppeteer-based bot engine
- **Auth**: Bedrock Passport API (`https://api.bedrockpassport.com/orange/v1/auth/email/login`)
- **Target**: Mozilla Hubs instance at `https://worlds.orangeweb3.com`

## Key Files
- `server/hubs-bot.ts` - Bot engine (Puppeteer automation, auth, movement)
- `server/routes.ts` - API routes for bot control
- `server/storage.ts` - In-memory storage for bot status and logs
- `shared/schema.ts` - Shared types (BotStatus, BotCommand, etc.)
- `client/src/pages/dashboard.tsx` - Control panel UI

## Environment Secrets
- `BEDROCK_API_KEY` - API key for Bedrock Passport
- `HUBS_BOT_EMAIL` - Bot login email
- `HUBS_BOT_PASSWORD` - Bot login password

## API Endpoints
- `POST /api/bot/start` - Launch the bot (optional `roomUrl` in body)
- `POST /api/bot/stop` - Stop the bot
- `POST /api/bot/move` - Move bot (`direction`: forward/backward/left/right/stop)
- `POST /api/bot/jump` - Make bot jump
- `POST /api/bot/look` - Rotate camera (`deltaX`, `deltaY`)
- `POST /api/bot/enter-room` - Navigate to a specific room URL
- `GET /api/bot/screenshot` - Capture what the bot sees
- `GET /api/bot/status` - Get current bot status
- `GET /api/bot/logs` - Get activity logs
- `WebSocket /ws` - Real-time status and log updates

## Dependencies
- `puppeteer-core` - Browser automation
- System: `chromium` + various X11/graphics libs via Nix
