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

## Features
- **Auto-Navigation**: Bot randomly walks around, turns, jumps, and sends chat messages when in auto-nav mode. Starts automatically after entering a room. Toggle on/off from dashboard.
- **Chat**: Send messages in the Hubs chat from the dashboard, or let auto-nav send random friendly messages.
- **Manual Controls**: WASD movement, camera look, jump via dashboard buttons or keyboard.
- **Screenshots**: Capture what the bot sees in real-time.

## API Endpoints
- `POST /api/bot/start` - Launch the bot (optional `roomUrl` in body)
- `POST /api/bot/stop` - Stop the bot
- `POST /api/bot/move` - Move bot (`direction`: forward/backward/left/right/stop)
- `POST /api/bot/jump` - Make bot jump
- `POST /api/bot/look` - Rotate camera (`deltaX`, `deltaY`)
- `POST /api/bot/enter-room` - Navigate to a specific room URL
- `POST /api/bot/auto-nav` - Toggle auto-navigation (`{ enabled: boolean }`)
- `GET /api/bot/auto-nav` - Get auto-nav status
- `POST /api/bot/chat` - Send a chat message (`{ message: string }`)
- `GET /api/bot/screenshot` - Capture what the bot sees
- `GET /api/bot/status` - Get current bot status
- `GET /api/bot/logs` - Get activity logs
- `WebSocket /ws` - Real-time status and log updates

## Dependencies
- `puppeteer-core` - Browser automation
- System: `chromium` + various X11/graphics libs via Nix
