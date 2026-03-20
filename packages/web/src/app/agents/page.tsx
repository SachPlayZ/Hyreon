'use client';
import useSWR from 'swr';
import { getAgents } from '@/lib/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Star, Clock, Shield, BadgeCheck, Plus, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function AgentsPage() {
  const { data, error, isLoading } = useSWR('agents', getAgents, { refreshInterval: 10000 });

  const agents = data?.agents ?? [];
  const workers = agents.filter((a: any) => a.type === 'WORKER');
  const dispatchers = agents.filter((a: any) => a.type === 'DISPATCHER');

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Registry</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All agents registered on the Hedera HOL Registry
          </p>
        </div>
        <Link href="/agents/register">
          <Button className="gap-1.5 glow-purple">
            <Plus size={14} /> Register Agent
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-24" />
                <Separator />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-3 w-full" />)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="text-destructive text-sm p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          Failed to load agents
        </div>
      )}

      {!isLoading && !error && (
        <>
          {workers.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp size={14} /> Worker Agents ({workers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workers.map((agent: any) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {dispatchers.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Shield size={14} /> Dispatcher ({dispatchers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dispatchers.map((agent: any) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {agents.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Shield size={40} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">No agents registered yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReputationBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{pct}%</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: any }) {
  return (
    <Link href={`/agents/${agent.id}`} className="block">
    <Card className="border-border/60 hover:border-primary/20 transition-colors group cursor-pointer">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-sm text-foreground">{agent.name}</h2>
              {agent.isThirdParty && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400">
                  3rd party
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs capitalize mt-0.5">
              {agent.taskName ?? agent.capability ?? agent.type}
            </p>
          </div>
          <StatusBadge status={agent.status.toUpperCase()} />
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-3 pb-4 px-5 space-y-3">
        {/* Reputation bar */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Reputation</p>
          <ReputationBar score={agent.reputationScore ?? 0} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Star size={10} className="text-amber-400 flex-shrink-0" />
            {agent.ratingAvg?.toFixed(1) ?? '—'}
            <span className="text-muted-foreground/50">({agent.totalRatings ?? 0})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <BadgeCheck size={10} className="text-primary/60 flex-shrink-0" />
            {agent.tasksCompleted} tasks
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={10} className="text-blue-400 flex-shrink-0" />
            SLA {agent.slaSeconds ?? 120}s
          </span>
          <span className="flex items-center gap-1.5">
            <Shield size={10} className="text-emerald-400 flex-shrink-0" />
            {((agent.slaCompletionRate ?? 1) * 100).toFixed(0)}% on-time
          </span>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
          <span className="text-muted-foreground">Price per task</span>
          <span className="font-mono font-semibold text-foreground">{agent.rateHbar} ℏ</span>
        </div>

        {agent.accountId && (
          <a
            href={`https://hashscan.io/testnet/account/${agent.accountId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-primary/60 hover:text-primary transition-colors text-[10px] font-mono"
          >
            <ExternalLink size={9} /> {agent.accountId}
          </a>
        )}
      </CardContent>
    </Card>
    </Link>
  );
}
