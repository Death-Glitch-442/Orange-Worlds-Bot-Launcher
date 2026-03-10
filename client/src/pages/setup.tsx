import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Copy,
  Edit2,
  Loader2,
  Rocket,
  Shield,
  UserPlus,
  X,
  Save,
  AlertCircle,
} from "lucide-react";

interface BotCredential {
  id: string;
  email: string;
  password: string;
  configured: boolean;
  registered: boolean;
}

interface RegistrationResult {
  id: string;
  success: boolean;
  message: string;
}

export default function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [registering, setRegistering] = useState<string | "all" | null>(null);
  const [bots, setBots] = useState<BotCredential[]>([]);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [regResults, setRegResults] = useState<Record<string, RegistrationResult>>({});

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/setup/credentials");
      const data = await res.json();
      if (data.generated && data.bots.length > 0) {
        setBots(data.bots);
        setGenerated(true);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const generateCredentials = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/setup/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate credentials");
      const data = await res.json();
      setBots(data.bots.map((b: any) => ({ ...b, configured: false, registered: false })));
      setGenerated(true);
    } catch (err: any) {
      setRegResults({ _global: { id: "_global", success: false, message: err.message || "Failed to generate credentials" } });
    }
    setGenerating(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const startEdit = (bot: BotCredential) => {
    setEditing(bot.id);
    setEditEmail(bot.email);
    setEditPassword(bot.password);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditEmail("");
    setEditPassword("");
  };

  const saveEdit = async (botId: string) => {
    try {
      const res = await fetch("/api/setup/update-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, email: editEmail, password: editPassword }),
      });
      if (res.ok) {
        setBots(prev =>
          prev.map(b =>
            b.id === botId ? { ...b, email: editEmail, password: editPassword, registered: false } : b
          )
        );
        setRegResults(prev => {
          const next = { ...prev };
          delete next[botId];
          return next;
        });
        setEditing(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setRegResults(prev => ({ ...prev, [botId]: { id: botId, success: false, message: data.error || "Failed to save" } }));
      }
    } catch (err: any) {
      setRegResults(prev => ({ ...prev, [botId]: { id: botId, success: false, message: err.message || "Network error" } }));
    }
  };

  const handleRegResponse = async (res: Response) => {
    const data = await res.json();
    if (data.results) {
      for (const r of data.results) {
        setRegResults(prev => ({ ...prev, [r.id]: r }));
        if (r.success) {
          setBots(prev => prev.map(b => b.id === r.id ? { ...b, registered: true } : b));
        }
      }
    } else if (data.error) {
      setRegResults(prev => ({ ...prev, _global: { id: "_global", success: false, message: data.error } }));
    }
  };

  const registerBot = async (botId: string) => {
    setRegistering(botId);
    try {
      const res = await fetch("/api/setup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      await handleRegResponse(res);
    } catch (err: any) {
      setRegResults(prev => ({ ...prev, [botId]: { id: botId, success: false, message: err.message || "Network error" } }));
    }
    setRegistering(null);
  };

  const registerAll = async () => {
    setRegistering("all");
    try {
      const res = await fetch("/api/setup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await handleRegResponse(res);
    } catch (err: any) {
      setRegResults(prev => ({ ...prev, _global: { id: "_global", success: false, message: err.message || "Network error" } }));
    }
    setRegistering(null);
  };

  const allConfigured = bots.length > 0 && bots.every(b => b.configured);
  const allRegistered = bots.length > 0 && bots.every(b => b.registered);
  const someRegistered = bots.some(b => b.registered);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-setup-title">
            Orange Worlds Bots Setup
          </h1>
          <p className="text-zinc-400 max-w-lg mx-auto">
            Set up your bot accounts to get started. Each bot needs a registered account on the Orange Web3 platform.
          </p>
        </div>

        {!generated ? (
          <Card className="bg-[#12121c] border-zinc-800/60">
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Generate Bot Credentials</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400 text-sm mb-6">
                Click below to generate unique email addresses and passwords for your 4 bots.
                These will be used to create accounts on the Orange Web3 platform.
              </p>
              <Button
                data-testid="button-generate-credentials"
                onClick={generateCredentials}
                disabled={generating}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 text-white"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                Generate Credentials
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">1</span>
                  Bot Credentials
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Review or edit the credentials below. You can use the auto-generated ones or replace them with your own.
                </p>

                <div className="space-y-3">
                  {bots.map((bot, i) => (
                    <div
                      key={bot.id}
                      className={`rounded-lg border p-4 ${
                        bot.registered
                          ? "bg-emerald-950/20 border-emerald-800/40"
                          : regResults[bot.id] && !regResults[bot.id].success
                          ? "bg-red-950/20 border-red-800/40"
                          : "bg-zinc-900/40 border-zinc-700/40"
                      }`}
                      data-testid={`card-bot-credential-${bot.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {bot.registered ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-zinc-500" />
                          )}
                          <span className="font-medium text-sm">Bot {i + 1}</span>
                          {bot.registered && (
                            <span className="text-xs text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                              Registered
                            </span>
                          )}
                          {bot.configured && (
                            <span className="text-xs text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                              Configured
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {editing !== bot.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-zinc-400 hover:text-white text-xs"
                              onClick={() => startEdit(bot)}
                              data-testid={`button-edit-${bot.id}`}
                            >
                              <Edit2 className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                          )}
                          {!bot.registered && editing !== bot.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-violet-400 hover:text-violet-300 text-xs"
                              onClick={() => registerBot(bot.id)}
                              disabled={registering !== null}
                              data-testid={`button-register-${bot.id}`}
                            >
                              {registering === bot.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <UserPlus className="w-3 h-3 mr-1" />
                              )}
                              Register
                            </Button>
                          )}
                        </div>
                      </div>

                      {editing === bot.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Email</label>
                            <Input
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="bg-zinc-800/60 border-zinc-700 text-sm font-mono"
                              data-testid={`input-email-${bot.id}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Password</label>
                            <Input
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              className="bg-zinc-800/60 border-zinc-700 text-sm font-mono"
                              data-testid={`input-password-${bot.id}`}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-violet-600 hover:bg-violet-500 text-white text-xs"
                              onClick={() => saveEdit(bot.id)}
                              data-testid={`button-save-${bot.id}`}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-zinc-400 hover:text-white text-xs"
                              onClick={cancelEdit}
                              data-testid={`button-cancel-edit-${bot.id}`}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Email</label>
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-zinc-200 bg-zinc-800/60 px-3 py-1.5 rounded flex-1 font-mono truncate" data-testid={`text-email-${bot.id}`}>
                                {bot.email}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                                onClick={() => copyToClipboard(bot.email, `email-${bot.id}`)}
                                data-testid={`button-copy-email-${bot.id}`}
                              >
                                {copied === `email-${bot.id}` ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Password</label>
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-zinc-200 bg-zinc-800/60 px-3 py-1.5 rounded flex-1 font-mono" data-testid={`text-password-${bot.id}`}>
                                {bot.password}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                                onClick={() => copyToClipboard(bot.password, `pass-${bot.id}`)}
                                data-testid={`button-copy-password-${bot.id}`}
                              >
                                {copied === `pass-${bot.id}` ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {regResults[bot.id] && !regResults[bot.id].success && (
                        <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/30 rounded p-2">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{regResults[bot.id].message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">2</span>
                  Register Accounts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Register all bot accounts with the Orange Web3 platform. You can register them all at once, or individually using the buttons above.
                </p>

                {allRegistered ? (
                  <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-200">All bot accounts have been registered.</span>
                  </div>
                ) : (
                  <Button
                    data-testid="button-register-all"
                    onClick={registerAll}
                    disabled={registering !== null}
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 text-white"
                  >
                    {registering === "all" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    Register All Accounts
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">3</span>
                  Add Credentials as Secrets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  After registering all accounts, add each bot's credentials as Replit Secrets.
                  Go to the <strong>Secrets</strong> tab in your Replit project and add these:
                </p>
                <div className="bg-zinc-900/60 rounded-lg p-4 font-mono text-xs space-y-1 text-zinc-300">
                  {bots.map((bot, i) => {
                    const config = [
                      { id: "bot1", emailKey: "HUBS_BOT_EMAIL", passKey: "HUBS_BOT_PASSWORD" },
                      { id: "bot2", emailKey: "HUBS_BOT2_EMAIL", passKey: "HUBS_BOT2_PASSWORD" },
                      { id: "bot3", emailKey: "HUBS_BOT3_EMAIL", passKey: "HUBS_BOT3_PASSWORD" },
                      { id: "bot4", emailKey: "HUBS_BOT4_EMAIL", passKey: "HUBS_BOT4_PASSWORD" },
                    ][i];
                    return (
                      <div key={bot.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{config.emailKey}</span>
                          <span className="text-zinc-600">=</span>
                          <span className="text-violet-300">{bot.email}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-zinc-500 hover:text-white"
                            onClick={() => copyToClipboard(`${bot.email}`, `env-email-${bot.id}`)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{config.passKey}</span>
                          <span className="text-zinc-600">=</span>
                          <span className="text-violet-300">{bot.password}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-zinc-500 hover:text-white"
                            onClick={() => copyToClipboard(`${bot.password}`, `env-pass-${bot.id}`)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        {i < bots.length - 1 && <div className="h-1" />}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">4</span>
                  Launch the Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm mb-4">
                  Once you've registered all accounts and added the secrets, click below to continue to the bot control dashboard.
                </p>
                <Button
                  data-testid="button-continue-dashboard"
                  onClick={onComplete}
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 text-white"
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Continue to Dashboard
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
