import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { storage } from "./storage";
import type { BotStatus } from "@shared/schema";
import { log } from "./index";

const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const HUBS_BASE_URL = "https://worlds.orangeweb3.com";
const BEDROCK_API_URL = "https://api.bedrockpassport.com/orange/v1";

export class HubsBot {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private authToken: string | null = null;
  private statusListeners: Set<(status: BotStatus) => void> = new Set();
  private starting: boolean = false;

  onStatusChange(listener: (status: BotStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async updateStatus(status: BotStatus["status"], message: string, roomUrl?: string) {
    const botStatus: BotStatus = {
      status,
      message,
      roomUrl,
      timestamp: Date.now(),
    };
    await storage.setBotStatus(botStatus);
    await storage.addLog(message);
    log(message, "hubs-bot");
    for (const listener of this.statusListeners) {
      listener(botStatus);
    }
  }

  async authenticate(): Promise<string> {
    const email = process.env.HUBS_BOT_EMAIL;
    const password = process.env.HUBS_BOT_PASSWORD;
    const apiKey = process.env.BEDROCK_API_KEY;

    if (!email || !password || !apiKey) {
      throw new Error("Missing bot credentials in environment variables");
    }

    await this.updateStatus("authenticating", "Authenticating with Bedrock API...");

    const response = await fetch(`${BEDROCK_API_URL}/auth/email/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock auth failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    const token = data.token || data.access_token || data.accessToken || data.data?.token || data.data?.access_token;
    if (!token) {
      throw new Error("No token found in auth response. Response keys: " + Object.keys(data).join(", "));
    }

    this.authToken = token;
    await this.updateStatus("authenticating", "Authentication successful!");
    return token;
  }

  async launch(): Promise<void> {
    await this.updateStatus("launching", "Launching browser...");

    try {
      this.browser = await puppeteer.launch({
        executablePath: CHROMIUM_PATH,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-extensions",
          "--disable-web-security",
          "--allow-running-insecure-content",
          "--autoplay-policy=no-user-gesture-required",
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      await this.page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      );
      await this.page.setDefaultNavigationTimeout(120000);
      await this.page.setDefaultTimeout(30000);

      this.page.on("console", (msg) => {
        const text = msg.text();
        if (text.length < 200) {
          storage.addLog(`[browser] ${text}`);
        }
      });

      this.page.on("pageerror", (err) => {
        storage.addLog(`[browser error] ${err.message.slice(0, 200)}`);
      });

      await this.updateStatus("launching", "Browser launched successfully");
    } catch (err: any) {
      await this.updateStatus("error", `Failed to launch browser: ${err.message}`);
      throw err;
    }
  }

  async loginToHubs(roomUrl?: string): Promise<void> {
    if (!this.page || !this.authToken) {
      throw new Error("Browser not launched or not authenticated");
    }

    const targetUrl = roomUrl || HUBS_BASE_URL;
    await this.updateStatus("logging_in", `Navigating to ${targetUrl}...`, targetUrl);

    try {
      await this.page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });

      await this.updateStatus("logging_in", "Page loaded, waiting for app to initialize...");
      await this.waitForHubsReady();

      await this.updateStatus("logging_in", "Setting auth token...");

      const email = process.env.HUBS_BOT_EMAIL || "";
      await this.page.evaluate((token: string, botEmail: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch (e) {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
          }));
        }
        try {
          (window as any).__store?.update({ credentials: { token, email: botEmail } });
        } catch (e) {}
      }, this.authToken, email);

      await this.updateStatus("logging_in", "Auth token set, reloading page...");

      await this.page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
      await this.waitForHubsReady();

      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();
      await this.updateStatus("connected", `Connected! Page: "${pageTitle}" URL: ${currentUrl}`, currentUrl);

      await this.tryEnterRoom();
    } catch (err: any) {
      await this.updateStatus("error", `Login failed: ${err.message}`);
      throw err;
    }
  }

  private async waitForHubsReady(): Promise<void> {
    if (!this.page) return;

    await storage.addLog("Waiting for Hubs app to initialize...");

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const ready = await this.page.evaluate(() => {
        const hasCanvas = !!document.querySelector("canvas");
        const hasAframe = !!(document as any).querySelector("a-scene");
        const hasUI = !!document.querySelector("button");
        return { hasCanvas, hasAframe, hasUI };
      });

      await storage.addLog(`Check ${i + 1}/30: canvas=${ready.hasCanvas} aframe=${ready.hasAframe} ui=${ready.hasUI}`);

      if (ready.hasCanvas || ready.hasAframe) {
        await storage.addLog("Hubs app detected! Waiting a few more seconds for full load...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
      }

      if (ready.hasUI && i >= 3) {
        await storage.addLog("UI buttons detected, proceeding...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        return;
      }
    }

    await storage.addLog("Timed out waiting for Hubs, proceeding anyway...");
  }

  private async tryEnterRoom(): Promise<void> {
    if (!this.page) return;

    try {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const pageContent = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.map(b => ({ text: b.textContent?.trim() || "", classes: b.className })).slice(0, 20);
      });
      await storage.addLog(`Found ${pageContent.length} buttons: ${pageContent.map(b => b.text).filter(Boolean).join(", ")}`);

      for (const selector of [
        'button[class*="enter"]',
        'button[class*="Enter"]',
        'button[data-testid*="enter"]',
        'a[class*="enter"]',
      ]) {
        const el = await this.page.$(selector);
        if (el) {
          await el.click();
          await this.updateStatus("connected", `Clicked: ${selector}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      }

      for (const selector of [
        'button[class*="join"]',
        'button[class*="Join"]',
        'button[data-testid*="join"]',
      ]) {
        const el = await this.page.$(selector);
        if (el) {
          await el.click();
          await this.updateStatus("connected", `Clicked: ${selector}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      }

      for (const selector of [
        'button[class*="accept"]',
        'button[class*="continue"]',
        'button[class*="agree"]',
        'button[class*="Connect"]',
      ]) {
        const el = await this.page.$(selector);
        if (el) {
          await el.click();
          await this.updateStatus("connected", `Clicked: ${selector}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }

      const buttons = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        return btns
          .map(b => b.textContent?.trim() || "")
          .filter(t => t.length > 0 && t.length < 30);
      });
      if (buttons.length > 0) {
        await storage.addLog(`Remaining buttons on page: ${buttons.join(", ")}`);
      }
    } catch (err: any) {
      await storage.addLog(`Room entry attempt: ${err.message}`);
    }
  }

  async enterRoom(roomUrl: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched");
    }

    await this.updateStatus("navigating", `Entering room: ${roomUrl}`, roomUrl);
    await this.page.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await this.waitForHubsReady();
    await this.tryEnterRoom();
    await this.updateStatus("connected", `In room: ${roomUrl}`, roomUrl);
  }

  async move(direction: string, duration: number = 500): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched");
    }

    const keyMap: Record<string, string> = {
      forward: "w",
      backward: "s",
      left: "a",
      right: "d",
    };

    const key = keyMap[direction];
    if (!key) {
      if (direction === "stop") {
        await this.stopMovement();
        return;
      }
      throw new Error(`Unknown direction: ${direction}`);
    }

    await storage.addLog(`Moving ${direction} for ${duration}ms`);
    await this.page.keyboard.down(key);
    await new Promise(resolve => setTimeout(resolve, duration));
    await this.page.keyboard.up(key);
  }

  async jump(): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await storage.addLog("Jumping!");
    await this.page.keyboard.press("Space");
  }

  async look(deltaX: number, deltaY: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    await this.page.evaluate((dx: number, dy: number) => {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        canvas.dispatchEvent(new PointerEvent("pointerdown", { button: 2, clientX: 640, clientY: 360 }));
        canvas.dispatchEvent(new PointerEvent("pointermove", { movementX: dx, movementY: dy, clientX: 640 + dx, clientY: 360 + dy }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { button: 2 }));
      }
    }, deltaX, deltaY);
    await storage.addLog(`Looked: deltaX=${deltaX}, deltaY=${deltaY}`);
  }

  private async stopMovement(): Promise<void> {
    if (!this.page) return;
    for (const key of ["w", "a", "s", "d"]) {
      await this.page.keyboard.up(key);
    }
    await storage.addLog("Stopped all movement");
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.page) return null;
    try {
      const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
      return `data:image/jpeg;base64,${screenshot}`;
    } catch {
      return null;
    }
  }

  async getPageInfo(): Promise<{ title: string; url: string } | null> {
    if (!this.page) return null;
    return {
      title: await this.page.title(),
      url: this.page.url(),
    };
  }

  async stop(preserveError = false): Promise<void> {
    await this.stopMovement().catch(() => {});
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
    this.authToken = null;
    this.starting = false;
    if (!preserveError) {
      await this.updateStatus("idle", "Bot stopped");
    }
  }

  async start(roomUrl?: string): Promise<void> {
    this.starting = true;
    try {
      await this.authenticate();
      await this.launch();
      await this.loginToHubs(roomUrl);
      this.starting = false;
    } catch (err: any) {
      this.starting = false;
      await this.updateStatus("error", `Bot start failed: ${err.message}`);
      await this.stop(true).catch(() => {});
      throw err;
    }
  }

  isRunning(): boolean {
    return this.browser !== null || this.starting;
  }
}

export const hubsBot = new HubsBot();
