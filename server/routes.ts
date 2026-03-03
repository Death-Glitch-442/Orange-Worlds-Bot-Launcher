import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { hubsBot } from "./hubs-bot";
import { botCommandSchema, moveCommandSchema, roomCommandSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    const unsubscribe = hubsBot.onStatusChange((status) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "status", data: status }));
      }
    });

    ws.on("close", () => unsubscribe());

    storage.getBotStatus().then((status) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "status", data: status }));
      }
    });
  });

  const broadcastLog = (message: string) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "log", data: message }));
      }
    }
  };

  app.get("/api/bot/status", async (_req, res) => {
    const status = await storage.getBotStatus();
    res.json(status);
  });

  app.get("/api/bot/logs", async (_req, res) => {
    const logs = await storage.getLogs();
    res.json(logs);
  });

  app.post("/api/bot/start", async (req, res) => {
    try {
      if (hubsBot.isRunning()) {
        return res.status(400).json({ error: "Bot is already running" });
      }
      const roomUrl = req.body?.roomUrl;
      if (roomUrl && typeof roomUrl !== "string") {
        return res.status(400).json({ error: "roomUrl must be a string" });
      }
      res.json({ message: "Bot starting..." });
      hubsBot.start(roomUrl).catch((err) => {
        broadcastLog(`Bot error: ${err.message}`);
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bot/stop", async (_req, res) => {
    try {
      await hubsBot.stop();
      res.json({ message: "Bot stopped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bot/move", async (req, res) => {
    try {
      const parsed = moveCommandSchema.parse(req.body);
      await hubsBot.move(parsed.direction, parsed.duration || 500);
      res.json({ message: `Moving ${parsed.direction}` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bot/jump", async (_req, res) => {
    try {
      await hubsBot.jump();
      res.json({ message: "Jumped!" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bot/look", async (req, res) => {
    try {
      const { deltaX, deltaY } = req.body;
      await hubsBot.look(deltaX || 0, deltaY || 0);
      res.json({ message: "Looked" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bot/enter-room", async (req, res) => {
    try {
      const parsed = roomCommandSchema.parse(req.body);
      await hubsBot.enterRoom(parsed.roomUrl);
      res.json({ message: `Entering room: ${parsed.roomUrl}` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/bot/screenshot", async (_req, res) => {
    try {
      const screenshot = await hubsBot.takeScreenshot();
      if (!screenshot) {
        return res.status(404).json({ error: "No screenshot available" });
      }
      res.json({ screenshot });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bot/page-info", async (_req, res) => {
    try {
      const info = await hubsBot.getPageInfo();
      res.json(info || { title: "", url: "" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
