# Hubs Navigator Bot

## Overview
A multi-bot control panel for automating navigation in Mozilla Hubs instances. Uses Puppeteer for browser automation and the Bedrock Passport API for authentication. Supports running up to four bot accounts simultaneously that can interact with each other and with users via AI-powered chat.

## Architecture
- **Frontend**: React + Vite dashboard with real-time WebSocket status updates, 4-bot panels
- **Backend**: Express server with Puppeteer-based bot engine (BotManager pattern)
- **Auth**: Bedrock Passport API (`https://api.bedrockpassport.com/orange/v1/auth/email/login`) — accounts auto-create on first login
- **Target**: Mozilla Hubs instance at `https://worlds.orangeweb3.com`

## Key Files
- `server/hubs-bot.ts` - Bot engine (HubsBot class + BotManager), Puppeteer automation, auth, movement, chat
- `server/routes.ts` - API routes for multi-bot control
- `server/storage.ts` - In-memory per-bot storage for status and logs
- `shared/schema.ts` - Shared types (BotStatus, BotCommand, etc.)
- `client/src/pages/dashboard.tsx` - 4-bot control panel UI

## Environment Secrets
- `BEDROCK_API_KEY` - API key for Bedrock Passport (shared by all bots)
- `HUBS_BOT_EMAIL` / `HUBS_BOT_PASSWORD` - Bot 1 credentials
- `HUBS_BOT2_EMAIL` / `HUBS_BOT2_PASSWORD` - Bot 2 credentials
- `HUBS_BOT3_EMAIL` / `HUBS_BOT3_PASSWORD` - Bot 3 credentials
- `HUBS_BOT4_EMAIL` / `HUBS_BOT4_PASSWORD` - Bot 4 credentials

Bot email format: `bot{numbers}@automation.com` — accounts auto-create on first login via Bedrock API.

## Features
- **Multi-Bot**: Up to 4 bots run independently with separate Chromium instances, entering the same room
- **Bot-to-Bot Chat**: Bots detect each other's messages and respond with rate limiting to avoid loops
- **AI Chat Responses**: Uses OpenAI (via Replit AI Integrations) for contextual, conversation-aware replies
- **Conversation History**: Each bot maintains a rolling 20-message history for context in AI responses
- **Entrance Greetings**: Bots send a greeting immediately upon entering the room
- **Chat via Hubs API**: Messages sent directly via `window.APP.hubChannel.sendMessage()` — no UI interaction needed
- **Auto-Navigation**: Random walking, turning, jumping, and chat; starts after room entry
- **Manual Controls**: Per-bot WASD movement, camera look, jump via dashboard
- **Screenshots**: Capture what each bot sees independently
- **Start/Stop All**: Global controls to launch or stop all bots at once
- **Proper Room Exit**: Bots click "Leave" in Hubs before closing browser to avoid ghost avatars

## API Endpoints
### Multi-Bot (primary)
- `GET /api/bots` - Get all bot statuses
- `POST /api/bots/start-all` - Start all bots (optional `roomUrl`)
- `POST /api/bots/stop-all` - Stop all bots
- `POST /api/bots/:botId/start` - Start specific bot
- `POST /api/bots/:botId/stop` - Stop specific bot
- `POST /api/bots/:botId/move` - Move bot
- `POST /api/bots/:botId/jump` - Jump
- `POST /api/bots/:botId/auto-nav` - Toggle auto-nav
- `GET /api/bots/:botId/auto-nav` - Get auto-nav status
- `POST /api/bots/:botId/chat` - Send chat message
- `GET /api/bots/:botId/screenshot` - Capture screenshot
- `GET /api/bots/:botId/logs` - Get bot logs
- `GET /api/bots/:botId/status` - Get bot status

### Legacy (bot1 compat)
- `GET /api/bot/status`, `GET /api/bot/logs`, `POST /api/bot/start`, `POST /api/bot/stop`, `GET /api/bot/auto-nav`

### WebSocket
- `/ws` - Real-time status updates with `{ type: "status", botId, data }` messages

## Dependencies
- `puppeteer-core` - Browser automation
- `openai` - AI chat responses via Replit AI Integrations (env: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- System: `chromium` + various X11/graphics libs via Nix

## Template Setup
When remixing this template:
1. `BEDROCK_API_KEY` is included as a template secret (hidden from remixer)
2. Bot credentials (email/password) should be auto-generated using format `bot{random}@automation.com`
3. Accounts auto-create on first login via the Bedrock Passport API
4. Bot start stagger: 5 seconds between each bot launch to manage resource usage
