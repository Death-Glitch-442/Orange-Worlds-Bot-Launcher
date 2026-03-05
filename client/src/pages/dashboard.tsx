import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { BotStatus } from "@shared/schema";
import {
  Play,
  Square,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Camera,
  RotateCcw,
  RotateCw,
  ChevronUp,
  ChevronDown,
  Zap,
  Terminal,
  Radio,
  Globe,
  DoorOpen,
  MoveUp,
  Navigation,
  MessageSquare,
  Send,
  Bot,
  PlayCircle,
  StopCircle,
} from "lucide-react";

function StatusBadge({ status }: { status: BotStatus["status"] }) {
  const variants: Record<string, string> = {
    idle: "bg-zinc-700/60 text-zinc-300 border-zinc-600",
    authenticating: "bg-amber-900/40 text-amber-300 border-amber-700",
    launching: "bg-blue-900/40 text-blue-300 border-blue-700",
    logging_in: "bg-purple-900/40 text-purple-300 border-purple-700",
    connected: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    navigating: "bg-cyan-900/40 text-cyan-300 border-cyan-700",
    error: "bg-red-900/40 text-red-300 border-red-700",
    disconnected: "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${variants[status] || variants.idle}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === "connected" ? "bg-emerald-400 animate-pulse" :
        status === "error" ? "bg-red-400" :
        ["authenticating", "launching", "logging_in", "navigating"].includes(status) ? "bg-amber-400 animate-pulse" :
        "bg-zinc-500"
      }`} />
      {status.replace("_", " ")}
    </span>
  );
}

interface BotState {
  status: BotStatus | null;
  logs: string[];
  screenshot: string | null;
  autoNav: boolean;
  displayName: string;
}

function BotPanel({ botId, label, state, roomUrl }: {
  botId: string;
  label: string;
  state: BotState;
  roomUrl: string;
}) {
  const [chatMessage, setChatMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(state.screenshot);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  const isRunning = state.status?.status !== "idle" && state.status?.status !== "error" && state.status?.status !== "disconnected" && state.status !== null;
  const isConnected = state.status?.status === "connected";

  const startBot = async () => {
    setStarting(true);
    await fetch(`/api/bots/${botId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomUrl }),
    });
    setStarting(false);
  };

  const stopBot = async () => {
    await fetch(`/api/bots/${botId}/stop`, { method: "POST" });
  };

  const toggleAutoNav = async () => {
    await fetch(`/api/bots/${botId}/auto-nav`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !state.autoNav }),
    });
  };

  const takeScreenshot = async () => {
    const res = await fetch(`/api/bots/${botId}/screenshot`);
    const data = await res.json();
    if (data.screenshot) setScreenshot(data.screenshot);
  };

  const sendChat = async () => {
    if (!chatMessage.trim()) return;
    await fetch(`/api/bots/${botId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatMessage.trim() }),
    });
    setChatMessage("");
  };

  const moveBot = (direction: string) => {
    fetch(`/api/bots/${botId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, duration: 500 }),
    });
  };

  const jumpBot = () => {
    fetch(`/api/bots/${botId}/jump`, { method: "POST" });
  };

  const lookBot = (deltaX: number, deltaY: number) => {
    fetch(`/api/bots/${botId}/look`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltaX, deltaY }),
    });
  };

  const colorSchemes: Record<string, { accent: string; gradient: string; border: string }> = {
    bot1: { accent: "violet", gradient: "from-violet-500 to-fuchsia-600", border: "border-violet-800/40" },
    bot2: { accent: "cyan", gradient: "from-cyan-500 to-blue-600", border: "border-cyan-800/40" },
    bot3: { accent: "emerald", gradient: "from-emerald-500 to-teal-600", border: "border-emerald-800/40" },
    bot4: { accent: "amber", gradient: "from-amber-500 to-orange-600", border: "border-amber-800/40" },
  };
  const colorScheme = colorSchemes[botId] || colorSchemes.bot1;

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between p-3 rounded-lg bg-[#0e0e16] border ${colorScheme.border}`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${colorScheme.gradient} flex items-center justify-center`}>
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid={`text-bot-label-${botId}`}>{label}</p>
            <p className="text-[10px] text-zinc-500">{state.displayName || "Not connected"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <Button
              data-testid={`button-auto-nav-${botId}`}
              onClick={toggleAutoNav}
              variant="outline"
              size="sm"
              className={`text-xs h-7 ${state.autoNav
                ? "border-emerald-700 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300"
                : "border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-400"
              }`}
            >
              <Navigation className={`w-3 h-3 mr-1 ${state.autoNav ? "animate-pulse" : ""}`} />
              {state.autoNav ? "Nav ON" : "Nav OFF"}
            </Button>
          )}
          {state.status && <StatusBadge status={state.status.status} />}
        </div>
      </div>

      <div className="flex gap-2">
        {!isRunning ? (
          <Button
            data-testid={`button-start-${botId}`}
            onClick={startBot}
            disabled={starting}
            size="sm"
            className={`bg-gradient-to-r ${colorScheme.gradient} hover:opacity-90 border-0 text-white text-xs`}
          >
            <Play className="w-3 h-3 mr-1" />
            {starting ? "Starting..." : "Launch"}
          </Button>
        ) : (
          <Button
            data-testid={`button-stop-${botId}`}
            onClick={stopBot}
            variant="outline"
            size="sm"
            className="border-red-800/60 bg-red-950/30 hover:bg-red-900/40 text-red-300 text-xs"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop
          </Button>
        )}
      </div>

      <Card className="bg-[#0e0e16] border-zinc-800/40">
        <CardHeader className="pb-2 pt-3 px-3 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <Camera className="w-3 h-3" />
            View
          </CardTitle>
          <Button
            data-testid={`button-screenshot-${botId}`}
            onClick={takeScreenshot}
            disabled={!isConnected}
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 text-[10px] h-6 px-2 disabled:opacity-30"
          >
            <Camera className="w-2.5 h-2.5 mr-1" />
            Capture
          </Button>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="aspect-video bg-zinc-950 rounded-md border border-zinc-800/40 overflow-hidden flex items-center justify-center">
            {screenshot ? (
              <img
                data-testid={`img-screenshot-${botId}`}
                src={screenshot}
                alt={`${label} screenshot`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-zinc-600">
                <Camera className="w-6 h-6 mx-auto mb-1 opacity-30" />
                <p className="text-[10px]">
                  {isConnected ? "Click Capture" : "Not connected"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isConnected && (
        <Card className="bg-[#0e0e16] border-zinc-800/40">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-zinc-500 mb-1.5">Move</p>
                <div className="flex flex-col items-center gap-1">
                  <Button onClick={() => moveBot("forward")} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <div className="flex gap-1">
                    <Button onClick={() => moveBot("left")} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => moveBot("backward")} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => moveBot("right")} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Button onClick={jumpBot} variant="outline" size="sm" className="w-full text-[10px] h-6 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                    <MoveUp className="w-3 h-3 mr-1" />
                    Jump
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 mb-1.5">Look</p>
                <div className="flex flex-col items-center gap-1">
                  <Button onClick={() => lookBot(0, -50)} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <div className="flex gap-1">
                    <Button onClick={() => lookBot(-80, 0)} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => lookBot(80, 0)} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                      <RotateCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Button onClick={() => lookBot(0, 50)} variant="outline" size="icon" className="w-8 h-8 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#0e0e16] border-zinc-800/40">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" />
            Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex gap-1.5">
            <Input
              data-testid={`input-chat-${botId}`}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
              placeholder="Message..."
              disabled={!isConnected}
              className="bg-zinc-900/60 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600 text-xs h-8 disabled:opacity-30"
            />
            <Button
              data-testid={`button-send-chat-${botId}`}
              onClick={sendChat}
              disabled={!isConnected || !chatMessage.trim()}
              size="icon"
              className={`bg-gradient-to-r ${colorScheme.gradient} hover:opacity-90 border-0 text-white shrink-0 w-8 h-8 disabled:opacity-30`}
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0e0e16] border-zinc-800/40">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            Log
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="h-40 rounded-md bg-zinc-950 border border-zinc-800/30 p-2 overflow-y-auto">
            <div className="space-y-0.5 font-mono text-[10px]">
              {state.logs.length === 0 ? (
                <p className="text-zinc-600">No activity...</p>
              ) : (
                state.logs.map((log, i) => (
                  <p
                    key={i}
                    data-testid={`text-log-${botId}-${i}`}
                    className={`leading-relaxed ${
                      log.includes("error") || log.includes("Error") || log.includes("failed")
                        ? "text-red-400"
                        : log.includes("success") || log.includes("Success") || log.includes("Connected") || log.includes("Entered")
                        ? "text-emerald-400"
                        : log.includes("Chat") || log.includes("chat")
                        ? "text-amber-400"
                        : log.includes("Auto-nav") || log.includes("Auto-navigation")
                        ? "text-violet-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {log}
                  </p>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [roomUrl, setRoomUrl] = useState("https://worlds.orangeweb3.com");
  const [botStates, setBotStates] = useState<Record<string, BotState>>({
    bot1: { status: null, logs: [], screenshot: null, autoNav: false, displayName: "" },
    bot2: { status: null, logs: [], screenshot: null, autoNav: false, displayName: "" },
    bot3: { status: null, logs: [], screenshot: null, autoNav: false, displayName: "" },
    bot4: { status: null, logs: [], screenshot: null, autoNav: false, displayName: "" },
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch("/api/bots").then(r => r.json()).then((data: Record<string, any>) => {
      setBotStates(prev => {
        const next = { ...prev };
        for (const [botId, info] of Object.entries(data)) {
          next[botId] = {
            ...next[botId],
            status: info.status,
            autoNav: info.autoNav,
            displayName: info.displayName || "",
          };
        }
        return next;
      });
    }).catch(() => {});

    for (const botId of ["bot1", "bot2", "bot3", "bot4"]) {
      fetch(`/api/bots/${botId}/logs`).then(r => r.json()).then((logs: string[]) => {
        setBotStates(prev => ({
          ...prev,
          [botId]: { ...prev[botId], logs },
        }));
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "status" && msg.botId) {
          setBotStates(prev => ({
            ...prev,
            [msg.botId]: {
              ...(prev[msg.botId] || { logs: [], screenshot: null, autoNav: false, displayName: "" }),
              status: msg.data,
            },
          }));
        }
      } catch {}
    };

    ws.onclose = () => {
      setTimeout(() => window.location.reload(), 5000);
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      for (const botId of ["bot1", "bot2", "bot3", "bot4"]) {
        fetch(`/api/bots/${botId}/logs`).then(r => r.json()).then((logs: string[]) => {
          setBotStates(prev => ({
            ...prev,
            [botId]: { ...prev[botId], logs },
          }));
        }).catch(() => {});
      }

      fetch("/api/bots").then(r => r.json()).then((data: Record<string, any>) => {
        setBotStates(prev => {
          const next = { ...prev };
          for (const [botId, info] of Object.entries(data)) {
            if (next[botId]) {
              next[botId] = {
                ...next[botId],
                autoNav: info.autoNav,
                displayName: info.displayName || "",
              };
            }
          }
          return next;
        });
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const startAllBots = async () => {
    await fetch("/api/bots/start-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomUrl }),
    });
  };

  const stopAllBots = async () => {
    await fetch("/api/bots/stop-all", { method: "POST" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-[#0e0e16]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-title">Hubs Navigator</h1>
              <p className="text-xs text-zinc-500">Multi-Bot Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="button-start-all"
              onClick={startAllBots}
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 text-white text-xs"
            >
              <PlayCircle className="w-3.5 h-3.5 mr-1" />
              Start All
            </Button>
            <Button
              data-testid="button-stop-all"
              onClick={stopAllBots}
              variant="outline"
              size="sm"
              className="border-red-800/60 bg-red-950/30 hover:bg-red-900/40 text-red-300 text-xs"
            >
              <StopCircle className="w-3.5 h-3.5 mr-1" />
              Stop All
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <Card className="bg-[#12121c] border-zinc-800/60">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-zinc-500 shrink-0" />
              <Input
                data-testid="input-room-url"
                value={roomUrl}
                onChange={(e) => setRoomUrl(e.target.value)}
                placeholder="https://worlds.orangeweb3.com/ABC123/room-name"
                className="bg-zinc-900/60 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { id: "bot1", name: "Atlas" },
            { id: "bot2", name: "Nova" },
            { id: "bot3", name: "Echo" },
            { id: "bot4", name: "Spark" },
          ].map(({ id, name }) => (
            <BotPanel
              key={id}
              botId={id}
              label={name}
              state={botStates[id]}
              roomUrl={roomUrl}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
