import type { BotStatus } from "@shared/schema";

export interface IStorage {
  getBotStatus(botId: string): Promise<BotStatus>;
  setBotStatus(botId: string, status: BotStatus): Promise<void>;
  getLogs(botId: string): Promise<string[]>;
  addLog(botId: string, message: string): Promise<void>;
  getAllBotIds(): string[];
}

export class MemStorage implements IStorage {
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
}

export const storage = new MemStorage();
