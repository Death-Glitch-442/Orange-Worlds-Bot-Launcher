import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      data-testid="badge-status"
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

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [roomUrl, setRoomUrl] = useState("https://worlds.orangeweb3.com");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [autoNav, setAutoNav] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "status") {
          setStatus(msg.data);
        } else if (msg.type === "log") {
          setLogs((prev) => [...prev.slice(-199), msg.data]);
        }
      } catch {
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    };

    return () => ws.close();
  }, []);

  const { data: initialStatus } = useQuery<BotStatus>({
    queryKey: ["/api/bot/status"],
    queryFn: () => fetch("/api/bot/status").then((r) => r.json()),
  });

  const { data: initialLogs } = useQuery<string[]>({
    queryKey: ["/api/bot/logs"],
    queryFn: () => fetch("/api/bot/logs").then((r) => r.json()),
  });

  const { data: autoNavStatus } = useQuery<{ autoNav: boolean }>({
    queryKey: ["/api/bot/auto-nav"],
    queryFn: () => fetch("/api/bot/auto-nav").then((r) => r.json()),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (autoNavStatus) setAutoNav(autoNavStatus.autoNav);
  }, [autoNavStatus]);

  useEffect(() => {
    if (initialStatus && !status) setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (initialLogs && logs.length === 0) setLogs(initialLogs);
  }, [initialLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const startBot = useMutation({
    mutationFn: () =>
      fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomUrl }),
      }).then((r) => r.json()),
  });

  const stopBot = useMutation({
    mutationFn: () => fetch("/api/bot/stop", { method: "POST" }).then((r) => r.json()),
  });

  const moveBot = useCallback((direction: string, duration = 500) => {
    fetch("/api/bot/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, duration }),
    });
  }, []);

  const jumpBot = useCallback(() => {
    fetch("/api/bot/jump", { method: "POST" });
  }, []);

  const lookBot = useCallback((deltaX: number, deltaY: number) => {
    fetch("/api/bot/look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltaX, deltaY }),
    });
  }, []);

  const takeScreenshot = useCallback(async () => {
    const res = await fetch("/api/bot/screenshot");
    const data = await res.json();
    if (data.screenshot) setScreenshot(data.screenshot);
  }, []);

  const enterRoom = useCallback(() => {
    fetch("/api/bot/enter-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomUrl }),
    });
  }, [roomUrl]);

  const toggleAutoNav = useCallback(async () => {
    const newState = !autoNav;
    setAutoNav(newState);
    await fetch("/api/bot/auto-nav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newState }),
    });
  }, [autoNav]);

  const sendChat = useCallback(async () => {
    if (!chatMessage.trim()) return;
    await fetch("/api/bot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatMessage.trim() }),
    });
    setChatMessage("");
  }, [chatMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      const map: Record<string, string> = { w: "forward", s: "backward", a: "left", d: "right" };
      if (map[e.key]) {
        e.preventDefault();
        moveBot(map[e.key], 300);
      }
      if (e.key === " ") {
        e.preventDefault();
        jumpBot();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveBot, jumpBot]);

  const isRunning = status?.status !== "idle" && status?.status !== "error" && status?.status !== "disconnected";
  const isConnected = status?.status === "connected";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-[#0e0e16]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-title">Hubs Navigator</h1>
              <p className="text-xs text-zinc-500">Bot Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <Button
                data-testid="button-auto-nav"
                onClick={toggleAutoNav}
                variant="outline"
                size="sm"
                className={autoNav
                  ? "border-emerald-700 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-400"
                }
              >
                <Navigation className={`w-3.5 h-3.5 mr-1.5 ${autoNav ? "animate-pulse" : ""}`} />
                {autoNav ? "Auto-Nav ON" : "Auto-Nav OFF"}
              </Button>
            )}
            {status && <StatusBadge status={status.status} />}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card className="bg-[#12121c] border-zinc-800/60">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center gap-2">
                <Globe className="w-4 h-4 text-zinc-500 shrink-0" />
                <Input
                  data-testid="input-room-url"
                  value={roomUrl}
                  onChange={(e) => setRoomUrl(e.target.value)}
                  placeholder="https://worlds.orangeweb3.com/ABC123/room-name"
                  className="bg-zinc-900/60 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
                />
              </div>
              <div className="flex gap-2">
                {!isRunning ? (
                  <Button
                    data-testid="button-start"
                    onClick={() => startBot.mutate()}
                    disabled={startBot.isPending}
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 text-white shadow-lg shadow-violet-900/30"
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    {startBot.isPending ? "Starting..." : "Launch Bot"}
                  </Button>
                ) : (
                  <>
                    <Button
                      data-testid="button-enter-room"
                      onClick={enterRoom}
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-300"
                    >
                      <DoorOpen className="w-4 h-4 mr-1.5" />
                      Enter Room
                    </Button>
                    <Button
                      data-testid="button-stop"
                      onClick={() => stopBot.mutate()}
                      variant="outline"
                      className="border-red-800/60 bg-red-950/30 hover:bg-red-900/40 text-red-300"
                    >
                      <Square className="w-4 h-4 mr-1.5" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </div>
            {status?.message && (
              <p className="mt-3 text-xs text-zinc-500" data-testid="text-status-message">
                {status.message}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Movement Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-1.5">
                  <Button
                    data-testid="button-move-forward"
                    onClick={() => moveBot("forward")}
                    disabled={!isConnected}
                    variant="outline"
                    size="icon"
                    className="w-12 h-12 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                  <div className="flex gap-1.5">
                    <Button
                      data-testid="button-move-left"
                      onClick={() => moveBot("left")}
                      disabled={!isConnected}
                      variant="outline"
                      size="icon"
                      className="w-12 h-12 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <Button
                      data-testid="button-move-backward"
                      onClick={() => moveBot("backward")}
                      disabled={!isConnected}
                      variant="outline"
                      size="icon"
                      className="w-12 h-12 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                    >
                      <ArrowDown className="w-5 h-5" />
                    </Button>
                    <Button
                      data-testid="button-move-right"
                      onClick={() => moveBot("right")}
                      disabled={!isConnected}
                      variant="outline"
                      size="icon"
                      className="w-12 h-12 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                  <Button
                    data-testid="button-jump"
                    onClick={jumpBot}
                    disabled={!isConnected}
                    variant="outline"
                    className="w-full mt-1 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                  >
                    <MoveUp className="w-4 h-4 mr-1.5" />
                    Jump
                  </Button>
                </div>

                <Separator className="bg-zinc-800" />

                <div>
                  <p className="text-xs text-zinc-500 mb-2">Camera Look</p>
                  <div className="flex flex-col items-center gap-1.5">
                    <Button
                      data-testid="button-look-up"
                      onClick={() => lookBot(0, -50)}
                      disabled={!isConnected}
                      variant="outline"
                      size="icon"
                      className="w-10 h-10 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <div className="flex gap-1.5">
                      <Button
                        data-testid="button-look-left"
                        onClick={() => lookBot(-80, 0)}
                        disabled={!isConnected}
                        variant="outline"
                        size="icon"
                        className="w-10 h-10 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        data-testid="button-look-right"
                        onClick={() => lookBot(80, 0)}
                        disabled={!isConnected}
                        variant="outline"
                        size="icon"
                        className="w-10 h-10 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                      >
                        <RotateCw className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      data-testid="button-look-down"
                      onClick={() => lookBot(0, 50)}
                      disabled={!isConnected}
                      variant="outline"
                      size="icon"
                      className="w-10 h-10 border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <p className="text-[10px] text-zinc-600 text-center">
                  Use W A S D keys + Space to move when not focused on input
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-chat"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                    placeholder="Type a message..."
                    disabled={!isConnected}
                    className="bg-zinc-900/60 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20 disabled:opacity-30"
                  />
                  <Button
                    data-testid="button-send-chat"
                    onClick={sendChat}
                    disabled={!isConnected || !chatMessage.trim()}
                    size="icon"
                    className="bg-violet-600 hover:bg-violet-500 border-0 text-white shrink-0 disabled:opacity-30"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Bot View
                </CardTitle>
                <Button
                  data-testid="button-screenshot"
                  onClick={takeScreenshot}
                  disabled={!isConnected}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 bg-zinc-900/40 hover:bg-zinc-700/60 text-xs disabled:opacity-30"
                >
                  <Camera className="w-3 h-3 mr-1" />
                  Capture
                </Button>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-zinc-950 rounded-lg border border-zinc-800/60 overflow-hidden flex items-center justify-center">
                  {screenshot ? (
                    <img
                      data-testid="img-screenshot"
                      src={screenshot}
                      alt="Bot screenshot"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-zinc-600">
                      <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">
                        {isConnected
                          ? 'Click "Capture" to see what the bot sees'
                          : "Launch the bot to capture screenshots"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 rounded-lg bg-zinc-950 border border-zinc-800/40 p-3 overflow-y-auto">
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {logs.length === 0 ? (
                      <p className="text-zinc-600">No activity yet...</p>
                    ) : (
                      logs.map((log, i) => (
                        <p
                          key={i}
                          data-testid={`text-log-${i}`}
                          className={`leading-relaxed ${
                            log.includes("error") || log.includes("Error") || log.includes("failed")
                              ? "text-red-400"
                              : log.includes("success") || log.includes("Success") || log.includes("Connected") || log.includes("Entered")
                              ? "text-emerald-400"
                              : log.includes("Moving") || log.includes("Jump") || log.includes("Look") || log.includes("Auto-nav")
                              ? "text-cyan-400"
                              : log.includes("Sending chat") || log.includes("Chat")
                              ? "text-amber-400"
                              : log.includes("Auto-navigation")
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
        </div>
      </div>
    </div>
  );
}
