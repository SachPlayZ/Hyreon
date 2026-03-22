'use client';
import useSWR from 'swr';
import { getTasks } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { SquarePen, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  COMPLETED:       { label: 'Done',      color: 'text-emerald-400' },
  ESCROW_RELEASED: { label: 'Done',      color: 'text-emerald-400' },
  RATING_WINDOW:   { label: 'Rate',      color: 'text-amber-400'   },
  REFUNDED:        { label: 'Refunded',  color: 'text-blue-400'    },
  FAILED:          { label: 'Failed',    color: 'text-destructive'  },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  activeConversationId: string | null;
  onSelect: (taskId: string) => void;
  onNewChat: () => void;
}

export function ConversationSidebar({ activeConversationId, onSelect, onNewChat }: Props) {
  const { user } = useUser();
  const { data, isLoading } = useSWR(
    user ? `convs-${user.id}` : null,
    () => getTasks({ userId: user!.id }),
    {
      refreshInterval: (latestData: any) => {
        const tasks: any[] = latestData?.tasks ?? [];
        const allTerminal = tasks.length > 0 && tasks.every((t: any) =>
          ['COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED'].includes(t.status)
        );
        return allTerminal ? 0 : 5000;
      },
    }
  );

  const conversations: any[] = data?.tasks ?? [];

  return (
    <div className="flex flex-col h-full border-r border-border/60 bg-background/40">
      {/* New Chat button */}
      <div className="p-3 border-b border-border/40 flex-shrink-0">
        <Button
          onClick={onNewChat}
          variant="outline"
          size="sm"
          className="w-full gap-2 justify-start text-xs"
        >
          <SquarePen size={12} />
          New Chat
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 px-1.5">
        {isLoading && (
          <div className="px-3 py-6 text-xs text-muted-foreground/50 text-center">Loading…</div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-muted-foreground/40">
            <MessageSquare size={18} />
            <p className="text-xs">No chats yet</p>
          </div>
        )}

        {conversations.map((task: any) => {
          const isActive = task.id === activeConversationId;
          const statusCfg = STATUS_CONFIG[task.status];
          const isLive = !statusCfg && !['COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED'].includes(task.status);

          return (
            <button
              key={task.id}
              onClick={() => onSelect(task.id)}
              className={cn(
                'w-full text-left px-2.5 py-2 rounded-lg transition-colors group space-y-1',
                isActive
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-accent/40 border border-transparent'
              )}
            >
              <p className={cn(
                'text-xs leading-snug line-clamp-2 break-words',
                isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
              )}>
                {task.userMessage}
              </p>

              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] text-muted-foreground/40 truncate">
                  {timeAgo(task.createdAt)}
                </span>
                {statusCfg ? (
                  <span className={cn('text-[10px] font-medium flex-shrink-0', statusCfg.color)}>
                    {statusCfg.label}
                  </span>
                ) : isLive ? (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 flex-shrink-0">
                    <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Live
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
