'use client';
import { useState, useEffect } from 'react';
import { Star, X, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Props {
  taskId: string;
  agentName: string;
  ratingWindowClosesAt: string;
  onSubmit: (stars: number, comment?: string) => Promise<void>;
  onSkip: () => void;
}

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function RatingModal({ taskId, agentName, ratingWindowClosesAt, onSubmit, onSkip }: Props) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(ratingWindowClosesAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        setExpired(true);
        return;
      }
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4">
          <div>
            <h2 className="font-semibold text-base">Rate Your Agent</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              How did <span className="text-foreground font-medium">{agentName}</span> do?
            </p>
          </div>
          <button
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-accent"
          >
            <X size={16} />
          </button>
        </div>

        <Separator />

        <div className="p-5 space-y-5">
          {/* Timer */}
          <div className={cn(
            'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
            expired
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          )}>
            <Timer size={12} />
            <span>Rating window closes in:</span>
            <span className="font-mono font-bold ml-auto">{timeLeft}</span>
          </div>

          {/* Stars */}
          <div className="space-y-2">
            <div className="flex gap-1.5 justify-center">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={32}
                    className={cn(
                      'transition-colors',
                      s <= displayStars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                    )}
                  />
                </button>
              ))}
            </div>
            {displayStars > 0 && (
              <p className="text-center text-sm text-muted-foreground animate-fade-in">
                {STAR_LABELS[displayStars]}
              </p>
            )}
          </div>

          {/* Comment */}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment about the agent's work…"
            rows={2}
            className="resize-none text-sm"
          />

          {/* Actions */}
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              onClick={onSkip}
              className="flex-1"
              size="sm"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={stars === 0 || loading || expired}
              className={cn('flex-1', stars > 0 && !expired && 'glow-purple')}
              size="sm"
            >
              {loading ? 'Submitting…' : 'Submit Rating'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
