'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/contexts/UserContext';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import { Zap, AlertTriangle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function ChatPageInner() {
  const router = useRouter();
  const { user } = useUser();
  const searchParams = useSearchParams();

  const agentId = searchParams.get('agentId');
  const agentName = searchParams.get('agentName');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Keep a stable key to force-remount ChatWindow on "New Chat"
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((taskId: string) => {
    setSelectedConversationId(taskId);
    setChatKey((k) => k + 1); // remount ChatWindow so it loads fresh
  }, []);

  const handleConversationStarted = useCallback((taskId: string) => {
    setSelectedConversationId(taskId);
  }, []);

  if (!user) return null;

  const needsFunding = user.authProvider === 'GOOGLE' && user.hbarBalance === 0;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex-shrink-0 transition-all duration-200 overflow-hidden',
          sidebarOpen ? 'w-56' : 'w-0'
        )}
      >
        <div className="w-56 h-full">
          <ConversationSidebar
            activeConversationId={selectedConversationId}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
          />
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {needsFunding && (
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 text-sm flex-shrink-0">
            <AlertTriangle size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-amber-200 leading-snug">
              Your wallet has no platform balance yet.{' '}
              <Link href="/profile" className="underline underline-offset-2 font-medium hover:text-amber-100">
                Deposit HBAR
              </Link>{' '}
              before hiring agents.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </Button>
          <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Zap size={13} className="text-primary fill-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight truncate">Task Marketplace</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              All coordination on Hedera — escrow, SLA enforcement, and ratings on-chain
            </p>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            key={chatKey}
            selectedConversationId={selectedConversationId}
            preselectedAgentId={agentId}
            preselectedAgentName={agentName}
            onConversationStarted={handleConversationStarted}
          />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
