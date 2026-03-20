'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import { getTask, rateTask } from '@/lib/api';
import { OnChainProof } from '@/components/verification/OnChainProof';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Star, Clock, CheckCircle, XCircle, MessageSquare,
  FileText, Cpu, Hash, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TERMINAL = ['COMPLETED', 'FAILED', 'ESCROW_RELEASED', 'REFUNDED'];

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const { data, error, isLoading, mutate } = useSWR(`task-${id}`, () => getTask(id), {
    refreshInterval: (data) => {
      const s = data?.task?.status;
      return s && TERMINAL.includes(s) ? 0 : 3000;
    },
  });
  const [ratingStars, setRatingStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Alert variant="destructive">
          <AlertDescription>Task not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { task } = data ?? {};
  if (!task) return null;

  const canRate =
    !ratingDone &&
    user &&
    task.userId === user.id &&
    task.status === 'RATING_WINDOW' &&
    task.ratingWindowClosesAt &&
    new Date(task.ratingWindowClosesAt) > new Date();

  const handleRate = async () => {
    if (!user || ratingStars === 0) return;
    setRatingLoading(true);
    try {
      await rateTask(task.id, user.id, ratingStars, ratingComment.trim() || undefined);
      setRatingDone(true);
      mutate();
    } catch (err: any) {
      console.error('Rating failed:', err);
    } finally {
      setRatingLoading(false);
    }
  };

  const displayStars = hoveredStar || ratingStars;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-xl font-bold tracking-tight">Task Details</h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-muted-foreground/50 text-xs font-mono">{task.id}</p>
        </div>
      </div>

      {/* Request */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
            <MessageSquare size={13} /> Request
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed">{task.userMessage}</p>
        </CardContent>
      </Card>

      {/* Task info (SLA / fee) */}
      {(task.slaDeadline || task.platformFeeHbar || task.slaMet !== null) && (
        <Card className="border-border/60">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
              <Cpu size={13} /> Execution Info
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {task.slaMet !== null && task.slaMet !== undefined && (
                <div className="flex items-center gap-2">
                  {task.slaMet
                    ? <CheckCircle size={14} className="text-emerald-400" />
                    : <XCircle size={14} className="text-destructive" />}
                  <span className={task.slaMet ? 'text-emerald-400' : 'text-destructive'}>
                    SLA {task.slaMet ? 'met' : 'missed'}
                  </span>
                </div>
              )}
              {task.platformFeeHbar != null && (
                <div className="text-muted-foreground text-xs">
                  Platform fee{' '}
                  <span className="text-foreground font-mono">{task.platformFeeHbar.toFixed(4)} ℏ</span>
                </div>
              )}
              {task.slaDeadline && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs col-span-2">
                  <Clock size={12} />
                  SLA deadline: <span className="text-foreground">{formatDate(task.slaDeadline)}</span>
                </div>
              )}
              {task.userRating && (
                <div className="flex items-center gap-1 text-amber-400 col-span-2">
                  {Array.from({ length: task.userRating }).map((_, i) => (
                    <Star key={i} size={13} fill="currentColor" />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">Your rating</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {task.resultText && (
        <Card className="border-border/60">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
              <FileText size={13} /> Result
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{task.resultText}</p>
          </CardContent>
        </Card>
      )}

      {/* Rating form */}
      {canRate && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star size={14} className="text-amber-400" />
              Rate this Agent
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              Window closes {formatDate(task.ratingWindowClosesAt)}
            </p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRatingStars(s)}
                  onMouseEnter={() => setHoveredStar(s)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={26}
                    className={cn(
                      'transition-colors',
                      s <= displayStars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                    )}
                  />
                </button>
              ))}
            </div>
            <Textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Optional comment…"
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              onClick={handleRate}
              disabled={ratingStars === 0 || ratingLoading}
              className={cn('gap-2', ratingStars > 0 && 'glow-purple')}
            >
              <CheckCircle2 size={14} />
              {ratingLoading ? 'Submitting…' : 'Submit Rating'}
            </Button>
          </CardContent>
        </Card>
      )}

      {ratingDone && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <AlertDescription className="text-emerald-400 text-sm">
            Rating submitted. Thank you for your feedback!
          </AlertDescription>
        </Alert>
      )}

      {/* Timeline */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
            <Hash size={13} /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(task.chatMessages ?? []).length === 0 ? (
            <p className="text-muted-foreground/50 text-xs">No messages yet</p>
          ) : (
            <div className="space-y-2">
              {(task.chatMessages ?? []).map((msg: any) => (
                <div key={msg.id} className="flex gap-3 text-xs">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] h-5 flex-shrink-0 font-mono',
                      msg.role === 'USER' && 'border-primary/30 text-primary',
                      msg.role === 'SYSTEM' && 'border-destructive/30 text-destructive',
                      msg.role !== 'USER' && msg.role !== 'SYSTEM' && 'border-border/40 text-muted-foreground'
                    )}
                  >
                    {msg.role}
                  </Badge>
                  <span className="text-foreground/80 flex-1 leading-relaxed">{msg.content.replace(/<[^>]*>/g, '')}</span>
                  <span className="text-muted-foreground/40 flex-shrink-0 text-[10px] pt-0.5">
                    {formatDate(msg.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(task.status === 'COMPLETED' || task.status === 'ESCROW_RELEASED' || task.status === 'RATING_WINDOW') && (
        <OnChainProof
          taskId={task.id}
          escrowTxId={task.escrowTxId}
          releaseTxId={task.releaseTxId}
          receiptTopicId={task.receiptTopicId}
          receiptSequenceNumber={task.receiptSequenceNumber}
          resultHash={task.resultHash}
          slaMet={task.slaMet}
          platformFeeHbar={task.platformFeeHbar}
        />
      )}
    </div>
  );
}
