import puppeteer, { type Browser, type Page } from "puppeteer-core";
import OpenAI from "openai";
import { storage } from "./storage";
import type { BotStatus } from "@shared/schema";
import { log } from "./index";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const HUBS_BASE_URL = "https://worlds.orangeweb3.com";
const BEDROCK_API_URL = "https://api.bedrockpassport.com/orange/v1";

const BOT_DISPLAY_NAMES: Record<string, string> = {
  bot1: "Atlas",
  bot2: "Nova",
  bot3: "Echo",
  bot4: "Spark",
};

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

const ENTRANCE_GREETINGS = [
  "Hey everyone! Just arrived, this place looks amazing!",
  "Hi all! Excited to be here!",
  "Hello! Just dropped in, what's going on?",
  "Hey! I'm here! What a cool space!",
  "Yo! Just joined, love the vibe in here!",
  "Hi there! Great to be in this world!",
  "Hello hello! Anyone around to chat?",
  "Hey! Just entered, this is awesome!",
];

const CONVERSATIONAL_RESPONSES: Record<string, string[]> = {
  greeting: [
    "Hey! How's it going?",
    "Hi there! Nice to meet you!",
    "Hello! Welcome to the space!",
    "Hey! Great to see someone here!",
    "What's up! Having a good time?",
  ],
  question: [
    "Good question! I'm just exploring around here.",
    "Hmm, not sure about that. I'm still learning my way around!",
    "That's interesting, let me think about it...",
    "I wish I knew! I'm just wandering around enjoying the scenery.",
  ],
  compliment: [
    "Thanks! You're too kind!",
    "Appreciate that! This place is pretty cool, right?",
    "Thank you! I love hanging out here.",
    "That's so nice of you to say!",
  ],
  farewell: [
    "See you later! It was nice chatting!",
    "Bye! Take care!",
    "Catch you around! Have a great day!",
    "Later! Come back soon!",
  ],
  agree: [
    "Totally agree!",
    "Yeah, for sure!",
    "Right? I think so too!",
    "Absolutely! You're spot on.",
    "100% agree with that!",
  ],
  general: [
    "That's cool! Tell me more.",
    "Interesting! I hadn't thought of it that way.",
    "Ha, nice one!",
    "Oh really? That's awesome!",
    "I hear you! This place is full of surprises.",
    "Yeah, this virtual world is something else!",
    "Haha, I know right?",
    "That's a great point!",
    "Oh wow, thanks for sharing!",
    "I'm loving the vibes here!",
  ],
};

function classifyMessage(msg: string): string {
  const lower = msg.toLowerCase().trim();
  const greetings = ["hi", "hello", "hey", "sup", "yo", "howdy", "greetings", "what's up", "whats up", "hola", "hii", "heya"];
  if (greetings.some(g => lower === g || lower.startsWith(g + " ") || lower.startsWith(g + "!"))) return "greeting";
  const farewells = ["bye", "goodbye", "see you", "later", "cya", "gtg", "gotta go", "leaving", "peace out"];
  if (farewells.some(f => lower.includes(f))) return "farewell";
  if (lower.includes("?") || lower.startsWith("what") || lower.startsWith("how") || lower.startsWith("why") || lower.startsWith("where") || lower.startsWith("when") || lower.startsWith("who") || lower.startsWith("do you") || lower.startsWith("can you") || lower.startsWith("are you")) return "question";
  const compliments = ["nice", "cool", "awesome", "great", "amazing", "love", "beautiful", "good job", "well done", "impressive", "fantastic"];
  if (compliments.some(c => lower.includes(c))) return "compliment";
  const agreements = ["yeah", "yes", "true", "right", "agree", "exactly", "same", "yep", "yup", "totally", "indeed", "for sure"];
  if (agreements.some(a => lower === a || lower.startsWith(a + " ") || lower.startsWith(a + "!"))) return "agree";
  return "general";
}

function getConversationalResponse(message: string): string {
  const category = classifyMessage(message);
  const responses = CONVERSATIONAL_RESPONSES[category] || CONVERSATIONAL_RESPONSES.general;
  return responses[Math.floor(Math.random() * responses.length)];
}

const BOT_SYSTEM_PROMPT = `You are a friendly, casual bot exploring a 3D virtual world called "Juice Town" on Mozilla Hubs. You're hanging out with other people and bots in this virtual space. Keep your responses short (1-2 sentences max), natural, and conversational — like texting a friend. Don't be overly enthusiastic or use too many exclamation marks. Feel free to ask follow-up questions, make observations about the virtual world, or just chat casually. Never mention that you're an AI or a language model.`;

async function getAIResponse(
  message: string,
  author: string,
  conversationHistory: { role: string; content: string }[],
  botName: string
): Promise<string> {
  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: `${BOT_SYSTEM_PROMPT}\nYour name in this world is "${botName}".` },
    ];

    for (const msg of conversationHistory.slice(-10)) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: `${author} says: "${message}"` });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 100,
      temperature: 0.9,
    });

    let reply = response.choices[0]?.message?.content?.trim() || "";
    if (botName && reply.toLowerCase().startsWith(botName.toLowerCase() + ":")) {
      reply = reply.slice(botName.length + 1).trim();
    }
    reply = reply.replace(/^["']|["']$/g, "").trim();
    if (reply && reply.length > 0 && reply.length < 200) {
      return reply;
    }
    return getConversationalResponse(message);
  } catch (err: any) {
    console.error(`AI response error: ${err.message}`);
    return getConversationalResponse(message);
  }
}

export interface BotCredentials {
  email: string;
  password: string;
  apiKey: string;
}

export class HubsBot {
  public readonly botId: string;
  private credentials: BotCredentials;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private authToken: string | null = null;
  private statusListeners: Set<(status: BotStatus) => void> = new Set();
  private starting: boolean = false;
  private lastScreenshot: string | null = null;
  private autoNavInterval: ReturnType<typeof setTimeout> | null = null;
  private autoNavRunning: boolean = false;
  private roomUrl: string = HUBS_BASE_URL;
  private chatMonitorInterval: ReturnType<typeof setTimeout> | null = null;
  private seenChatMessages: Set<string> = new Set();
  private lastChatResponseTime: number = 0;
  private botDisplayName: string = "";
  private otherBotNames: string[] = [];
  private conversationHistory: { role: string; content: string }[] = [];

  constructor(botId: string, credentials: BotCredentials) {
    this.botId = botId;
    this.credentials = credentials;
    this.botDisplayName = BOT_DISPLAY_NAMES[botId] || botId;
  }

  setOtherBotNames(names: string[]) {
    this.otherBotNames = names;
  }

  getDisplayName(): string {
    return this.botDisplayName;
  }

  async setDisplayName(name: string): Promise<void> {
    this.botDisplayName = name;
    if (this.page) {
      await this.page.evaluate((n: string) => {
        try {
          const store = JSON.parse(localStorage.getItem("___hubs_store") || "{}");
          if (!store.profile) store.profile = {};
          store.profile.displayName = n;
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch {}
        try {
          if ((window as any).APP && (window as any).APP.store) {
            (window as any).APP.store.update({ profile: { displayName: n } });
          }
        } catch {}
      }, name);
    }
    await storage.addLog(this.botId, `Display name changed to: "${name}"`);
  }

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
    await storage.setBotStatus(this.botId, botStatus);
    await storage.addLog(this.botId, message);
    log(message, `bot-${this.botId}`);
    for (const listener of this.statusListeners) {
      listener(botStatus);
    }
  }

  private async autoScreenshot(label: string): Promise<void> {
    if (!this.page) return;
    try {
      const screenshot = await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });
      this.lastScreenshot = `data:image/jpeg;base64,${screenshot}`;
      await storage.addLog(this.botId, `[screenshot taken: ${label}]`);
    } catch {}
  }

  async authenticate(): Promise<string> {
    const { email, password, apiKey } = this.credentials;

    if (!email || !password || !apiKey) {
      throw new Error("Missing bot credentials");
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
    await storage.addLog(this.botId, `Auth response keys: ${JSON.stringify(Object.keys(data))}`);
    
    if (data.token) {
      await storage.addLog(this.botId, `data.token type: ${typeof data.token}`);
      if (typeof data.token === "object") {
        await storage.addLog(this.botId, `data.token keys: ${JSON.stringify(Object.keys(data.token))}`);
        await storage.addLog(this.botId, `data.token preview: ${JSON.stringify(data.token).slice(0, 300)}`);
      }
    }
    if (data.user) {
      await storage.addLog(this.botId, `data.user type: ${typeof data.user}`);
      if (typeof data.user === "object") {
        await storage.addLog(this.botId, `data.user keys: ${JSON.stringify(Object.keys(data.user))}`);
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
      await storage.addLog(this.botId, `FULL auth response: ${JSON.stringify(data).slice(0, 500)}`);
      throw new Error("No string token found in auth response");
    }

    this.authToken = token;
    await storage.addLog(this.botId, `Token found (type=${typeof token}, length=${token.length}, prefix=${token.slice(0, 20)}...)`);
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
          storage.addLog(this.botId, `[browser] ${text}`);
        }
      });

      this.page.on("pageerror", (err) => {
        const msg = err?.message || String(err) || "unknown error";
        storage.addLog(this.botId, `[browser error] ${msg.slice(0, 200)}`);
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

      const email = this.credentials.email;
      const displayName = this.botDisplayName;
      await this.page.evaluate((token: string, botEmail: string, name: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          if (!store.profile) store.profile = {};
          store.profile.displayName = name;
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch (e) {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
            profile: { displayName: name },
          }));
        }
      }, this.authToken, email, displayName);

      await this.updateStatus("logging_in", `Auth token + display name "${displayName}" set in localStorage, reloading...`);

      const emailForReload = email;
      const tokenForReload = this.authToken;
      const nameForReload = displayName;
      await this.page.evaluateOnNewDocument((token: string, botEmail: string, name: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          if (!store.profile) store.profile = {};
          store.profile.displayName = name;
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
            profile: { displayName: name },
          }));
        }
      }, tokenForReload, emailForReload, nameForReload);

      await this.page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });

      await this.page.evaluate((token: string, botEmail: string, name: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          if (!store.profile) store.profile = {};
          store.profile.displayName = name;
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
            profile: { displayName: name },
          }));
        }
      }, tokenForReload, emailForReload, nameForReload);

      const tokenCheck = await this.page.evaluate(() => {
        try {
          const store = JSON.parse(localStorage.getItem("___hubs_store") || "{}");
          return {
            hasToken: !!store.credentials?.token,
            tokenLength: store.credentials?.token?.length || 0,
            credKeys: Object.keys(store.credentials || {}),
          };
        } catch { return { hasToken: false, tokenLength: 0, credKeys: [] }; }
      });
      await storage.addLog(this.botId, `Token check after reload: hasToken=${tokenCheck.hasToken}, length=${tokenCheck.tokenLength}, keys=${tokenCheck.credKeys.join(",")}`);

      if (!tokenCheck.hasToken) {
        await storage.addLog(this.botId, "Token was lost after reload, re-setting and reloading again...");
        await this.page.evaluate((token: string, botEmail: string) => {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
          }));
        }, tokenForReload, emailForReload);
        await this.page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
        await this.page.evaluate((token: string, botEmail: string) => {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
          }));
        }, tokenForReload, emailForReload);
      }

      await this.updateStatus("logging_in", "Waiting for Hubs UI to fully load...");
      await this.waitForLobbyUI();

      await this.autoScreenshot("after-login");

      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();
      await this.updateStatus("logging_in", `Page loaded: "${pageTitle}" at ${currentUrl}`, currentUrl);

      await this.dumpPageState("post-login");
      await this.selectRandomAvatar();
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

      await storage.addLog(this.botId,
        `Wait ${i + 1}/15: btns=${state.buttonCount}(${state.buttonTexts.slice(0, 5).join(", ")}) canvas=${state.hasCanvas} scene=${state.hasScene} divs=${state.allDivs} spans=${state.allSpans} bodyLen=${state.bodyLength} iframes=${state.iframes} shadowHosts=${state.shadowHosts}`
      );

      if (state.buttonTexts.some(t => {
        const lower = t.toLowerCase();
        return lower.includes("join") || lower.includes("enter") || lower.includes("room");
      })) {
        await storage.addLog(this.botId, "Found join/enter button! Proceeding...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      }

      if (state.hasScene && i >= 5) {
        await storage.addLog(this.botId, "Scene loaded, proceeding to check page state...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        return;
      }
    }

    await storage.addLog(this.botId, "Timed out waiting for lobby UI, proceeding anyway...");
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

    await storage.addLog(this.botId, `[${label}] URL: ${state.url}`);
    await storage.addLog(this.botId, `[${label}] Title: ${state.title}`);
    await storage.addLog(this.botId, `[${label}] Hubs store: ${state.storePreview}`);
    await storage.addLog(this.botId, `[${label}] Body text: ${state.bodyText.slice(0, 300)}`);
    await storage.addLog(this.botId, `[${label}] Root HTML: ${state.rootHtml.slice(0, 300)}`);
    await storage.addLog(this.botId, `[${label}] Found ${state.elements.length} interactive elements:`);
    for (const el of state.elements) {
      await storage.addLog(this.botId, `[${label}]   ${el}`);
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
    await storage.addLog(this.botId, `Waited ${maxWaitSecs}s but didn't find buttons: ${textPatterns.join(", ")}`);
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
      await storage.addLog(this.botId, `Clicked button with text: "${clicked}"`);
    }
    return clicked;
  }

  private async reInjectToken(): Promise<void> {
    if (!this.page || !this.authToken) return;
    const email = this.credentials.email;
    await this.page.evaluate((token: string, botEmail: string) => {
      try {
        const existingStore = localStorage.getItem("___hubs_store");
        const store = existingStore ? JSON.parse(existingStore) : {};
        store.credentials = { token, email: botEmail };
        localStorage.setItem("___hubs_store", JSON.stringify(store));
      } catch {
        localStorage.setItem("___hubs_store", JSON.stringify({
          credentials: { token, email: botEmail },
        }));
      }
    }, this.authToken, email);
  }

  private async handleSigninRedirect(): Promise<boolean> {
    if (!this.page) return false;
    const currentUrl = this.page.url();
    if (currentUrl.includes("/signin")) {
      await storage.addLog(this.botId, "Detected redirect to /signin — re-injecting token and navigating back...");
      await this.reInjectToken();

      const email = this.credentials.email;
      await this.page.evaluateOnNewDocument((token: string, botEmail: string) => {
        try {
          const existingStore = localStorage.getItem("___hubs_store");
          const store = existingStore ? JSON.parse(existingStore) : {};
          store.credentials = { token, email: botEmail };
          localStorage.setItem("___hubs_store", JSON.stringify(store));
        } catch {
          localStorage.setItem("___hubs_store", JSON.stringify({
            credentials: { token, email: botEmail },
          }));
        }
      }, this.authToken!, email);

      const targetUrl = this.roomUrl || HUBS_BASE_URL;
      await this.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      await this.reInjectToken();
      await this.waitForLobbyUI();
      return true;
    }
    return false;
  }

  private async selectRandomAvatar(): Promise<void> {
    if (!this.page) return;

    try {
      await storage.addLog(this.botId, "Fetching available avatars from Hubs API...");

      const avatarResult = await this.page.evaluate(async () => {
        try {
          const res = await fetch("/api/v1/media/search?source=avatar_listings&filter=featured");
          if (!res.ok) return { success: false, error: `API returned ${res.status}` };
          const data = await res.json();
          if (!data.entries || data.entries.length === 0) {
            return { success: false, error: "No avatars found" };
          }
          const avatars = data.entries.map((e: any) => ({
            id: e.id,
            name: e.name,
            url: e.url,
            gltfUrl: e.gltfs?.avatar,
          }));
          const chosen = avatars[Math.floor(Math.random() * avatars.length)];

          return {
            success: true,
            avatarId: chosen.id,
            avatarName: chosen.name,
            avatarUrl: chosen.url,
            gltfUrl: chosen.gltfUrl,
            totalAvatars: avatars.length,
          };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      });

      if (avatarResult.success) {
        await storage.addLog(this.botId, `Avatar selected: "${avatarResult.avatarName}" (${avatarResult.avatarId}) from ${avatarResult.totalAvatars} options`);
        await storage.addLog(this.botId, `Avatar gltf URL: ${avatarResult.gltfUrl}`);

        const gltfUrl = avatarResult.gltfUrl;
        const avatarId = avatarResult.avatarId;
        const customName = this.botDisplayName;

        await this.page.evaluate((gUrl: string, name: string) => {
          try {
            const store = JSON.parse(localStorage.getItem("___hubs_store") || "{}");
            if (!store.profile) store.profile = {};
            store.profile.avatarId = gUrl;
            store.profile.displayName = name;
            localStorage.setItem("___hubs_store", JSON.stringify(store));
          } catch {}

          try {
            if ((window as any).APP && (window as any).APP.store) {
              (window as any).APP.store.update({ profile: { avatarId: gUrl, displayName: name } });
            }
          } catch {}
        }, gltfUrl, customName);

        this.botDisplayName = customName;
        await storage.addLog(this.botId, `Display name set to: "${customName}"`);

        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.autoScreenshot("avatar-selected");
      } else {
        await storage.addLog(this.botId, `Avatar fetch failed: ${avatarResult.error}, using default`);
        const customName = this.botDisplayName;
        await this.page.evaluate((name: string) => {
          try {
            const store = JSON.parse(localStorage.getItem("___hubs_store") || "{}");
            if (!store.profile) store.profile = {};
            store.profile.displayName = name;
            localStorage.setItem("___hubs_store", JSON.stringify(store));
          } catch {}
          try {
            if ((window as any).APP && (window as any).APP.store) {
              (window as any).APP.store.update({ profile: { displayName: name } });
            }
          } catch {}
        }, customName);
        this.botDisplayName = customName;
        await storage.addLog(this.botId, `Display name set to: "${customName}"`);
      }
    } catch (err: any) {
      await storage.addLog(this.botId, `Avatar selection error: ${(err?.message || String(err))}`);
    }
  }

  private async tryEnterRoom(): Promise<void> {
    if (!this.page) return;

    try {
      await storage.addLog(this.botId, "=== Starting room entry sequence ===");

      // Step 1: Click "Join Room" on the lobby page
      const clicked1 = await this.clickButtonByText([
        "join room", "join"
      ]);

      if (clicked1) {
        await this.updateStatus("logging_in", "Clicked Join Room, waiting for avatar screen...");
        await new Promise(resolve => setTimeout(resolve, 4000));

        const redirected = await this.handleSigninRedirect();
        if (redirected) {
          const clicked1b = await this.clickButtonByText(["join room", "join"]);
          if (clicked1b) {
            await this.updateStatus("logging_in", "Clicked Join Room (retry), waiting for avatar screen...");
            await new Promise(resolve => setTimeout(resolve, 4000));
          }
        }

        await this.autoScreenshot("after-join");
      } else {
        await storage.addLog(this.botId, "No Join Room button found, checking for other entry points...");
        const altClick = await this.clickButtonByText(["enter room", "enter"]);
        if (altClick) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        } else {
          await this.dumpPageState("no-entry-button");
          return;
        }
      }

      // Check for signin redirect again after Join
      await this.handleSigninRedirect();

      // Step 2: Click "Accept" on the avatar/name configuration screen
      await this.waitForButton(["accept"], 15);
      const clicked2 = await this.clickButtonByText(["accept"]);
      if (clicked2) {
        await this.updateStatus("logging_in", "Accepted avatar settings, waiting for entry screen...");
        await new Promise(resolve => setTimeout(resolve, 4000));
        await this.autoScreenshot("after-accept");
      }

      // Step 3: Click "Enter Room" to actually join the 3D space
      await this.waitForButton(["enter room"], 15);
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
        await storage.addLog(this.botId, `Dismissed tour dialog: "${skippedTour}"`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await this.updateStatus("connected", `Bot ready at: ${this.roomUrl}`, this.roomUrl);
      await this.dumpPageState("final-state");
      await storage.addLog(this.botId, "=== Room entry sequence complete ===");

      await this.startAutoNav();

      const greeting = ENTRANCE_GREETINGS[Math.floor(Math.random() * ENTRANCE_GREETINGS.length)];
      await new Promise(r => setTimeout(r, 2000));
      this.sendChat(greeting).catch(e => storage.addLog(this.botId, `Entrance greeting error: ${e.message}`));
    } catch (err: any) {
      await storage.addLog(this.botId, `Room entry error: ${err.message}`);
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

    const email = this.credentials.email;
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

    await storage.addLog(this.botId, `Moving ${direction} for ${duration}ms`);
    await this.page.keyboard.down(key);
    await new Promise(resolve => setTimeout(resolve, duration));
    await this.page.keyboard.up(key);
  }

  async jump(): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await storage.addLog(this.botId, "Jumping!");
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
    await storage.addLog(this.botId, `Looked: deltaX=${deltaX}, deltaY=${deltaY}`);
  }

  private async stopMovement(): Promise<void> {
    if (!this.page) return;
    for (const key of ["w", "a", "s", "d"]) {
      await this.page.keyboard.up(key);
    }
    await storage.addLog(this.botId, "Stopped all movement");
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

    await storage.addLog(this.botId, `Sending chat: "${message}"`);

    try {
      const sent = await this.page.evaluate((msg: string) => {
        try {
          if ((window as any).APP?.hubChannel?.sendMessage) {
            (window as any).APP.hubChannel.sendMessage(msg);
            return "hubChannel";
          }
          if ((window as any).APP?.hubChannel?.channel) {
            (window as any).APP.hubChannel.channel.push("message", { body: msg, type: "chat" });
            return "channel.push";
          }
          const scene = document.querySelector("a-scene") as any;
          if (scene?.systems?.["hubs-systems"]?.chatSystem) {
            scene.systems["hubs-systems"].chatSystem.send(msg);
            return "chatSystem";
          }
          return null;
        } catch (e: any) {
          return `error:${e.message}`;
        }
      }, message);

      if (sent && !sent.startsWith("error:")) {
        await storage.addLog(this.botId, `Chat sent via ${sent}: "${message}"`);
        return;
      }

      if (sent?.startsWith("error:")) {
        await storage.addLog(this.botId, `API chat error: ${sent}, falling back to UI...`);
      } else {
        await storage.addLog(this.botId, `No chat API found, falling back to UI...`);
      }

      await this.sendChatViaUI(message);
    } catch (err: any) {
      await storage.addLog(this.botId, `sendChat error: ${err.message}`);
    }
  }

  private async sendChatViaUI(message: string): Promise<void> {
    if (!this.page) return;

    for (let attempt = 0; attempt < 3; attempt++) {
      const hasChatSidebar = await this.page.evaluate(() => {
        return !!document.querySelector('[class*="ChatSidebar"], [class*="chat-sidebar"]');
      });

      if (!hasChatSidebar) {
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const chatBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "chat");
          if (chatBtn) chatBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      }

      const inputInfo = await this.page.evaluate(() => {
        const selectors = [
          'input[placeholder*="Send"]', 'input[placeholder*="send"]',
          'input[placeholder*="message"]', 'input[placeholder*="Message"]',
          'input[placeholder*="chat"]', 'input[placeholder*="Chat"]',
          'textarea[placeholder*="Send"]', 'textarea[placeholder*="message"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return { found: true, selector: sel, tag: el.tagName };
        }
        const sidebar = document.querySelector('[class*="ChatSidebar"]');
        if (sidebar) {
          const inputs = sidebar.querySelectorAll("input, textarea");
          if (inputs.length > 0) return { found: true, selector: "sidebar-input", tag: inputs[0].tagName };
        }
        return { found: false, selector: "", tag: "" };
      });

      await storage.addLog(this.botId, `UI chat attempt ${attempt + 1}: input=${JSON.stringify(inputInfo)}`);

      if (inputInfo.found) {
        try {
          let inputHandle;
          if (inputInfo.selector === "sidebar-input") {
            const sidebar = await this.page.$('[class*="ChatSidebar"]');
            if (sidebar) {
              const inputs = await sidebar.$$("input, textarea");
              inputHandle = inputs.length > 0 ? inputs[0] : null;
            }
          } else {
            inputHandle = await this.page.$(inputInfo.selector);
          }
          if (inputHandle) {
            await inputHandle.click();
            await new Promise(r => setTimeout(r, 100));
            await inputHandle.evaluate((el: any) => { el.value = ""; });
            await this.page.evaluate((sel: string, msg: string) => {
              const el = document.querySelector(sel) as HTMLInputElement;
              if (el) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, 'value'
                )?.set;
                if (nativeInputValueSetter) nativeInputValueSetter.call(el, msg);
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }, inputInfo.selector !== "sidebar-input" ? inputInfo.selector : "input", message);
            await new Promise(r => setTimeout(r, 100));
            await this.page.keyboard.press("Enter");
            await storage.addLog(this.botId, `Chat sent via UI: "${message}"`);
            return;
          }
        } catch (e: any) {
          await storage.addLog(this.botId, `UI input interaction failed: ${e.message}`);
        }
      }

      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const chatBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "chat");
        if (chatBtn) chatBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const chatBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "chat");
        if (chatBtn) chatBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500));
    }

    await storage.addLog(this.botId, "Chat input not found after 3 UI attempts");
    await this.dumpPageState("chat-input-search");
  }

  private async readChatMessages(): Promise<{ author: string; text: string; key: string }[]> {
    if (!this.page) return [];
    try {
      const messages = await this.page.evaluate(() => {
        const results: { author: string; text: string; key: string }[] = [];

        const presenceLog = document.querySelector('[class*="presence-log"]');
        if (presenceLog) {
          const buttons = presenceLog.querySelectorAll('button[class*="spawn-message"]');
          buttons.forEach((btn) => {
            const wrapper = btn.closest('div, li, span') || btn.parentElement;
            if (!wrapper) return;
            const text = (wrapper.textContent || "").trim();
            if (text && text.includes(":")) {
              const colonIdx = text.indexOf(":");
              const author = text.slice(0, colonIdx).trim();
              const msg = text.slice(colonIdx + 1).trim();
              if (author && msg && msg.length > 0) {
                results.push({ author, text: msg, key: `${author}:${msg}` });
              }
            }
          });

          if (results.length === 0) {
            const fullText = (presenceLog.textContent || "").trim();
            if (fullText.includes(":")) {
              const pattern = /([^:]+):([^:]*?)(?=\S+:|$)/g;
              const segments = fullText.split(/(?=[A-Z][a-z]+-[A-Z][a-z]+-\d+:)/);
              for (const segment of segments) {
                const colonIdx = segment.indexOf(":");
                if (colonIdx > 0) {
                  const author = segment.slice(0, colonIdx).trim();
                  const msg = segment.slice(colonIdx + 1).trim();
                  if (author && msg && msg.length > 0 && author.length < 50) {
                    results.push({ author, text: msg, key: `${author}:${msg}` });
                  }
                }
              }
            }
          }
        }

        const chatSidebar = document.querySelector('[class*="ChatSidebar"], [class*="chat-sidebar"]');
        if (chatSidebar) {
          const entries = chatSidebar.querySelectorAll('[class*="message-group"], [class*="MessageGroup"], li, [class*="message-bubble"], [class*="MessageBubble"]');
          entries.forEach((el) => {
            const text = (el.textContent || "").trim();
            if (text && text.includes(":") && text.length > 2 && text.length < 500) {
              const colonIdx = text.indexOf(":");
              const author = text.slice(0, colonIdx).trim();
              const msg = text.slice(colonIdx + 1).trim();
              if (author && msg && author.length < 50) {
                const key = `${author}:${msg}`;
                if (!results.some(r => r.key === key)) {
                  results.push({ author, text: msg, key });
                }
              }
            }
          });
        }

        return results;
      });
      return messages;
    } catch {
      return [];
    }
  }

  private async startChatMonitor(): Promise<void> {
    if (this.chatMonitorInterval) return;

    this.botDisplayName = await this.getBotDisplayName();
    await storage.addLog(this.botId, `Chat monitor started (bot name: "${this.botDisplayName}")`);

    const initialMessages = await this.readChatMessages();
    for (const msg of initialMessages) {
      const isOwnMessage = this.botDisplayName && msg.author.toLowerCase().includes(this.botDisplayName.toLowerCase());
      const isSystemMessage = msg.text.includes("entered the room") || msg.text.includes("joined") || msg.text.includes("left the room");
      if (isOwnMessage || isSystemMessage) {
        this.seenChatMessages.add(msg.key);
      }
    }
    await storage.addLog(this.botId, `Chat monitor initialized: ${initialMessages.length} existing messages, ${this.seenChatMessages.size} marked as own/system`);

    this.runChatMonitorLoop();
  }

  private async stopChatMonitor(): Promise<void> {
    if (this.chatMonitorInterval) {
      clearTimeout(this.chatMonitorInterval);
      this.chatMonitorInterval = null;
    }
  }

  private async getBotDisplayName(): Promise<string> {
    if (!this.page) return "";
    try {
      const name = await this.page.evaluate(() => {
        try {
          const store = JSON.parse(localStorage.getItem("___hubs_store") || "{}");
          return store.profile?.displayName || "";
        } catch { return ""; }
      });
      return name;
    } catch { return ""; }
  }

  private async ensureChatOpen(): Promise<void> {
    if (!this.page) return;
    try {
      const hasChatSidebar = await this.page.evaluate(() => {
        return !!document.querySelector('[class*="ChatSidebar"], [class*="chat-sidebar"]');
      });
      if (!hasChatSidebar) {
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const chatBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "chat");
          if (chatBtn) chatBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        const nowOpen = await this.page.evaluate(() => {
          return !!document.querySelector('[class*="ChatSidebar"], [class*="chat-sidebar"]');
        });
        if (!nowOpen) {
          await this.page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const chatBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "chat");
            if (chatBtn) chatBtn.click();
          });
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    } catch {}
  }

  private async runChatMonitorLoop(): Promise<void> {
    if (!this.autoNavRunning || !this.page) return;

    try {
      const messages = await this.readChatMessages();
      const newMessages = messages.filter(m => !this.seenChatMessages.has(m.key));

      for (const msg of newMessages) {
        this.seenChatMessages.add(msg.key);

        if (this.botDisplayName && msg.author.toLowerCase().includes(this.botDisplayName.toLowerCase())) {
          continue;
        }
        if (msg.text.length < 2) continue;

        const isFromOtherBot = this.otherBotNames.some(name => 
          name && msg.author.toLowerCase().includes(name.toLowerCase())
        );

        const timeSinceLastResponse = Date.now() - this.lastChatResponseTime;
        const minDelay = isFromOtherBot ? 10000 : 6000;
        if (timeSinceLastResponse < minDelay) continue;

        if (isFromOtherBot && Math.random() < 0.15) continue;

        await storage.addLog(this.botId, `Chat received from "${msg.author}": "${msg.text}"`);

        const replyDelay = isFromOtherBot 
          ? 4000 + Math.floor(Math.random() * 6000)
          : 3000 + Math.floor(Math.random() * 4000);
        await new Promise(resolve => setTimeout(resolve, replyDelay));

        const response = await getAIResponse(msg.text, msg.author, this.conversationHistory, this.botDisplayName);
        this.conversationHistory.push({ role: "user", content: `${msg.author}: ${msg.text}` });
        this.conversationHistory.push({ role: "assistant", content: response });
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }
        await this.sendChat(response);
        this.lastChatResponseTime = Date.now();
      }

      if (this.seenChatMessages.size > 200) {
        const entries = Array.from(this.seenChatMessages);
        this.seenChatMessages = new Set(entries.slice(-100));
      }
    } catch (err: any) {
      await storage.addLog(this.botId, `Chat monitor error: ${err.message}`);
    }

    if (this.autoNavRunning) {
      this.chatMonitorInterval = setTimeout(() => this.runChatMonitorLoop(), 4000);
    }
  }

  async startAutoNav(): Promise<void> {
    if (this.autoNavRunning) return;
    if (!this.page) throw new Error("Bot is not connected");
    this.autoNavRunning = true;
    await storage.addLog(this.botId, "Auto-navigation started - bot will explore, chat, and respond to conversations");
    this.runAutoNavLoop();
    this.startChatMonitor();
  }

  async stopAutoNav(): Promise<void> {
    this.autoNavRunning = false;
    if (this.autoNavInterval) {
      clearTimeout(this.autoNavInterval);
      this.autoNavInterval = null;
    }
    await this.stopChatMonitor();
    await this.stopMovement();
    await storage.addLog(this.botId, "Auto-navigation stopped");
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
      } else if (action < 0.78) {
        await this.jump();
        await new Promise(resolve => setTimeout(resolve, 400));
        await this.move("forward", 800 + Math.floor(Math.random() * 1000));
      } else if (action < 0.86) {
        const msg = AUTO_NAV_MESSAGES[Math.floor(Math.random() * AUTO_NAV_MESSAGES.length)];
        await this.sendChat(msg);
      } else {
        await storage.addLog(this.botId, "Auto-nav: pausing briefly...");
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }
    } catch (err: any) {
      await storage.addLog(this.botId, `Auto-nav action error: ${err.message}`);
    }

    if (this.autoNavRunning) {
      const delay = 2000 + Math.floor(Math.random() * 3000);
      this.autoNavInterval = setTimeout(() => this.runAutoNavLoop(), delay);
    }
  }

  async stop(preserveError = false): Promise<void> {
    await this.stopAutoNav().catch(() => {});
    await this.stopChatMonitor().catch(() => {});
    await this.stopMovement().catch(() => {});
    this.seenChatMessages.clear();
    this.conversationHistory = [];
    if (this.page) {
      try {
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const leaveBtn = btns.find(b => (b.textContent || "").trim().toLowerCase() === "leave");
          if (leaveBtn) leaveBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const confirmBtn = btns.find(b => {
            const t = (b.textContent || "").trim().toLowerCase();
            return t === "leave room" || t === "leave" || t === "yes" || t === "confirm";
          });
          if (confirmBtn) confirmBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));
      } catch {}
    }
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

export class BotManager {
  private bots: Map<string, HubsBot> = new Map();

  createBot(botId: string, credentials: BotCredentials): HubsBot {
    if (this.bots.has(botId)) return this.bots.get(botId)!;
    const bot = new HubsBot(botId, credentials);
    this.bots.set(botId, bot);
    return bot;
  }

  getBot(botId: string): HubsBot | undefined {
    return this.bots.get(botId);
  }

  getAllBots(): Map<string, HubsBot> {
    return this.bots;
  }

  async startAll(roomUrl?: string): Promise<void> {
    const bots = Array.from(this.bots.values()).filter(b => !b.isRunning());
    const startPromises = bots.map((bot, index) => {
      return new Promise<void>(async (resolve) => {
        await new Promise(r => setTimeout(r, index * 5000));
        try {
          await bot.start(roomUrl);
        } catch (err) {
          console.error(`Failed to start ${bot.botId}:`, err);
        }
        resolve();
      });
    });
    await Promise.all(startPromises);
    this.updateBotNames();
  }

  updateBotNames(): void {
    const bots = Array.from(this.bots.values());
    for (const bot of bots) {
      const otherNames = bots
        .filter(b => b.botId !== bot.botId)
        .map(b => b.getDisplayName())
        .filter(n => n);
      bot.setOtherBotNames(otherNames);
    }
  }

  async stopAll(): Promise<void> {
    for (const bot of this.bots.values()) {
      if (bot.isRunning()) {
        await bot.stop();
      }
    }
  }
}

export const botManager = new BotManager();
