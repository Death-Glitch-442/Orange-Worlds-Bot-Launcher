import type { BotStatus } from "@shared/schema";

export interface IStorage {
  getBotStatus(): Promise<BotStatus>;
  setBotStatus(status: BotStatus): Promise<void>;
  getLogs(): Promise<string[]>;
  addLog(message: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private botStatus: BotStatus;
  private logs: string[];

  constructor() {
    this.botStatus = {
      status: "idle",
      message: "Bot is idle",
      timestamp: Date.now(),
    };
    this.logs = [];
  }

  async getBotStatus(): Promise<BotStatus> {
    return this.botStatus;
  }

  async setBotStatus(status: BotStatus): Promise<void> {
    this.botStatus = status;
  }

  async getLogs(): Promise<string[]> {
    return this.logs.slice(-100);
  }

  async addLog(message: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    this.logs.push(`[${timestamp}] ${message}`);
    if (this.logs.length > 200) {
      this.logs = this.logs.slice(-100);
    }
  }
}

export const storage = new MemStorage();
