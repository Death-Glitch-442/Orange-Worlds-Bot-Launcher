import type { BotStatus } from "@shared/schema";
import { botChatHistory } from "@shared/schema";
import { db } from "./db";
import { desc, eq } from "drizzle-orm";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface IStorage {
  getBotStatus(botId: string): Promise<BotStatus>;
  setBotStatus(botId: string, status: BotStatus): Promise<void>;
  getLogs(botId: string): Promise<string[]>;
  addLog(botId: string, message: string): Promise<void>;
  getAllBotIds(): string[];
  saveMessage(botId: string, role: "user" | "assistant", content: string): Promise<void>;
  getRecentMessages(botId: string, limit?: number): Promise<ChatMessage[]>;
  clearHistory(botId: string): Promise<void>;
}

class Storage implements IStorage {
  private botStatuses: Map<string, BotStatus> = new Map();
  private botLogs: Map<string, string[]> = new Map();

  private ensureBot(botId: string) {
    if (!this.botStatuses.has(botId)) {
      this.botStatuses.set(botId, {
        status: "idle",
        message: "Bot is idle",
        timestamp: Date.now(),
      });
      this.botLogs.set(botId, []);
    }
  }

  async getBotStatus(botId: string): Promise<BotStatus> {
    this.ensureBot(botId);
    return this.botStatuses.get(botId)!;
  }

  async setBotStatus(botId: string, status: BotStatus): Promise<void> {
    this.ensureBot(botId);
    this.botStatuses.set(botId, status);
  }

  async getLogs(botId: string): Promise<string[]> {
    this.ensureBot(botId);
    return (this.botLogs.get(botId) || []).slice(-100);
  }

  async addLog(botId: string, message: string): Promise<void> {
    this.ensureBot(botId);
    const logs = this.botLogs.get(botId)!;
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    logs.push(`[${timestamp}] ${message}`);
    if (logs.length > 200) {
      this.botLogs.set(botId, logs.slice(-100));
    }
  }

  getAllBotIds(): string[] {
    return Array.from(this.botStatuses.keys());
  }

  async saveMessage(botId: string, role: "user" | "assistant", content: string): Promise<void> {
    try {
      await db.insert(botChatHistory).values({ botId, role, content });
    } catch (err: any) {
      console.error(`Failed to save chat message for ${botId}: ${err.message}`);
    }
  }

  async getRecentMessages(botId: string, limit = 50): Promise<ChatMessage[]> {
    try {
      const rows = await db
        .select()
        .from(botChatHistory)
        .where(eq(botChatHistory.botId, botId))
        .orderBy(desc(botChatHistory.createdAt))
        .limit(limit);
      return rows
        .reverse()
        .map(r => ({ role: r.role as "user" | "assistant", content: r.content }));
    } catch (err: any) {
      console.error(`Failed to load chat history for ${botId}: ${err.message}`);
      return [];
    }
  }

  async clearHistory(botId: string): Promise<void> {
    try {
      await db.delete(botChatHistory).where(eq(botChatHistory.botId, botId));
    } catch (err: any) {
      console.error(`Failed to clear chat history for ${botId}: ${err.message}`);
    }
  }
}

export const storage = new Storage();
