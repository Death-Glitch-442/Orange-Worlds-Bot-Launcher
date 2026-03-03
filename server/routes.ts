import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { botManager } from "./hubs-bot";
import { moveCommandSchema, roomCommandSchema } from "@shared/schema";

function initBots() {
  const apiKey = process.env.BEDROCK_API_KEY || "";

  const bot1Email = process.env.HUBS_BOT_EMAIL;
  const bot1Pass = process.env.HUBS_BOT_PASSWORD;
  if (bot1Email && bot1Pass) {
    botManager.createBot("bot1", { email: bot1Email, password: bot1Pass, apiKey });
  }

  const bot2Email = process.env.HUBS_BOT2_EMAIL;
  const bot2Pass = process.env.HUBS_BOT2_PASSWORD;
  if (bot2Email && bot2Pass) {
    botManager.createBot("bot2", { email: bot2Email, password: bot2Pass, apiKey });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  initBots();

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
