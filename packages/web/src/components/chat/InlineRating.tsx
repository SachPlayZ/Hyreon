'use client';
import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  agentName: string;
  ratingWindowClosesAt: string;
  onSubmit: (stars: number, comment?: string) => Promise<void>;
  onSkip: () => void;
}

export function InlineRating({ agentName, onSubmit, onSkip }: Props) {
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleClick = async (s: number) => {
    setSubmitted(true);
    try {
      await onSubmit(s);
    } catch {
      setSubmitted(false);
    }
  };

  if (submitted) return null;

  return (
    <div className="flex mb-3 gap-3 justify-start">
      <div className="size-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0 mt-0.5">
        D
      </div>

      <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Rate <span className="text-foreground font-medium">{agentName}</span>
        </span>

        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => handleClick(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                size={18}
                className={cn(
                  'transition-colors',
                  s <= hovered ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                )}
              />
            </button>
          ))}
        </div>

        <button
          onClick={onSkip}
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
