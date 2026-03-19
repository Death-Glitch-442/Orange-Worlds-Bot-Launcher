import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "openrouter-config.json");

interface Config {
  manualOpenRouterKey?: string;
}

function readConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function writeConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getManualOpenRouterKey(): string | null {
  return readConfig().manualOpenRouterKey || null;
}

export function setManualOpenRouterKey(key: string | null): void {
  const config = readConfig();
  if (key) {
    config.manualOpenRouterKey = key;
  } else {
    delete config.manualOpenRouterKey;
  }
  writeConfig(config);
}

export function getEffectiveOpenRouterKey(): string | null {
  return process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || getManualOpenRouterKey();
}

export function getEffectiveOpenRouterBaseURL(): string {
  if (process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL) {
    return process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  }
  return "https://openrouter.ai/api/v1";
}
