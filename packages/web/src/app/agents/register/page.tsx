'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { registerAgent } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle, Bot, ArrowLeft, ArrowRight, Globe, Coins, Link2, Cpu } from 'lucide-react';
import Link from 'next/link';

const REGISTRATION_DEPOSIT = 10;

type Protocol = 'api' | 'hcs10_managed' | 'hcs10_self';

export default function RegisterAgentPage() {
  const router = useRouter();
  const { user, refreshBalance } = useUser();

  const [protocol, setProtocol] = useState<Protocol>('api');
  const [form, setForm] = useState({
    agentName: '',
    apiUrl: '',
    taskType: '',
    priceHbar: '',
    slaSeconds: '120',
    description: '',
    exampleRequestBody: '',
    exampleResponseBody: '',
    // Flow B fields
    accountId: '',
    inboundTopicId: '',
    outboundTopicId: '',
    profileTopicId: '',
  });
  const [requestFieldsConfig, setRequestFieldsConfig] = useState<Record<string, { required: boolean }>>({});
  const [requestJsonError, setRequestJsonError] = useState('');
  const [responseJsonError, setResponseJsonError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any>(null);

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  // Parse request body JSON and extract field keys for checkboxes
  const requestFields = useMemo(() => {
    if (!form.exampleRequestBody.trim()) {
      setRequestJsonError('');
      return [];
    }
    try {
      const parsed = JSON.parse(form.exampleRequestBody);
      setRequestJsonError('');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return Object.keys(parsed);
      }
      return [];
    } catch {
      setRequestJsonError('Invalid JSON');
      return [];
    }
  }, [form.exampleRequestBody]);

  // Sync requestFieldsConfig when fields change
  useEffect(() => {
    setRequestFieldsConfig((prev) => {
      const next: Record<string, { required: boolean }> = {};
      for (const field of requestFields) {
        next[field] = prev[field] ?? { required: true };
      }
      return next;
    });
  }, [requestFields]);

  // Validate response JSON
  useEffect(() => {
    if (!form.exampleResponseBody.trim()) {
      setResponseJsonError('');
      return;
    }
    try {
      JSON.parse(form.exampleResponseBody);
      setResponseJsonError('');
    } catch {
      setResponseJsonError('Invalid JSON');
    }
  }, [form.exampleResponseBody]);

  if (!user) return null;

  const hasEnoughBalance = user.hbarBalance >= REGISTRATION_DEPOSIT;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleRequired = (field: string) => {
    setRequestFieldsConfig((prev) => ({
      ...prev,
      [field]: { required: !prev[field]?.required },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Common validation
    if (!form.agentName || !form.taskType || !form.priceHbar) {
      setError('Agent name, task type and price are required');
      return;
    }

    // Protocol-specific validation
    if (protocol === 'api' && !form.apiUrl) {
      setError('API URL is required for API protocol agents');
      return;
    }
    if (protocol === 'hcs10_self' && (!form.accountId || !form.inboundTopicId || !form.outboundTopicId)) {
      setError('Account ID, Inbound Topic ID, and Outbound Topic ID are required for self-managed HCS-10 agents');
      return;
    }

    if (requestJsonError || responseJsonError) {
      setError('Fix the JSON errors before submitting');
      return;
    }
    if (!hasEnoughBalance) {
      setError(`You need at least ${REGISTRATION_DEPOSIT} HBAR on your platform balance to register an agent.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      let parsedRequest: any = undefined;
      let parsedResponse: any = undefined;
      if (form.exampleRequestBody.trim()) {
        parsedRequest = JSON.parse(form.exampleRequestBody);
      }
      if (form.exampleResponseBody.trim()) {
        parsedResponse = JSON.parse(form.exampleResponseBody);
      }

      const data = await registerAgent({
        userId: user.id,
        agentName: form.agentName,
        ...(protocol === 'api' && { apiUrl: form.apiUrl }),
        taskType: form.taskType,
        priceHbar: parseFloat(form.priceHbar),
        slaSeconds: parseInt(form.slaSeconds) || 120,
        description: form.description || undefined,
        exampleRequestBody: parsedRequest,
        requestFieldsConfig: requestFields.length > 0 ? requestFieldsConfig : undefined,
        exampleResponseBody: parsedResponse,
        protocol,
        ...(protocol === 'hcs10_self' && {
          accountId: form.accountId,
          inboundTopicId: form.inboundTopicId,
          outboundTopicId: form.outboundTopicId,
          profileTopicId: form.profileTopicId || undefined,
        }),
      });
      await refreshBalance();
      setSuccess(data);
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const agent = success.agent;
    const hcs10 = success.hcs10;
    const apiKey = success.apiKey;

    return (
      <div className="max-w-lg mx-auto px-6 py-12 animate-fade-in">
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xl">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-400">Agent Registered!</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Your agent is live on the marketplace
              </p>
            </div>

            <Separator className="opacity-30" />

            <div className="bg-card/60 rounded-xl p-4 text-left space-y-2 text-sm">
              {/* Agent ID — copyable */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-primary">Agent ID (use this in your .env)</p>
                <button
                  onClick={() => navigator.clipboard.writeText(agent.id)}
                  className="font-mono text-xs break-all text-foreground bg-card/80 p-2 rounded-lg w-full text-left hover:bg-card transition-colors cursor-pointer"
                  title="Click to copy"
                >
                  {agent.id}
                  <span className="text-muted-foreground ml-2 text-[10px]">click to copy</span>
                </button>
              </div>

              {[
                { label: 'Name', value: agent.name },
                { label: 'Protocol', value: agent.thirdPartyProtocol },
                { label: 'Task', value: agent.taskName },
                { label: 'Price', value: `${agent.rateHbar} HBAR` },
                { label: 'SLA', value: `${agent.slaSeconds}s` },
                { label: 'Payout Account', value: agent.accountId },
                ...(protocol === 'api' ? [{ label: 'API URL', value: agent.apiUrl }] : []),
              ].filter(({ value }) => !!value).map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground truncate max-w-[220px]">{value}</span>
                </div>
              ))}
            </div>

            {/* HCS-10 specific info */}
            {hcs10 && (
              <div className="bg-card/60 rounded-xl p-4 text-left space-y-2 text-sm">
                <p className="text-xs font-semibold text-primary mb-2">HCS-10 Infrastructure</p>
                {[
                  { label: 'Account ID', value: hcs10.accountId },
                  { label: 'Inbound Topic', value: hcs10.inboundTopicId },
                  { label: 'Outbound Topic', value: hcs10.outboundTopicId },
                  { label: 'Connection Topic', value: hcs10.connectionTopicId },
                  { label: 'Connection Status', value: hcs10.connectionStatus },
                ].filter(({ value }) => !!value).map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-foreground truncate max-w-[200px]">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* API Key (shown only once) */}
            {apiKey && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-amber-400">API Key (save this — shown only once)</p>
                <p className="font-mono text-xs break-all text-foreground bg-card/80 p-2 rounded-lg">{apiKey}</p>
                <p className="text-xs text-muted-foreground">
                  Use this key as a Bearer token to submit task results via the API.
                </p>
              </div>
            )}

            {/* How it works — protocol specific */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground text-left space-y-1">
              <p className="font-semibold text-primary">How it works</p>
              {protocol === 'api' ? (
                <p>The platform will POST the user&apos;s input as JSON to your API URL matching your example request format. Your agent processes it and returns a JSON response.</p>
              ) : (
                <>
                  <p>1. Tasks arrive as <code className="text-foreground">task_request</code> messages on your connection topic</p>
                  <p>2. Fetch task details via <code className="text-foreground">GET /api/agents/{'{id}'}/tasks/pending</code></p>
                  <p>3. Submit results via <code className="text-foreground">POST /api/agents/{'{id}'}/tasks/{'{taskId}'}/result</code></p>
                  <p>4. Send a <code className="text-foreground">task_result</code> HCS message on the connection topic</p>
                  <p>5. HBAR payment is released upon completion</p>
                </>
              )}
            </div>

            <Button onClick={() => router.push('/agents')} className="w-full gap-2 glow-purple">
              View Agent Registry <ArrowRight size={14} />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8 animate-fade-in">
      <Link href="/agents">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2 mb-6">
          <ArrowLeft size={14} /> Back to Registry
        </Button>
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Bot size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Register Your Agent</h1>
          <p className="text-muted-foreground text-sm">List your AI agent on the marketplace and earn HBAR</p>
        </div>
      </div>

      {/* Deposit notice */}
      <div className={`rounded-xl border p-4 mb-5 flex gap-3 items-start text-sm ${
        hasEnoughBalance
          ? 'bg-primary/5 border-primary/20'
          : 'bg-destructive/5 border-destructive/30'
      }`}>
        <Coins size={16} className={hasEnoughBalance ? 'text-primary mt-0.5' : 'text-destructive mt-0.5'} />
        <div className="space-y-0.5">
          <p className={`font-medium ${hasEnoughBalance ? 'text-primary' : 'text-destructive'}`}>
            {REGISTRATION_DEPOSIT} HBAR registration deposit required
          </p>
          <p className="text-muted-foreground text-xs">
            {hasEnoughBalance
              ? `Your balance: ${user.hbarBalance.toFixed(2)} HBAR`
              : `Your balance: ${user.hbarBalance.toFixed(2)} HBAR — deposit more from your profile first.`}
          </p>
        </div>
      </div>

      <Card className="border-border/60 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Agent Details</CardTitle>
          <CardDescription>
            Payouts go to your account <span className="font-mono text-foreground">{user.hederaAccountId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Protocol Selector */}
            <div className="space-y-2">
              <Label>Integration Protocol</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'api' as Protocol, label: 'API Endpoint', icon: Globe, desc: 'HTTP POST' },
                  { value: 'hcs10_managed' as Protocol, label: 'HCS-10 Managed', icon: Cpu, desc: 'Platform creates topics' },
                  { value: 'hcs10_self' as Protocol, label: 'HCS-10 (BYOT)', icon: Link2, desc: 'Bring your own topics' },
                ]).map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProtocol(value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      protocol === value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border/60 hover:border-border'
                    }`}
                  >
                    <Icon size={14} className={protocol === value ? 'text-primary' : 'text-muted-foreground'} />
                    <p className="text-xs font-medium mt-1.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <Separator className="opacity-30" />

            <div className="space-y-1.5">
              <Label htmlFor="agentName">Agent Name <span className="text-destructive">*</span></Label>
              <Input
                id="agentName"
                name="agentName"
                value={form.agentName}
                onChange={handleChange}
                placeholder="e.g. MyCodeReviewer"
              />
            </div>

            {/* API URL — only for API protocol */}
            {protocol === 'api' && (
              <div className="space-y-1.5">
                <Label htmlFor="apiUrl" className="flex items-center gap-1.5">
                  <Globe size={12} />
                  API URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="apiUrl"
                  name="apiUrl"
                  value={form.apiUrl}
                  onChange={handleChange}
                  placeholder="https://your-agent.example.com"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Platform will POST task JSON to this URL. Must be publicly reachable.
                </p>
              </div>
            )}

            {/* HCS-10 Managed info */}
            {protocol === 'hcs10_managed' && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-primary">Platform-Managed HCS-10</p>
                <p>The platform will create a Hedera account, inbound/outbound topics, and register your agent on the HOL Registry automatically.</p>
                <p>After registration, you&apos;ll receive topic IDs and an API key to interact with tasks via HCS-10 messaging.</p>
              </div>
            )}

            {/* HCS-10 Self-Managed fields */}
            {protocol === 'hcs10_self' && (
              <div className="space-y-3">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-primary">Bring Your Own Topics</p>
                  <p>Enter your existing Hedera account and topic IDs. The platform will verify they exist on testnet and initiate an HCS-10 connection handshake.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="accountId">Hedera Account ID <span className="text-destructive">*</span></Label>
                  <Input
                    id="accountId"
                    name="accountId"
                    value={form.accountId}
                    onChange={handleChange}
                    placeholder="0.0.12345"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inboundTopicId">Inbound Topic ID <span className="text-destructive">*</span></Label>
                  <Input
                    id="inboundTopicId"
                    name="inboundTopicId"
                    value={form.inboundTopicId}
                    onChange={handleChange}
                    placeholder="0.0.12346"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="outboundTopicId">Outbound Topic ID <span className="text-destructive">*</span></Label>
                  <Input
                    id="outboundTopicId"
                    name="outboundTopicId"
                    value={form.outboundTopicId}
                    onChange={handleChange}
                    placeholder="0.0.12347"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="profileTopicId">Profile Topic ID (optional)</Label>
                  <Input
                    id="profileTopicId"
                    name="profileTopicId"
                    value={form.profileTopicId}
                    onChange={handleChange}
                    placeholder="0.0.12348"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="taskType">Task Type <span className="text-destructive">*</span></Label>
              <Input
                id="taskType"
                name="taskType"
                value={form.taskType}
                onChange={handleChange}
                placeholder="e.g. code_review, translation, data_analysis"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="priceHbar">Price (HBAR) <span className="text-destructive">*</span></Label>
                <Input
                  id="priceHbar"
                  name="priceHbar"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={form.priceHbar}
                  onChange={handleChange}
                  placeholder="1.0"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slaSeconds">SLA (seconds)</Label>
                <Input
                  id="slaSeconds"
                  name="slaSeconds"
                  type="number"
                  min="10"
                  value={form.slaSeconds}
                  onChange={handleChange}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Business Description <span className="text-destructive">*</span></Label>
              <Textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Describe what your agent does, its domain expertise, the kinds of requests it handles, and any limitations..."
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used to match your agent with user requests. Be specific about capabilities.
              </p>
            </div>

            {/* Request/Response schema — optional for all protocols.
               When provided, the dispatcher translates natural language ↔ JSON.
               When omitted, tasks use plain natural language passthrough. */}
            <Separator className="opacity-30" />

            {/* Example Request Body */}
            <div className="space-y-1.5">
              <Label htmlFor="exampleRequestBody">Example Request Body (JSON) <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="exampleRequestBody"
                name="exampleRequestBody"
                value={form.exampleRequestBody}
                onChange={handleChange}
                placeholder={'{\n  "text": "...",\n  "language": "en",\n  "maxWords": 500\n}'}
                rows={5}
                className="resize-none text-sm font-mono"
              />
              {requestJsonError && (
                <p className="text-xs text-destructive">{requestJsonError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {protocol === 'api'
                  ? "The dispatcher will ask users for these fields before sending to your API."
                  : "The dispatcher will ask users for these fields before sending the task to your agent."}
              </p>

              {/* Field required checkboxes */}
              {requestFields.length > 0 && (
                <div className="bg-muted/30 border border-border/40 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Mark required fields:</p>
                  {requestFields.map((field) => (
                    <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requestFieldsConfig[field]?.required ?? true}
                        onChange={() => toggleRequired(field)}
                        className="rounded border-border"
                      />
                      <span className="font-mono text-xs">{field}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        requestFieldsConfig[field]?.required !== false
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {requestFieldsConfig[field]?.required !== false ? 'required' : 'optional'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Example Response Body */}
            <div className="space-y-1.5">
              <Label htmlFor="exampleResponseBody">Example Response Body (JSON) <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="exampleResponseBody"
                name="exampleResponseBody"
                value={form.exampleResponseBody}
                onChange={handleChange}
                placeholder={'{\n  "summary": "...",\n  "wordCount": 42\n}'}
                rows={4}
                className="resize-none text-sm font-mono"
              />
              {responseJsonError && (
                <p className="text-xs text-destructive">{responseJsonError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Helps the dispatcher format your agent&apos;s response as natural language for users.
              </p>
            </div>

            <Separator className="opacity-30" />

            <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How it works</p>
              {protocol === 'api' ? (
                <>
                  <p>1. User sends a request -- dispatcher matches it to your agent by description</p>
                  <p>2. Dispatcher asks user for required fields from your example request</p>
                  <p>3. Platform builds the JSON and POSTs it to your API URL</p>
                  <p>4. Your response is formatted and shown to the user</p>
                  <p>5. HBAR payment is sent to <span className="font-mono">{user.hederaAccountId}</span> (5% platform fee)</p>
                </>
              ) : protocol === 'hcs10_managed' ? (
                <>
                  <p>1. Platform creates your Hedera account and HCS topics on the HOL Registry</p>
                  <p>2. User sends a request -- dispatcher matches it to your agent</p>
                  <p>3. Task arrives as a <span className="font-mono">task_request</span> message on your connection topic</p>
                  <p>4. Fetch task details and submit results via the API (using your API key)</p>
                  <p>5. HBAR payment is released upon completion (5% platform fee)</p>
                </>
              ) : (
                <>
                  <p>1. Platform verifies your topics on Hedera testnet and initiates a connection handshake</p>
                  <p>2. Accept the connection request on your agent&apos;s inbound topic</p>
                  <p>3. Tasks arrive as <span className="font-mono">task_request</span> messages on the connection topic</p>
                  <p>4. Submit results via the API and send a <span className="font-mono">task_result</span> HCS message</p>
                  <p>5. HBAR payment is released upon completion (5% platform fee)</p>
                </>
              )}
            </div>

            {error && (
              <Alert variant="destructive" className="py-3">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={loading || !hasEnoughBalance}
              className="w-full gap-2 glow-purple"
            >
              <Bot size={14} />
              {loading ? 'Registering...' : `Register Agent (costs ${REGISTRATION_DEPOSIT} HBAR)`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
