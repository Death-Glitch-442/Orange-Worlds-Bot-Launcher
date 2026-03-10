import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { botManager } from "./hubs-bot";
import { moveCommandSchema, roomCommandSchema } from "@shared/schema";

const BOT_CONFIGS = [
  { id: "bot1", emailKey: "HUBS_BOT_EMAIL", passKey: "HUBS_BOT_PASSWORD" },
  { id: "bot2", emailKey: "HUBS_BOT2_EMAIL", passKey: "HUBS_BOT2_PASSWORD" },
  { id: "bot3", emailKey: "HUBS_BOT3_EMAIL", passKey: "HUBS_BOT3_PASSWORD" },
  { id: "bot4", emailKey: "HUBS_BOT4_EMAIL", passKey: "HUBS_BOT4_PASSWORD" },
];

const _ek = "6f7f3682b1797b6fa0d8246eace80f0f248b3fea3f0458fd414b2acfb955661e77b681dff45f98251b028f5741d37466";
const _dk = "3913ff2ab683d6440c320fbbbc80e905176e355738932245f1b03580b6b652ed";
const _iv = "19256790489e607d0f256c6de07dc26b";

function getBedrockApiKey(): string {
  if (process.env.BEDROCK_API_KEY) {
    return process.env.BEDROCK_API_KEY;
  }
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(_dk, "hex"), Buffer.from(_iv, "hex"));
    let decrypted = decipher.update(_ek, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

function generatePassword(length = 14): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function generateBotEmail(): string {
  const num = crypto.randomInt(10000, 99999);
  return `bot${num}@automation.com`;
}

function getSetupFilePath(): string {
  return path.join(process.cwd(), ".bot-credentials.json");
}

function loadGeneratedCredentials(): Record<string, { email: string; password: string; registered?: boolean }> | null {
  try {
    const filePath = getSetupFilePath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function saveGeneratedCredentials(creds: Record<string, { email: string; password: string; registered?: boolean }>) {
  fs.writeFileSync(getSetupFilePath(), JSON.stringify(creds, null, 2));
}

function getBotsSetupStatus(): { configured: boolean; bots: Array<{ id: string; email: string; hasEnvVar: boolean }> } {
  const bots: Array<{ id: string; email: string; hasEnvVar: boolean }> = [];
  let allConfigured = true;

  const generated = loadGeneratedCredentials() || {};

  for (const { id, emailKey, passKey } of BOT_CONFIGS) {
    const envEmail = process.env[emailKey];
    const envPass = process.env[passKey];
    const hasEnv = !!(envEmail && envPass);

    if (hasEnv) {
      bots.push({ id, email: envEmail!, hasEnvVar: true });
    } else if (generated[id]) {
      bots.push({ id, email: generated[id].email, hasEnvVar: false });
      allConfigured = false;
    } else {
      allConfigured = false;
    }
  }

  return { configured: bots.length > 0 && allConfigured, bots };
}

function clearStaleCredentialsOnRemix() {
  const hasAnyEnvSecrets = BOT_CONFIGS.some(({ emailKey, passKey }) =>
    !!(process.env[emailKey] && process.env[passKey])
  );
  const filePath = getSetupFilePath();
  if (!hasAnyEnvSecrets && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function initBots() {
  clearStaleCredentialsOnRemix();
  const apiKey = getBedrockApiKey();
  const generated = loadGeneratedCredentials() || {};

  for (const { id, emailKey, passKey } of BOT_CONFIGS) {
    let email = process.env[emailKey];
    let password = process.env[passKey];

    if (!email || !password) {
      const cred = generated[id];
      if (cred && cred.registered && cred.email && cred.password) {
        email = cred.email;
        password = cred.password;
        process.env[emailKey] = email;
        process.env[passKey] = password;
      }
    }

    if (email && password) {
      botManager.createBot(id, { email, password, apiKey });
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  initBots();

  app.get("/api/setup/status", (_req, res) => {
    const status = getBotsSetupStatus();
    res.json(status);
  });

  app.post("/api/setup/generate", (_req, res) => {
    const existing = loadGeneratedCredentials() || {};
    const creds: Record<string, { email: string; password: string }> = { ...existing };

    for (const { id } of BOT_CONFIGS) {
      if (!creds[id]) {
        creds[id] = {
          email: generateBotEmail(),
          password: generatePassword(),
        };
      }
    }

    saveGeneratedCredentials(creds);
    res.json({
      message: "Credentials generated. Register each account at https://app.orangeweb3.com",
      bots: Object.entries(creds).map(([id, c]) => ({ id, email: c.email, password: c.password })),
    });
  });

  app.get("/api/setup/credentials", (_req, res) => {
    const creds = loadGeneratedCredentials();
    if (!creds) {
      return res.json({ generated: false, bots: [] });
    }
    const bots = Object.entries(creds).map(([id, c]) => {
      const config = BOT_CONFIGS.find(bc => bc.id === id);
      const hasEnv = config ? !!(process.env[config.emailKey] && process.env[config.passKey]) : false;
      return { id, email: c.email, password: c.password, configured: hasEnv, registered: !!c.registered };
    });
    res.json({ generated: true, bots });
  });

  app.post("/api/setup/update-credential", (req, res) => {
    const { botId, email, password } = req.body;
    if (!botId || !email || !password) {
      return res.status(400).json({ error: "botId, email, and password are required" });
    }
    const config = BOT_CONFIGS.find(bc => bc.id === botId);
    if (!config) {
      return res.status(404).json({ error: "Bot not found" });
    }
    const creds = loadGeneratedCredentials() || {};
    creds[botId] = { email, password };
    saveGeneratedCredentials(creds);
    res.json({ message: "Credential updated", botId, email });
  });

  app.post("/api/setup/register", async (req, res) => {
    const { botId } = req.body;
    const creds = loadGeneratedCredentials();
    if (!creds) {
      return res.status(400).json({ error: "No credentials generated yet" });
    }

    const botsToRegister = botId
      ? [{ id: botId, ...creds[botId] }].filter(b => b.email)
      : Object.entries(creds).filter(([_, c]) => !c.registered).map(([id, c]) => ({ id, ...c }));

    if (botsToRegister.length === 0) {
      return res.status(400).json({ error: "No bots to register" });
    }

    const apiKey = getBedrockApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: "Bedrock API key not available" });
    }

    const results: Array<{ id: string; success: boolean; message: string }> = [];

    for (const bot of botsToRegister) {
      try {
        const response = await fetch("https://api.bedrockpassport.com/api/v1/auth/email/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": apiKey,
          },
          body: JSON.stringify({
            email: bot.email,
            password: bot.password,
            passwordConfirm: bot.password,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          if (creds[bot.id]) {
            creds[bot.id].registered = true;
          }
          results.push({ id: bot.id, success: true, message: "Registered successfully" });
        } else {
          const errMsg = data?.message || data?.error || `Registration failed (${response.status})`;
          results.push({ id: bot.id, success: false, message: errMsg });
        }
      } catch (err: any) {
        results.push({ id: bot.id, success: false, message: err.message || "Network error" });
      }
    }

    saveGeneratedCredentials(creds);
    res.json({ results });
  });

  app.post("/api/setup/activate", (_req, res) => {
    const creds = loadGeneratedCredentials();
    if (!creds) {
      return res.status(400).json({ error: "No credentials found" });
    }

    const apiKey = getBedrockApiKey();
    const activated: string[] = [];

    for (const { id, emailKey, passKey } of BOT_CONFIGS) {
      const botCreds = creds[id];
      if (botCreds && botCreds.email && botCreds.password) {
        process.env[emailKey] = botCreds.email;
        process.env[passKey] = botCreds.password;

        if (!botManager.getBot(id)) {
          botManager.createBot(id, { email: botCreds.email, password: botCreds.password, apiKey });
        }
        activated.push(id);
      }
    }

    res.json({ message: "Credentials activated", activated });
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    const unsubscribers: (() => void)[] = [];

    for (const [botId, bot] of botManager.getAllBots()) {
      const unsub = bot.onStatusChange((status) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "status", botId, data: status }));
        }
      });
      unsubscribers.push(unsub);

      storage.getBotStatus(botId).then((status) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "status", botId, data: status }));
        }
      });
    }

    ws.on("close", () => unsubscribers.forEach(u => u()));
  });

  app.get("/api/bots", async (_req, res) => {
    const result: Record<string, any> = {};
    for (const [botId, bot] of botManager.getAllBots()) {
      result[botId] = {
        status: await storage.getBotStatus(botId),
        running: bot.isRunning(),
        autoNav: bot.isAutoNavActive(),
        displayName: bot.getDisplayName(),
      };
    }
    res.json(result);
  });

  app.post("/api/bots/start-all", async (req, res) => {
    try {
      const roomUrl = req.body?.roomUrl;
      res.json({ message: "Starting all bots..." });
      botManager.startAll(roomUrl).catch(() => {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bots/stop-all", async (_req, res) => {
    try {
      await botManager.stopAll();
      res.json({ message: "All bots stopped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bots/:botId/status", async (req, res) => {
    const status = await storage.getBotStatus(req.params.botId);
    res.json(status);
  });

  app.get("/api/bots/:botId/logs", async (req, res) => {
    const logs = await storage.getLogs(req.params.botId);
    res.json(logs);
  });

  app.post("/api/bots/:botId/start", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      if (bot.isRunning()) return res.status(400).json({ error: "Bot is already running" });
      const roomUrl = req.body?.roomUrl;
      res.json({ message: `Bot ${req.params.botId} starting...` });
      bot.start(roomUrl).then(() => {
        botManager.updateBotNames();
      }).catch(() => {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/stop", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      await bot.stop();
      res.json({ message: `Bot ${req.params.botId} stopped` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/auto-nav", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const { enabled } = req.body;
      if (enabled) {
        await bot.startAutoNav();
        res.json({ message: "Auto-navigation started", autoNav: true });
      } else {
        await bot.stopAutoNav();
        res.json({ message: "Auto-navigation stopped", autoNav: false });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/bots/:botId/auto-nav", async (req, res) => {
    const bot = botManager.getBot(req.params.botId);
    if (!bot) return res.status(404).json({ error: "Bot not found" });
    res.json({ autoNav: bot.isAutoNavActive() });
  });

  app.post("/api/bots/:botId/chat", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
      }
      await bot.sendChat(message);
      res.json({ message: "Chat sent" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/name", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "name is required" });
      }
      await bot.setDisplayName(name.trim());
      botManager.updateBotNames();
      res.json({ message: "Name updated", name: name.trim() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/move", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const parsed = moveCommandSchema.parse(req.body);
      await bot.move(parsed.direction, parsed.duration || 500);
      res.json({ message: `Moving ${parsed.direction}` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/look", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const { deltaX, deltaY } = req.body;
      await bot.look(deltaX || 0, deltaY || 0);
      res.json({ message: "Looked" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bots/:botId/jump", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      await bot.jump();
      res.json({ message: "Jumped!" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/bots/:botId/screenshot", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const screenshot = await bot.takeScreenshot();
      if (!screenshot) return res.status(404).json({ error: "No screenshot available" });
      res.json({ screenshot });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bots/:botId/page-info", async (req, res) => {
    try {
      const bot = botManager.getBot(req.params.botId);
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      const info = await bot.getPageInfo();
      res.json(info || { title: "", url: "" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bot/status", async (_req, res) => {
    const status = await storage.getBotStatus("bot1");
    res.json(status);
  });

  app.get("/api/bot/logs", async (_req, res) => {
    const logs = await storage.getLogs("bot1");
    res.json(logs);
  });

  app.post("/api/bot/start", async (req, res) => {
    try {
      const bot = botManager.getBot("bot1");
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      if (bot.isRunning()) return res.status(400).json({ error: "Bot is already running" });
      const roomUrl = req.body?.roomUrl;
      res.json({ message: "Bot starting..." });
      bot.start(roomUrl).then(() => botManager.updateBotNames()).catch(() => {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bot/stop", async (_req, res) => {
    try {
      const bot = botManager.getBot("bot1");
      if (!bot) return res.status(404).json({ error: "Bot not found" });
      await bot.stop();
      res.json({ message: "Bot stopped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bot/auto-nav", async (_req, res) => {
    const bot = botManager.getBot("bot1");
    res.json({ autoNav: bot?.isAutoNavActive() || false });
  });

  return httpServer;
}
