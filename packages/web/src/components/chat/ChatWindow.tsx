'use client';
import { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { LiveTaskAccordion } from './LiveTaskAccordion';
import { ChatInput } from './ChatInput';
import { AgentQuoteTable } from './AgentQuoteTable';
import { InlineRating } from './InlineRating';
import { useChat } from '@/hooks/useChat';
import { useUser } from '@/contexts/UserContext';
import { getTask } from '@/lib/api';
import { Loader2, Zap, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_HINTS = [
  'Summarize this article for me…',
  'Write a blog post about Hedera hashgraph…',
  'Create a Twitter thread about DeFi trends…',
  'Draft a product description for my app…',
];

interface Props {
  /** Task ID to load on mount / when it changes. null = fresh chat. */
  selectedConversationId?: string | null;
  /** Pre-selected agent ID (from direct-hire flow). */
  preselectedAgentId?: string | null;
  preselectedAgentName?: string | null;
  /** Called whenever activeTaskId changes so parent can sync the sidebar. */
  onConversationStarted?: (taskId: string) => void;
}

export function ChatWindow({
  selectedConversationId,
  preselectedAgentId,
  preselectedAgentName,
  onConversationStarted,
}: Props) {
  const { user } = useUser();
  const {
    messages,
    sendMessage,
    selectAgent,
    submitRating,
    skipRating,
    loadConversation,
    isLoading,
    phase,
    pendingTaskId,
    activeTaskId,
    isReadOnly,
  } = useChat({ preselectedAgentId, preselectedAgentName });

  const bottomRef = useRef<HTMLDivElement>(null);
  const [ratingTask, setRatingTask] = useState<any>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  // Load a specific historical conversation when selectedConversationId changes
  useEffect(() => {
    if (selectedConversationId) {
      loadConversation(selectedConversationId);
    }
    // selectedConversationId === null means "new chat" — handled by startNewChat in parent
  }, [selectedConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inform parent when a new task is created in this session
  useEffect(() => {
    if (activeTaskId) onConversationStarted?.(activeTaskId);
  }, [activeTaskId, onConversationStarted]);

  // Fetch ratingTask when entering rating_window
  useEffect(() => {
    if (phase === 'rating_window' && pendingTaskId) {
      getTask(pendingTaskId)
        .then((data) => setRatingTask(data.task))
        .catch(() => {});
    } else {
      setRatingTask(null);
    }
  }, [phase, pendingTaskId]);

  const isEmpty = messages.length <= 1 && messages[0]?.id === 'welcome';

  return (
    <div className="flex flex-col h-full relative">
      {/* Pre-selected agent banner */}
      {preselectedAgentId && phase === 'idle' && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-primary/5 border-b border-primary/20 text-xs">
          <Bot size={13} className="text-primary flex-shrink-0" />
          <span className="text-muted-foreground">
            Hiring <span className="text-foreground font-medium">{preselectedAgentName ?? 'agent'}</span> directly —
            describe your task and we'll process it immediately.
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty && !preselectedAgentId ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-6">
            <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-purple">
              <Zap size={24} className="text-primary fill-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Hire an AI Agent</h2>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                Describe your task below. Our agents will quote, execute, and log everything on Hedera.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {EMPTY_HINTS.map((hint) => (
                <button
                  key={hint}
                  onClick={() => sendMessage(hint)}
                  disabled={isLoading}
                  className="text-left px-4 py-2.5 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-accent/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'progress' && msg.progressTaskId ? (
                  <LiveTaskAccordion taskId={msg.progressTaskId} defaultCollapsed={msg.progressCollapsed} />
                ) : msg.role === 'quote' && msg.quoteData ? (
                  <div className={cn('flex mb-4 gap-3', 'justify-start')}>
                    <div className="size-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                      D
                    </div>
                    <div className="max-w-[85%] space-y-2">
                      <span className="text-[10px] text-muted-foreground/60 px-1">Dispatcher</span>
                      <div
                        className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-foreground"
                        dangerouslySetInnerHTML={{
                          __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                        }}
                      />
                      <AgentQuoteTable
                        agents={msg.quoteData.agents}
                        userBalance={msg.quoteData.userBalance}
                        onHire={(agentId) => selectAgent(agentId, msg.quoteData!.taskId)}
                        disabled={isLoading || phase === 'executing'}
                      />
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    role={msg.role as any}
                    content={msg.content}
                    verification={msg.verification}
                  />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 mb-4">
                <div className="size-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Loader2 size={13} className="text-primary animate-spin" />
                </div>
                <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3 text-muted-foreground text-sm flex items-center gap-2">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="size-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="size-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="text-xs">
                    {phase === 'quoting'
                      ? 'Classifying task and fetching quotes…'
                      : phase === 'gathering_inputs'
                      ? 'Processing your inputs…'
                      : 'Processing on Hedera…'}
                  </span>
                </div>
              </div>
            )}

            {phase === 'rating_window' && ratingTask && (
              <InlineRating
                agentName={ratingTask.assignedWorker?.name ?? 'Agent'}
                ratingWindowClosesAt={
                  ratingTask.ratingWindowClosesAt ?? new Date(Date.now() + 600000).toISOString()
                }
                onSubmit={(stars, comment) => submitRating(ratingTask.id, stars, comment)}
                onSkip={skipRating}
              />
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input — hidden for completed read-only historical conversations */}
      {isReadOnly ? (
        <div className="px-4 py-3 border-t border-border/60 bg-background/80 text-center text-xs text-muted-foreground/50">
          This conversation has ended.
        </div>
      ) : (
        <ChatInput
          onSend={sendMessage}
          disabled={isLoading || phase === 'awaiting_selection' || phase === 'executing'}
        />
      )}
    </div>
  );
}
