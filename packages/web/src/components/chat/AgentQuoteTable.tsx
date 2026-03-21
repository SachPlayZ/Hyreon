'use client';
import { Star, Clock, Shield, Zap, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface QuoteAgent {
  agent_id: string;
  name: string;
  price_hbar: number;
  sla_seconds: number;
  rating_avg: number;
  reputation_score: number;
  tasks_completed: number;
  is_third_party?: boolean;
}

interface Props {
  agents: QuoteAgent[];
  userBalance: number;
  onHire: (agentId: string) => void;
  disabled?: boolean;
}

function ReputationBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{pct}%</span>
    </div>
  );
}

export function AgentQuoteTable({ agents, userBalance, onHire, disabled }: Props) {
  if (!agents || agents.length === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No agents available for this task type.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2.5 my-1">
      <p className="text-xs text-muted-foreground font-medium">Choose an agent to execute your task:</p>
      {agents.map((agent) => {
        const totalCost = agent.price_hbar;
        const platformFee = agent.price_hbar * 0.05;
        const canAfford = userBalance >= totalCost;

        return (
          <Card
            key={agent.agent_id}
            className={cn(
              'border transition-colors',
              canAfford
                ? 'border-border/60 hover:border-primary/30 hover:bg-card/60'
                : 'border-border/40 opacity-70'
            )}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm text-foreground">{agent.name}</h3>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-muted-foreground/20 text-muted-foreground">
                      {agent.tasks_completed} tasks
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-amber-400 text-xs">
                      <Star size={10} fill="currentColor" />
                      {agent.rating_avg.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1 text-blue-400 text-xs">
                      <Clock size={10} />
                      {agent.sla_seconds}s SLA
                    </span>
                    {agent.is_third_party ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Zap size={10} />
                        3rd party
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <Shield size={10} />
                        platform
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-foreground">{agent.price_hbar} <span className="text-muted-foreground font-normal text-xs">ℏ</span></p>
                  <p className="text-muted-foreground/60 text-[10px] mt-0.5">incl. {platformFee.toFixed(2)} ℏ fee</p>
                </div>
              </div>

              {/* Reputation bar */}
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Shield size={9} /> Reputation score
                </p>
                <ReputationBar score={agent.reputation_score} />
              </div>

              <Separator className="opacity-50" />

              {/* Balance warning */}
              {!canAfford && (
                <p className="text-[11px] text-destructive/70 flex items-center gap-1">
                  <span>Insufficient balance — need {totalCost.toFixed(2)} ℏ, you have {userBalance.toFixed(2)} ℏ</span>
                </p>
              )}

              <Button
                onClick={() => onHire(agent.agent_id)}
                disabled={disabled || !canAfford}
                className={cn('w-full gap-2 h-9 text-sm', canAfford && 'glow-purple')}
                variant={canAfford ? 'default' : 'outline'}
              >
                {canAfford ? (
                  <>
                    <Zap size={13} />
                    Hire for {totalCost.toFixed(2)} ℏ
                  </>
                ) : (
                  <>
                    <CheckCircle size={13} className="opacity-40" />
                    Insufficient balance
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
