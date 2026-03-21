'use client';
import { useState, useEffect } from 'react';
import { Check, Loader2, X, ExternalLink, ChevronDown } from 'lucide-react';
import { getTask } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Step {
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  hashScanUrl?: string;
}

const TERMINAL = new Set([
  'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED',
]);

function deriveSteps(task: any): Step[] {
  const s = task?.status as string;
  if (!s) return INITIAL_STEPS;

  const txs: any[] = task?.transactions ?? [];
  const escrowTx   = txs.find((t) => t.type === 'ESCROW_CREATE');
  const releaseTx  = txs.find((t) => t.type === 'ESCROW_RELEASE');
  const receiptTx  = txs.find((t) => t.type === 'RECEIPT');

  const hashUrl = (txId?: string) =>
    txId ? `https://hashscan.io/testnet/transaction/${txId}` : undefined;
  const topicUrl = (topicId?: string) =>
    topicId ? `https://hashscan.io/testnet/topic/${topicId}` : undefined;

  const after = (...statuses: string[]) => statuses.includes(s);
  const isFailed = s === 'FAILED' || s === 'REFUNDED';

  return [
    {
      name: 'Classifying',
      status: after('HIRING', 'ESCROW_CREATED', 'IN_PROGRESS', 'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED')
        ? 'completed'
        : s === 'CLASSIFYING' ? 'active' : 'pending',
    },
    {
      name: 'Hiring Worker',
      status: after('ESCROW_CREATED', 'IN_PROGRESS', 'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED')
        ? 'completed'
        : s === 'HIRING' ? 'active' : 'pending',
    },
    {
      name: 'Funding Escrow',
      status: after('IN_PROGRESS', 'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED')
        ? 'completed'
        : isFailed && after('REFUNDED', 'FAILED') && !after('IN_PROGRESS') ? 'failed'
        : s === 'ESCROW_CREATED' ? 'active' : 'pending',
      hashScanUrl: hashUrl(escrowTx?.hederaTxId),
    },
    {
      name: 'Processing Task',
      status: after('RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED')
        ? 'completed'
        : isFailed ? 'failed'
        : s === 'IN_PROGRESS' ? 'active' : 'pending',
    },
    {
      name: 'Releasing Payment',
      status: after('ESCROW_RELEASED', 'RATING_WINDOW', 'COMPLETED')
        ? 'completed'
        : s === 'REFUNDED' ? 'failed' : 'pending',
      hashScanUrl: hashUrl(releaseTx?.hederaTxId),
    },
    {
      name: 'Writing Receipt',
      status: after('RATING_WINDOW', 'COMPLETED')
        ? 'completed'
        : s === 'FAILED' ? 'failed' : 'pending',
      hashScanUrl: topicUrl(task?.receiptTopicId),
    },
  ];
}

const INITIAL_STEPS: Step[] = [
  { name: 'Classifying',       status: 'active'  },
  { name: 'Hiring Worker',     status: 'pending' },
  { name: 'Funding Escrow',    status: 'pending' },
  { name: 'Processing Task',   status: 'pending' },
  { name: 'Releasing Payment', status: 'pending' },
  { name: 'Writing Receipt',   status: 'pending' },
];

export function LiveTaskAccordion({ taskId, defaultCollapsed }: { taskId: string; defaultCollapsed?: boolean }) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [open, setOpen] = useState(!defaultCollapsed);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await getTask(taskId);
        if (cancelled) return;
        const derived = deriveSteps(data.task);
        setSteps(derived);
        if (TERMINAL.has(data.task.status)) {
          setDone(true);
          return; // stop polling
        }
      } catch {
        // retry on error
      }
      if (!cancelled) setTimeout(poll, 1500);
    }

    poll();
    return () => { cancelled = true; };
  }, [taskId]);

  const completed = steps.filter((s) => s.status === 'completed').length;
  const activeStep = steps.find((s) => s.status === 'active');
  const failed = steps.some((s) => s.status === 'failed');

  const summaryColor = failed
    ? 'text-destructive'
    : done
    ? 'text-emerald-400'
    : 'text-primary';

  return (
    <div className="flex mb-2 ml-11">
      <div className="w-full max-w-[85%]">
        <div
          className={cn(
            'rounded-xl border transition-colors overflow-hidden',
            failed
              ? 'border-destructive/30 bg-destructive/5'
              : done
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-primary/20 bg-primary/5'
          )}
        >
          {/* Accordion header — always visible */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs"
          >
            {/* Live / done indicator */}
            <span className="flex-shrink-0">
              {done || failed ? (
                failed ? (
                  <X size={12} className="text-destructive" />
                ) : (
                  <Check size={12} className="text-emerald-400" />
                )
              ) : (
                <Loader2 size={12} className={cn('animate-spin', summaryColor)} />
              )}
            </span>

            {/* Summary text */}
            <span className={cn('flex-1 text-left font-medium truncate', summaryColor)}>
              {failed
                ? 'Task failed'
                : done
                ? `All ${steps.length} steps complete`
                : activeStep
                ? activeStep.name + '…'
                : 'Processing…'}
            </span>

            {/* Step count */}
            <span className="text-muted-foreground/50 flex-shrink-0 tabular-nums">
              {completed}/{steps.length}
            </span>

            <ChevronDown
              size={13}
              className={cn(
                'text-muted-foreground/50 flex-shrink-0 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </button>

          {/* Accordion body */}
          {open && (
            <div className="px-4 pb-3 pt-0 space-y-2 border-t border-border/30">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={cn(
                    'size-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                    step.status === 'completed' && 'bg-emerald-500/20 border border-emerald-500/40',
                    step.status === 'active'    && 'bg-primary/20 border border-primary/40',
                    step.status === 'failed'    && 'bg-destructive/20 border border-destructive/40',
                    step.status === 'pending'   && 'bg-muted/40 border border-border/30',
                  )}>
                    {step.status === 'completed' && <Check    size={9} className="text-emerald-400" />}
                    {step.status === 'active'    && <Loader2  size={9} className="text-primary animate-spin" />}
                    {step.status === 'failed'    && <X        size={9} className="text-destructive" />}
                    {step.status === 'pending'   && <div className="size-1.5 rounded-full bg-muted-foreground/30" />}
                  </div>

                  {/* Label */}
                  <span className={cn(
                    'flex-1 text-xs transition-colors',
                    step.status === 'completed' && 'text-muted-foreground',
                    step.status === 'active'    && 'text-foreground font-medium',
                    step.status === 'failed'    && 'text-destructive',
                    step.status === 'pending'   && 'text-muted-foreground/35',
                  )}>
                    {step.name}
                  </span>

                  {/* HashScan link */}
                  {step.hashScanUrl && step.status !== 'pending' && (
                    <a
                      href={step.hashScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary/50 hover:text-primary transition-colors"
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
