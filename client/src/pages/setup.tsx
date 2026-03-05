import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Shield,
} from "lucide-react";

interface BotCredential {
  id: string;
  email: string;
  password: string;
  configured: boolean;
}

export default function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [bots, setBots] = useState<BotCredential[]>([]);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
      const data = await res.json();
      setBots(data.bots.map((b: any) => ({ ...b, configured: false })));
      setGenerated(true);
    } catch {}
    setGenerating(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const allConfigured = bots.length > 0 && bots.every(b => b.configured);

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
                  Register Each Bot Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-4 text-sm">
                  <p className="text-amber-200 font-medium mb-2">For each bot below:</p>
                  <ol className="text-amber-300/80 space-y-1 list-decimal list-inside">
                    <li>Go to <a href="https://app.orangeweb3.com" target="_blank" rel="noopener" className="text-amber-200 underline hover:text-amber-100">app.orangeweb3.com</a></li>
                    <li>Click <strong>Login</strong></li>
                    <li>Choose <strong>Email</strong></li>
                    <li>Click <strong>Register</strong> (create new account)</li>
                    <li>Use the email and password shown below</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  {bots.map((bot, i) => (
                    <div
                      key={bot.id}
                      className={`rounded-lg border p-4 ${
                        bot.configured
                          ? "bg-emerald-950/20 border-emerald-800/40"
                          : "bg-zinc-900/40 border-zinc-700/40"
                      }`}
                      data-testid={`card-bot-credential-${bot.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {bot.configured ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-zinc-500" />
                          )}
                          <span className="font-medium text-sm">Bot {i + 1}</span>
                          {bot.configured && (
                            <span className="text-xs text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                              Configured
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-zinc-500 block mb-1">Email</label>
                          <div className="flex items-center gap-2">
                            <code className="text-sm text-zinc-200 bg-zinc-800/60 px-3 py-1.5 rounded flex-1 font-mono" data-testid={`text-email-${bot.id}`}>
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
                    </div>
                  ))}
                </div>

                <a
                  href="https://app.orangeweb3.com"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 mt-2"
                  data-testid="link-register"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open app.orangeweb3.com to register accounts
                </a>
              </CardContent>
            </Card>

            <Card className="bg-[#12121c] border-zinc-800/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">2</span>
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
                  <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">3</span>
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
