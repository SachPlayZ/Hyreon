import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  role: 'user' | 'dispatcher' | 'system' | string;
  content: string;
  verification?: any;
  timestamp?: string;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[(.*?)\]\((.*?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:opacity-80">$1</a>'
    )
    .replace(/\n/g, '<br/>');
}

const ROLE_LABEL: Record<string, string> = {
  dispatcher: 'Dispatcher',
  system: 'System',
};

export function MessageBubble({ role, content, verification, timestamp }: Props) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <div className={cn('flex mb-4 gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className={cn(
          'size-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
          isSystem
            ? 'bg-destructive/20 border border-destructive/30 text-destructive'
            : 'bg-primary/20 border border-primary/30 text-primary'
        )}>
          {isSystem ? 'S' : 'D'}
        </div>
      )}

      <div className={cn('max-w-[80%] flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
        {!isUser && (
          <span className="text-[10px] text-muted-foreground/60 px-1">
            {ROLE_LABEL[role] ?? role}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : isSystem
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
              : 'bg-card border border-border/60 text-foreground rounded-tl-sm'
          )}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />

        {verification && (verification.escrowTxId || verification.releaseTxId) && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 space-y-1.5 w-full">
            <p className="font-semibold text-emerald-300 text-[11px] uppercase tracking-wide mb-1">On-Chain Verification</p>
            {[
              { url: verification.escrowHashScanUrl, label: 'Escrow TX' },
              { url: verification.releaseHashScanUrl, label: 'Payment TX' },
              { url: verification.receiptTopicHashScanUrl, label: 'Receipt Topic' },
              { url: verification.ratingTopicId ? `https://hashscan.io/testnet/topic/${verification.ratingTopicId}` : null, label: 'Rating Topic' },
            ].filter(({ url }) => !!url).map(({ url, label }) => (
              <a
                key={label}
                href={url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-emerald-200 transition-colors"
              >
                <ExternalLink size={10} /> {label}
              </a>
            ))}
          </div>
        )}

        {timestamp && (
          <span className="text-[10px] text-muted-foreground/40 px-1">{formatDate(timestamp)}</span>
        )}
      </div>
    </div>
  );
}
