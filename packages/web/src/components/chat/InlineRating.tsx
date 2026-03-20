'use client';
import { useState, useEffect } from 'react';
import { Star, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Props {
  agentName: string;
  ratingWindowClosesAt: string;
  onSubmit: (stars: number, comment?: string) => Promise<void>;
  onSkip: () => void;
}

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function InlineRating({ agentName, ratingWindowClosesAt, onSubmit, onSkip }: Props) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(ratingWindowClosesAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); setExpired(true); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [ratingWindowClosesAt]);

  const handleSubmit = async () => {
    if (stars === 0) return;
    setLoading(true);
    try {
      await onSubmit(stars, comment.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  const displayStars = hovered || stars;

  return (
    <div className="flex mb-4 gap-3 justify-start">
      {/* Dispatcher avatar */}
      <div className="size-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0 mt-0.5">
        D
      </div>

      <div className="max-w-[85%] space-y-1.5">
        <span className="text-[10px] text-muted-foreground/60 px-1">Dispatcher</span>

        <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-4 space-y-4">
          {/* Title */}
          <div>
            <p className="text-sm font-semibold">Rate your agent</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              How did <span className="text-foreground font-medium">{agentName}</span> do?
            </p>
          </div>

          <Separator className="opacity-30" />

          {/* Timer */}
          <div className={cn(
            'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
            expired
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          )}>
            <Timer size={11} />
            <span>Window closes in</span>
            <span className="font-mono font-bold ml-auto">{timeLeft}</span>
          </div>

          {/* Stars */}
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    size={28}
                    className={cn(
                      'transition-colors',
                      s <= displayStars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                    )}
                  />
                </button>
              ))}
            </div>
            {displayStars > 0 && (
              <p className="text-xs text-muted-foreground">{STAR_LABELS[displayStars]}</p>
            )}
          </div>

          {/* Comment */}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment…"
            rows={2}
            className="resize-none text-sm"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSkip} className="flex-1">
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={stars === 0 || loading || expired}
              className={cn('flex-1', stars > 0 && !expired && 'glow-purple')}
            >
              {loading ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
