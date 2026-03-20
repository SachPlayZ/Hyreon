import { Badge } from '@/components/ui/badge';
import { STATUS_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  return (
    <Badge variant="outline" className={cn('text-xs font-medium border', color)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
