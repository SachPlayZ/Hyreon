'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAgent, updateAgent } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Star, Clock, Shield, BadgeCheck, ExternalLink, ArrowLeft,
  Pencil, X, Check, TrendingUp, Globe, AlertCircle, Zap,
} from 'lucide-react';
import Link from 'next/link';

function ReputationBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground font-mono">{pct}%</span>
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit form state — mirrors registration fields
  const [form, setForm] = useState({
    agentName: '',
    apiUrl: '',
    taskType: '',
    priceHbar: '',
    slaSeconds: '',
    description: '',
    exampleRequestBody: '',
    exampleResponseBody: '',
  });
  const [requestFieldsConfig, setRequestFieldsConfig] = useState<Record<string, { required: boolean }>>({});
  const [requestJsonError, setRequestJsonError] = useState('');
  const [responseJsonError, setResponseJsonError] = useState('');

  const isOwner = !!user && agent?.ownerId === user.id;

  useEffect(() => {
    if (!id) return;
    getAgent(id)
      .then((data) => setAgent(data.agent))
      .catch(() => router.push('/agents'))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Populate form when edit mode opens
  useEffect(() => {
    if (!editing || !agent) return;
    setForm({
      agentName: agent.name ?? '',
      apiUrl: agent.apiUrl ?? '',
      taskType: agent.taskName ?? '',
      priceHbar: String(agent.rateHbar ?? ''),
      slaSeconds: String(agent.slaSeconds ?? 120),
      description: agent.description ?? '',
      exampleRequestBody: agent.exampleRequestBody
        ? JSON.stringify(agent.exampleRequestBody, null, 2)
        : '',
      exampleResponseBody: agent.exampleResponseBody
        ? JSON.stringify(agent.exampleResponseBody, null, 2)
        : '',
    });
    setRequestFieldsConfig(
      (agent.requestFieldsConfig as Record<string, { required: boolean }>) ?? {}
    );
    setSaveError('');
    setSaveSuccess(false);
  }, [editing, agent]);

  // Parse request fields for checkbox UI
  const requestFields = useMemo(() => {
    if (!form.exampleRequestBody.trim()) { setRequestJsonError(''); return []; }
    try {
      const parsed = JSON.parse(form.exampleRequestBody);
      setRequestJsonError('');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return Object.keys(parsed);
      }
      return [];
    } catch { setRequestJsonError('Invalid JSON'); return []; }
  }, [form.exampleRequestBody]);

  useEffect(() => {
    setRequestFieldsConfig((prev) => {
      const next: Record<string, { required: boolean }> = {};
      for (const field of requestFields) {
        next[field] = prev[field] ?? { required: true };
      }
      return next;
    });
  }, [requestFields]);

  useEffect(() => {
    if (!form.exampleResponseBody.trim()) { setResponseJsonError(''); return; }
    try { JSON.parse(form.exampleResponseBody); setResponseJsonError(''); }
    catch { setResponseJsonError('Invalid JSON'); }
  }, [form.exampleResponseBody]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleRequired = (field: string) => {
    setRequestFieldsConfig((prev) => ({
      ...prev,
      [field]: { required: !prev[field]?.required },
    }));
  };

  const handleSave = async () => {
    if (requestJsonError || responseJsonError) {
      setSaveError('Fix the JSON errors before saving');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      let parsedRequest: any = undefined;
      let parsedResponse: any = undefined;
      if (form.exampleRequestBody.trim()) parsedRequest = JSON.parse(form.exampleRequestBody);
      if (form.exampleResponseBody.trim()) parsedResponse = JSON.parse(form.exampleResponseBody);

      const data = await updateAgent(id, {
        userId: user!.id,
        agentName: form.agentName || undefined,
        apiUrl: form.apiUrl || undefined,
        taskType: form.taskType || undefined,
        priceHbar: form.priceHbar ? parseFloat(form.priceHbar) : undefined,
        slaSeconds: form.slaSeconds ? parseInt(form.slaSeconds) : undefined,
        description: form.description || undefined,
        exampleRequestBody: parsedRequest,
        requestFieldsConfig: requestFields.length > 0 ? requestFieldsConfig : undefined,
        exampleResponseBody: parsedResponse,
      });
      setAgent(data.agent);
      setSaveSuccess(true);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in">
      <Link href="/agents">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2 mb-6">
          <ArrowLeft size={14} /> Back to Registry
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight">{agent.name}</h1>
              {agent.isThirdParty && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400">
                  3rd party
                </Badge>
              )}
              <StatusBadge status={agent.status?.toUpperCase()} />
            </div>
            <p className="text-muted-foreground text-sm capitalize mt-0.5">
              {agent.taskName ?? agent.capability ?? agent.type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {agent.type === 'WORKER' && (
            <Link href={`/chat?agentId=${agent.id}&agentName=${encodeURIComponent(agent.name)}`}>
              <Button size="sm" className="gap-1.5 glow-purple">
                <Zap size={13} /> Hire
              </Button>
            </Link>
          )}
          {isOwner && !editing && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit
            </Button>
          )}
        </div>
      </div>

      {saveSuccess && !editing && (
        <Alert className="mb-4 border-emerald-500/30 bg-emerald-500/5">
          <Check size={14} className="text-emerald-400" />
          <AlertDescription className="text-xs text-emerald-400">Changes saved successfully.</AlertDescription>
        </Alert>
      )}

      {/* Stats card */}
      <Card className="border-border/60 mb-4">
        <CardContent className="pt-5 pb-4 px-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Reputation Score</p>
            <ReputationBar score={agent.reputationScore ?? 0} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Star size={12} className="text-amber-400" />
              {agent.ratingAvg?.toFixed(1) ?? '—'}
              <span className="text-muted-foreground/50 text-xs">({agent.totalRatings ?? 0} ratings)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <BadgeCheck size={12} className="text-primary/60" />
              {agent.tasksCompleted} tasks completed
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={12} className="text-blue-400" />
              SLA {agent.slaSeconds ?? 120}s
            </span>
            <span className="flex items-center gap-1.5">
              <Shield size={12} className="text-emerald-400" />
              {((agent.slaCompletionRate ?? 1) * 100).toFixed(0)}% on-time
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-purple-400" />
              {agent.rateHbar} ℏ / task
            </span>
            {agent.accountId && (
              <a
                href={`https://hashscan.io/testnet/account/${agent.accountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary/60 hover:text-primary transition-colors text-xs font-mono"
              >
                <ExternalLink size={10} /> {agent.accountId}
              </a>
            )}
          </div>

          {agent.description && (
            <>
              <Separator className="opacity-30" />
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
            </>
          )}

          {agent.apiUrl && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 pt-3">
              <Globe size={11} />
              <span className="font-mono truncate">{agent.apiUrl}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit form — owner only */}
      {editing && isOwner && (
        <Card className="border-primary/20 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Agent</CardTitle>
            <CardDescription>Changes take effect immediately for future tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="agentName">Agent Name</Label>
              <Input id="agentName" name="agentName" value={form.agentName} onChange={handleChange} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apiUrl" className="flex items-center gap-1.5">
                <Globe size={11} /> API URL
              </Label>
              <Input id="apiUrl" name="apiUrl" value={form.apiUrl} onChange={handleChange} className="font-mono text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taskType">Task Type</Label>
              <Input id="taskType" name="taskType" value={form.taskType} onChange={handleChange} className="font-mono text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="priceHbar">Price (HBAR)</Label>
                <Input id="priceHbar" name="priceHbar" type="number" step="0.1" min="0.1" value={form.priceHbar} onChange={handleChange} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slaSeconds">SLA (seconds)</Label>
                <Input id="slaSeconds" name="slaSeconds" type="number" min="10" value={form.slaSeconds} onChange={handleChange} className="font-mono" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" value={form.description} onChange={handleChange} rows={3} className="resize-none text-sm" />
            </div>

            <Separator className="opacity-30" />

            <div className="space-y-1.5">
              <Label htmlFor="exampleRequestBody">Example Request Body (JSON)</Label>
              <Textarea
                id="exampleRequestBody"
                name="exampleRequestBody"
                value={form.exampleRequestBody}
                onChange={handleChange}
                rows={5}
                className="resize-none text-sm font-mono"
              />
              {requestJsonError && <p className="text-xs text-destructive">{requestJsonError}</p>}

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

            <div className="space-y-1.5">
              <Label htmlFor="exampleResponseBody">Example Response Body (JSON)</Label>
              <Textarea
                id="exampleResponseBody"
                name="exampleResponseBody"
                value={form.exampleResponseBody}
                onChange={handleChange}
                rows={4}
                className="resize-none text-sm font-mono"
              />
              {responseJsonError && <p className="text-xs text-destructive">{responseJsonError}</p>}
            </div>

            {saveError && (
              <Alert variant="destructive" className="py-3">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs">{saveError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5 glow-purple">
                <Check size={13} /> {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5">
                <X size={13} /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent ratings */}
      {agent.ratings?.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Star size={12} /> Recent Ratings
          </h2>
          <div className="space-y-2">
            {agent.ratings.map((r: any) => (
              <div key={r.id} className="bg-card border border-border/50 rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-amber-400 font-mono">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span>
                  <span className="text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-muted-foreground text-xs">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
