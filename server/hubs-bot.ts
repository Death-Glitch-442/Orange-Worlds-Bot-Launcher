import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { storage } from "./storage";
import type { BotStatus } from "@shared/schema";
import { log } from "./index";

const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const HUBS_BASE_URL = "https://worlds.orangeweb3.com";
const BEDROCK_API_URL = "https://api.bedrockpassport.com/orange/v1";

const AUTO_NAV_MESSAGES = [
  "Hello everyone!",
  "Nice place!",
  "Just exploring around...",
  "This world is awesome!",
  "Anyone here?",
  "Checking things out",
  "Cool vibes in here",
  "Love the design of this space",
  "Walking around the town",
  "What a great virtual world!",
  "Hey there!",
  "Greetings from the bot!",
  "This is fun!",
  "Exploring Juice Town",
  "Beautiful scenery",
];

export class HubsBot {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private authToken: string | null = null;
  private statusListeners: Set<(status: BotStatus) => void> = new Set();
  private starting: boolean = false;
  private lastScreenshot: string | null = null;
  private autoNavInterval: ReturnType<typeof setTimeout> | null = null;
  private autoNavRunning: boolean = false;
  private roomUrl: string = HUBS_BASE_URL;

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
    await storage.addLog(`Auth response keys: ${JSON.stringify(Object.keys(data))}`);
    
    if (data.token) {
      await storage.addLog(`data.token type: ${typeof data.token}`);
      if (typeof data.token === "object") {
        await storage.addLog(`data.token keys: ${JSON.stringify(Object.keys(data.token))}`);
        await storage.addLog(`data.token preview: ${JSON.stringify(data.token).slice(0, 300)}`);
      }
    }
    if (data.user) {
      await storage.addLog(`data.user type: ${typeof data.user}`);
      if (typeof data.user === "object") {
        await storage.addLog(`data.user keys: ${JSON.stringify(Object.keys(data.user))}`);
      }
    }

    let token: string | undefined;
    
    const findToken = (obj: any): string | undefined => {
      if (!obj || typeof obj !== "object") return undefined;
      for (const key of ["token", "access_token", "accessToken", "jwt", "id_token", "idToken", "session_token"]) {
        if (typeof obj[key] === "string" && obj[key].length > 10) {
          return obj[key];
        }
      }
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "object" && obj[key]) {
          const found = findToken(obj[key]);
          if (found) return found;
        }
      }
      return undefined;
    };

    token = findToken(data);

    if (!token) {
      await storage.addLog(`FULL auth response: ${JSON.stringify(data).slice(0, 500)}`);
      throw new Error("No string token found in auth response");
    }

    this.authToken = token;
    await storage.addLog(`Token found (type=${typeof token}, length=${token.length}, prefix=${token.slice(0, 20)}...)`);
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

    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const state = await this.page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll("button"));
        const buttonTexts = allButtons.map(b => (b.textContent || "").trim()).filter(t => t.length > 0);
        const hasCanvas = !!document.querySelector("canvas");
        const hasScene = !!document.querySelector("a-scene");
        const allDivs = document.querySelectorAll("div").length;
        const allSpans = document.querySelectorAll("span").length;
        const inputCount = document.querySelectorAll("input").length;
        const bodyLength = document.body?.innerText?.length || 0;
        const iframes = document.querySelectorAll("iframe").length;
        const shadowHosts = Array.from(document.querySelectorAll("*")).filter(el => el.shadowRoot).length;
        return { buttonTexts, hasCanvas, hasScene, inputCount, buttonCount: allButtons.length, allDivs, allSpans, bodyLength, iframes, shadowHosts };
      });

      await storage.addLog(
        `Wait ${i + 1}/15: btns=${state.buttonCount}(${state.buttonTexts.slice(0, 5).join(", ")}) canvas=${state.hasCanvas} scene=${state.hasScene} divs=${state.allDivs} spans=${state.allSpans} bodyLen=${state.bodyLength} iframes=${state.iframes} shadowHosts=${state.shadowHosts}`
      );

      if (state.buttonTexts.some(t => {
        const lower = t.toLowerCase();
        return lower.includes("join") || lower.includes("enter") || lower.includes("room");
      })) {
        await storage.addLog("Found join/enter button! Proceeding...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      }

      if (state.hasScene && i >= 5) {
        await storage.addLog("Scene loaded, proceeding to check page state...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        return;
      }
    }

    await storage.addLog("Timed out waiting for lobby UI, proceeding anyway...");
  }

  private async dumpPageState(label: string): Promise<void> {
    if (!this.page) return;

    const state = await this.page.evaluate(() => {
      const allElements = document.querySelectorAll("button, a, input, [role='button'], [class*='enter'], [class*='join'], [class*='lobby'], [class*='room']");
      const items: string[] = [];
      allElements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || "").trim().slice(0, 60);
        const classes = (el.className || "").toString().slice(0, 80);
        const id = el.id || "";
        const href = (el as HTMLAnchorElement).href || "";
        const dataAttrs = Array.from(el.attributes).filter(a => a.name.startsWith("data-")).map(a => `${a.name}="${a.value}"`).join(" ");
        items.push(`<${tag} id="${id}" class="${classes}" ${dataAttrs}>${text}</${tag}>`);
      });

      const rootDiv = document.getElementById("root") || document.getElementById("app") || document.getElementById("ui-root");
      const rootHtml = rootDiv ? rootDiv.innerHTML.slice(0, 500) : "no root div found";

      const hubsStore = localStorage.getItem("___hubs_store");
      let storePreview = "not set";
      if (hubsStore) {
        try {
          const parsed = JSON.parse(hubsStore);
          storePreview = `keys: ${Object.keys(parsed).join(", ")}`;
          if (parsed.credentials) {
            storePreview += ` | credentials.keys: ${Object.keys(parsed.credentials).join(", ")}`;
            storePreview += ` | token type: ${typeof parsed.credentials.token}`;
            if (typeof parsed.credentials.token === "string") {
              storePreview += ` | token length: ${parsed.credentials.token.length}`;
            }
          }
        } catch { storePreview = hubsStore.slice(0, 200); }
      }

      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 500) || "",
        elements: items.slice(0, 30),
        rootHtml,
        storePreview,
      };
    });

    await storage.addLog(`[${label}] URL: ${state.url}`);
    await storage.addLog(`[${label}] Title: ${state.title}`);
    await storage.addLog(`[${label}] Hubs store: ${state.storePreview}`);
    await storage.addLog(`[${label}] Body text: ${state.bodyText.slice(0, 300)}`);
    await storage.addLog(`[${label}] Root HTML: ${state.rootHtml.slice(0, 300)}`);
    await storage.addLog(`[${label}] Found ${state.elements.length} interactive elements:`);
    for (const el of state.elements) {
      await storage.addLog(`[${label}]   ${el}`);
    }
  }

  private async waitForButton(textPatterns: string[], maxWaitSecs: number): Promise<boolean> {
    if (!this.page) return false;
    for (let i = 0; i < maxWaitSecs; i++) {
      const found = await this.page.evaluate((patterns: string[]) => {
        const elements = Array.from(document.querySelectorAll("button, a[role='button'], [role='button']"));
        for (const pattern of patterns) {
          const lowerPattern = pattern.toLowerCase();
          for (const el of elements) {
            const text = (el.textContent || "").trim().toLowerCase();
            if (text === lowerPattern || text.includes(lowerPattern)) {
              return true;
            }
          }
        }
        return false;
      }, textPatterns);
      if (found) return true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await storage.addLog(`Waited ${maxWaitSecs}s but didn't find buttons: ${textPatterns.join(", ")}`);
    return false;
  }

  private async clickButtonByText(textPatterns: string[]): Promise<string | null> {
    if (!this.page) return null;

    const clicked = await this.page.evaluate((patterns: string[]) => {
      const elements = Array.from(document.querySelectorAll("button, [role='button']"));
      for (const pattern of patterns) {
        const lowerPattern = pattern.toLowerCase();
        for (const el of elements) {
          const text = (el.textContent || "").trim().toLowerCase();
          if (text === lowerPattern) {
            (el as HTMLElement).click();
            return (el.textContent || "").trim();
          }
        }
        for (const el of elements) {
          const text = (el.textContent || "").trim().toLowerCase();
          if (text.includes(lowerPattern) && text.length < 40) {
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

      // Step 1: Click "Join Room" on the lobby page
      const clicked1 = await this.clickButtonByText([
        "join room", "join"
      ]);

      if (clicked1) {
        await this.updateStatus("logging_in", "Clicked Join Room, waiting for avatar screen...");
        await new Promise(resolve => setTimeout(resolve, 4000));
        await this.autoScreenshot("after-join");
      } else {
        await storage.addLog("No Join Room button found, checking for other entry points...");
        const altClick = await this.clickButtonByText(["enter room", "enter", "connect"]);
        if (altClick) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        } else {
          await this.dumpPageState("no-entry-button");
          return;
        }
      }

      // Step 2: Click "Accept" on the avatar/name configuration screen
      await this.waitForButton(["accept"], 10);
      const clicked2 = await this.clickButtonByText(["accept"]);
      if (clicked2) {
        await this.updateStatus("logging_in", "Accepted avatar settings, waiting for entry screen...");
        await new Promise(resolve => setTimeout(resolve, 4000));
        await this.autoScreenshot("after-accept");
      }

      // Step 3: Click "Enter Room" to actually join the 3D space
      await this.waitForButton(["enter room"], 10);
      const clicked3 = await this.clickButtonByText(["enter room"]);
      if (clicked3) {
        await this.updateStatus("connected", "Entered the room!");
        await new Promise(resolve => setTimeout(resolve, 5000));
        await this.autoScreenshot("in-room");
      } else {
        const altEnter = await this.clickButtonByText([
          "enter on screen", "enter on device"
        ]);
        if (altEnter) {
          await this.updateStatus("connected", `Entered via: ${altEnter}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Step 4: Dismiss "Welcome to App" tour dialog if present
      await new Promise(resolve => setTimeout(resolve, 3000));
      const skippedTour = await this.clickButtonByText(["skip tour", "skip", "close", "got it", "dismiss"]);
      if (skippedTour) {
        await storage.addLog(`Dismissed tour dialog: "${skippedTour}"`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await this.updateStatus("connected", `Bot ready at: ${this.roomUrl}`, this.roomUrl);
      await this.dumpPageState("final-state");
      await storage.addLog("=== Room entry sequence complete ===");

      await this.startAutoNav();
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

  async sendChat(message: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    await storage.addLog(`Sending chat: "${message}"`);

    await this.page.evaluate(async (msg: string) => {
      const chatBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim().toLowerCase() === "chat"
      );
      if (chatBtn) chatBtn.click();
      await new Promise((r) => setTimeout(r, 500));

      const chatInput = document.querySelector(
        'input[type="text"][placeholder*="Send"], input[type="text"][placeholder*="message"], textarea, .chat-input input, input.TextInput__text-input__HqvuV'
      ) as HTMLInputElement | null;

      const allInputs = Array.from(document.querySelectorAll("input[type='text'], textarea")) as HTMLInputElement[];
      const input = chatInput || allInputs.find((i) => {
        const placeholder = (i.placeholder || "").toLowerCase();
        return placeholder.includes("message") || placeholder.includes("send") || placeholder.includes("chat");
      }) || allInputs[allInputs.length - 1];

      if (input) {
        input.focus();
        input.value = msg;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, msg);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        await new Promise((r) => setTimeout(r, 200));
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
        );
        input.dispatchEvent(
          new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
        );
        input.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
        );

        const form = input.closest("form");
        if (form) {
          form.dispatchEvent(new Event("submit", { bubbles: true }));
        }
      }
    }, message);
  }

  async startAutoNav(): Promise<void> {
    if (this.autoNavRunning) return;
    if (!this.page) throw new Error("Bot is not connected");
    this.autoNavRunning = true;
    await storage.addLog("Auto-navigation started - bot will explore and chat randomly");
    this.runAutoNavLoop();
  }

  async stopAutoNav(): Promise<void> {
    this.autoNavRunning = false;
    if (this.autoNavInterval) {
      clearTimeout(this.autoNavInterval);
      this.autoNavInterval = null;
    }
    await this.stopMovement();
    await storage.addLog("Auto-navigation stopped");
  }

  isAutoNavActive(): boolean {
    return this.autoNavRunning;
  }

  private async runAutoNavLoop(): Promise<void> {
    if (!this.autoNavRunning || !this.page) {
      this.autoNavRunning = false;
      return;
    }

    try {
      const action = Math.random();

      if (action < 0.5) {
        const directions = ["forward", "left", "right", "backward"];
        const weights = [0.45, 0.2, 0.2, 0.15];
        let r = Math.random();
        let dir = "forward";
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i];
          if (r <= 0) { dir = directions[i]; break; }
        }
        const duration = 800 + Math.floor(Math.random() * 2200);
        await this.move(dir, duration);
      } else if (action < 0.7) {
        const turnAmount = (Math.random() - 0.5) * 200;
        await this.look(turnAmount, (Math.random() - 0.5) * 30);
      } else if (action < 0.8) {
        await this.jump();
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.move("forward", 1000 + Math.floor(Math.random() * 1500));
      } else if (action < 0.88) {
        const msg = AUTO_NAV_MESSAGES[Math.floor(Math.random() * AUTO_NAV_MESSAGES.length)];
        await this.sendChat(msg);
      } else {
        await storage.addLog("Auto-nav: pausing briefly...");
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }
    } catch (err: any) {
      await storage.addLog(`Auto-nav action error: ${err.message}`);
    }

    if (this.autoNavRunning) {
      const delay = 1500 + Math.floor(Math.random() * 3500);
      this.autoNavInterval = setTimeout(() => this.runAutoNavLoop(), delay);
    }
  }

  async stop(preserveError = false): Promise<void> {
    await this.stopAutoNav().catch(() => {});
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
