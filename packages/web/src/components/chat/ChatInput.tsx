'use client';
import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="p-4 border-t border-border/60 bg-background/80 backdrop-blur-sm">
      <div className={cn(
        'flex items-end gap-2 rounded-2xl border transition-colors p-1.5 pr-2',
        disabled ? 'border-border/40 opacity-60' : 'border-border/60 focus-within:border-primary/40 focus-within:bg-card/60'
      )}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a task for our agents…"
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none text-sm px-2.5 py-1.5 max-h-[120px]"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'size-8 rounded-xl flex-shrink-0 transition-all',
            canSend ? 'glow-purple' : 'opacity-30'
          )}
        >
          <ArrowUp size={15} />
        </Button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground/30 mt-2">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
