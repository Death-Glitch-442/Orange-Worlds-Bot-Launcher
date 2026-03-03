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
  private lastScreenshot: string | null = null;

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

  private async autoScreenshot(label: string): Promise<void> {
    if (!this.page) return;
    try {
      const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });
      this.lastScreenshot = `data:image/jpeg;base64,${screenshot}`;
      await storage.addLog(`[screenshot taken: ${label}]`);
    } catch {}
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
    await storage.addLog(`Auth response structure: ${JSON.stringify(Object.keys(data))}`);
    
    let token: string | undefined;
    if (data.token) token = data.token;
    else if (data.access_token) token = data.access_token;
    else if (data.accessToken) token = data.accessToken;
    else if (data.data?.token) token = data.data.token;
    else if (data.data?.access_token) token = data.data.access_token;
    else if (data.data?.accessToken) token = data.data.accessToken;
    else if (data.result?.token) token = data.result.token;
    else if (data.user?.token) token = data.user.token;

    if (!token) {
      const safePreview = JSON.stringify(data).slice(0, 300);
      await storage.addLog(`Auth response preview (looking for token): ${safePreview}`);
      throw new Error("No token found in auth response. Keys: " + Object.keys(data).join(", "));
    }

    this.authToken = token;
    await this.updateStatus("authenticating", `Authentication successful! Token length: ${token.length}`);
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
        if (text.length < 300 && !text.includes("color:")) {
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

      await this.updateStatus("logging_in", "Page DOM loaded, setting auth token before full load...");

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
      }, this.authToken, email);

      await this.updateStatus("logging_in", "Auth token set in localStorage, reloading...");
      await this.page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });

      await this.updateStatus("logging_in", "Waiting for Hubs UI to fully load...");
      await this.waitForLobbyUI();

      await this.autoScreenshot("after-login");

      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();
      await this.updateStatus("logging_in", `Page loaded: "${pageTitle}" at ${currentUrl}`, currentUrl);

      await this.dumpPageState("post-login");
      await this.tryEnterRoom();

      await this.autoScreenshot("after-enter-attempt");

      const finalUrl = this.page.url();
      await this.updateStatus("connected", `Bot ready at: ${finalUrl}`, finalUrl);
    } catch (err: any) {
      await this.autoScreenshot("error-state");
      await this.updateStatus("error", `Login failed: ${err.message}`);
      throw err;
    }
  }

  private async waitForLobbyUI(): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const state = await this.page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll("button"));
        const buttonTexts = allButtons.map(b => (b.textContent || "").trim()).filter(t => t.length > 0);
        const hasCanvas = !!document.querySelector("canvas");
        const hasScene = !!document.querySelector("a-scene");
        const allLinks = Array.from(document.querySelectorAll("a"));
        const linkTexts = allLinks.map(a => `${(a.textContent || "").trim()}[${a.href}]`).filter(t => t.length > 2).slice(0, 10);
        const inputCount = document.querySelectorAll("input").length;
        return { buttonTexts, hasCanvas, hasScene, linkTexts, inputCount, buttonCount: allButtons.length };
      });

      await storage.addLog(
        `Wait ${i + 1}/20: buttons=${state.buttonCount}(${state.buttonTexts.slice(0, 5).join(", ")}) canvas=${state.hasCanvas} scene=${state.hasScene} inputs=${state.inputCount}`
      );

      if (state.buttonTexts.some(t => {
        const lower = t.toLowerCase();
        return lower.includes("join") || lower.includes("enter") || lower.includes("room");
      })) {
        await storage.addLog("Found join/enter button! Proceeding...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      }

      if (state.hasCanvas && state.buttonCount > 0 && i >= 5) {
        await storage.addLog("Canvas + buttons found, proceeding...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      }
    }

    await storage.addLog("Timed out waiting for lobby UI, proceeding anyway...");
  }

  private async dumpPageState(label: string): Promise<void> {
    if (!this.page) return;

    const state = await this.page.evaluate(() => {
      const allElements = document.querySelectorAll("button, a, input, [role='button']");
      const items: string[] = [];
      allElements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || "").trim().slice(0, 40);
        const classes = (el.className || "").toString().slice(0, 60);
        const id = el.id || "";
        const href = (el as HTMLAnchorElement).href || "";
        const type = (el as HTMLInputElement).type || "";
        items.push(`<${tag} id="${id}" class="${classes}" type="${type}" href="${href}">${text}</${tag}>`);
      });
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 500) || "",
        elements: items.slice(0, 30),
      };
    });

    await storage.addLog(`[${label}] URL: ${state.url}`);
    await storage.addLog(`[${label}] Title: ${state.title}`);
    await storage.addLog(`[${label}] Body text: ${state.bodyText.slice(0, 200)}`);
    for (const el of state.elements) {
      await storage.addLog(`[${label}] ${el}`);
    }
  }

  private async clickButtonByText(textPatterns: string[]): Promise<string | null> {
    if (!this.page) return null;

    const clicked = await this.page.evaluate((patterns: string[]) => {
      const elements = Array.from(document.querySelectorAll("button, a[role='button'], [role='button'], a"));
      for (const pattern of patterns) {
        const lowerPattern = pattern.toLowerCase();
        for (const el of elements) {
          const text = (el.textContent || "").trim().toLowerCase();
          if (text === lowerPattern || text.includes(lowerPattern)) {
            (el as HTMLElement).click();
            return (el.textContent || "").trim();
          }
        }
      }
      return null;
    }, textPatterns);

    if (clicked) {
      await storage.addLog(`Clicked button with text: "${clicked}"`);
    }
    return clicked;
  }

  private async tryEnterRoom(): Promise<void> {
    if (!this.page) return;

    try {
      await storage.addLog("=== Starting room entry sequence ===");

      const clicked1 = await this.clickButtonByText([
        "join room", "join", "enter room", "enter", "enter world", "connect"
      ]);

      if (clicked1) {
        await this.updateStatus("logging_in", `Clicked "${clicked1}", waiting for next step...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        await this.autoScreenshot("after-join-click");
        await this.dumpPageState("after-join-click");

        const clicked2 = await this.clickButtonByText([
          "enter on screen", "enter room", "enter", "accept", "agree", "continue",
          "ok", "got it", "close", "connect", "spawn"
        ]);

        if (clicked2) {
          await storage.addLog(`Clicked secondary: "${clicked2}"`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          await this.autoScreenshot("after-secondary-click");
          await this.dumpPageState("after-secondary-click");

          const clicked3 = await this.clickButtonByText([
            "enter room", "enter", "join", "connect", "spawn", "continue"
          ]);
          if (clicked3) {
            await storage.addLog(`Clicked tertiary: "${clicked3}"`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      } else {
        await storage.addLog("No join/enter button found to click");
        await this.dumpPageState("no-button-found");
      }

      await storage.addLog("=== Room entry sequence complete ===");
    } catch (err: any) {
      await storage.addLog(`Room entry error: ${err.message}`);
    }
  }

  async enterRoom(roomUrl: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched");
    }

    if (this.page.url() === roomUrl) {
      await this.updateStatus("navigating", "Already on this page, attempting to enter room...", roomUrl);
      await this.tryEnterRoom();
      await this.updateStatus("connected", `In room: ${roomUrl}`, roomUrl);
      return;
    }

    await this.updateStatus("navigating", `Navigating to room: ${roomUrl}`, roomUrl);

    const email = process.env.HUBS_BOT_EMAIL || "";
    if (this.authToken) {
      await this.page.evaluateOnNewDocument((token: string, botEmail: string) => {
        try {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
          }));
        } catch {}
      }, this.authToken, email);
    }

    await this.page.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    if (this.authToken) {
      await this.page.evaluate((token: string, botEmail: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch {}
      }, this.authToken, email);
    }

    await this.waitForLobbyUI();
    await this.autoScreenshot("enter-room-loaded");
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
    if (!this.page) {
      return this.lastScreenshot;
    }
    try {
      const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
      this.lastScreenshot = `data:image/jpeg;base64,${screenshot}`;
      return this.lastScreenshot;
    } catch {
      return this.lastScreenshot;
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
