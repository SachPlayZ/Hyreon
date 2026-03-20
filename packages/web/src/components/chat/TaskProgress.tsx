import { Check, Loader2, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  step: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  timestamp?: string;
  hashScanUrl?: string;
}

interface Props {
  timeline: Step[];
}

export function TaskProgress({ timeline }: Props) {
  if (!timeline?.length) return null;

  // Deduplicate: for each step name keep only the last entry (active → completed transition)
  const deduped = timeline.reduce<Step[]>((acc, step) => {
    const idx = acc.findIndex((s) => s.step === step.step);
    if (idx === -1) acc.push(step);
    else acc[idx] = step;
    return acc;
  }, []);

  return (
    <div className="bg-card/40 border border-border/40 rounded-xl p-4 text-xs space-y-2.5 mt-1">
      <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider font-medium">Task Progress</p>
      {deduped.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          {/* Step icon */}
          <div className={cn(
            'size-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
            step.status === 'completed' && 'bg-emerald-500/20 border border-emerald-500/40',
            step.status === 'active' && 'bg-primary/20 border border-primary/40',
            step.status === 'failed' && 'bg-destructive/20 border border-destructive/40',
            step.status === 'pending' && 'bg-muted/60 border border-border/40',
          )}>
            {step.status === 'completed' && <Check size={9} className="text-emerald-400" />}
            {step.status === 'active' && <Loader2 size={9} className="text-primary animate-spin" />}
            {step.status === 'failed' && <X size={9} className="text-destructive" />}
            {step.status === 'pending' && <div className="size-1.5 rounded-full bg-muted-foreground/40" />}
          </div>

          {/* Step label */}
          <span className={cn(
            'flex-1 text-xs transition-colors',
            step.status === 'completed' && 'text-muted-foreground',
            step.status === 'active' && 'text-foreground font-medium',
            step.status === 'failed' && 'text-destructive',
            step.status === 'pending' && 'text-muted-foreground/40',
          )}>
            {step.step}
          </span>

          {step.hashScanUrl && (
            <a
              href={step.hashScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary/60 hover:text-primary transition-colors"
            >
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
