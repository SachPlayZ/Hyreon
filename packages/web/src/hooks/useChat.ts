'use client';
import { useState, useCallback, useRef } from 'react';
import { sendChatMessage, createQuote, confirmTask, rateTask, skipRating as skipRatingApi, provideTaskInputs, getTask } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';

export type ChatPhase =
  | 'idle'
  | 'quoting'
  | 'awaiting_selection'
  | 'gathering_inputs'
  | 'executing'
  | 'rating_window'
  | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'dispatcher' | 'system' | 'quote' | 'progress';
  content: string;
  taskId?: string;
  verification?: any;
  timeline?: any[];
  quoteData?: {
    agents: any[];
    userBalance: number;
    taskId: string;
  };
  ratingData?: {
    taskId: string;
    agentName: string;
    ratingWindowClosesAt: string;
  };
  progressTaskId?: string;
  progressCollapsed?: boolean;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'dispatcher',
  content:
    "Hello! I'm the Hyreon Dispatcher. I can help you hire AI agents for tasks like **summarization**, **content generation**, and more — or just chat with me if you have questions about the platform.",
};

// Terminal statuses where the conversation is read-only
const TERMINAL_STATUSES = new Set([
  'COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED',
]);

export interface UseChatOpts {
  preselectedAgentId?: string | null;
  preselectedAgentName?: string | null;
}

export function useChat(opts?: UseChatOpts) {
  const { user, refreshBalance } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Track whether we've already auto-hired in this session to prevent re-triggering
  const autoHiredRef = useRef(false);

  const startNewChat = useCallback(() => {
    setMessages([WELCOME]);
    setPhase('idle');
    setPendingTaskId(null);
    setActiveTaskId(null);
    setIsReadOnly(false);
    autoHiredRef.current = false;
  }, []);

  const loadConversation = useCallback(async (taskId: string) => {
    setIsLoading(true);
    try {
      const data = await getTask(taskId);
      const task = data.task;

      const loaded: ChatMessage[] = (task.chatMessages ?? []).map((m: any) => {
        const isResult = m.metadata?.isResult === true;
        return {
          id: `db-${m.id}`,
          role: (m.role as string).toLowerCase() === 'user'
            ? 'user'
            : (m.role as string).toLowerCase() === 'system'
            ? 'system'
            : 'dispatcher',
          content: m.content,
          taskId: isResult ? task.id : undefined,
          verification: isResult ? {
            escrowTxId: m.metadata?.escrowTxId,
            escrowHashScanUrl: m.metadata?.escrowTxId
              ? `https://hashscan.io/testnet/transaction/${m.metadata.escrowTxId}` : undefined,
            releaseTxId: m.metadata?.releaseTxId,
            releaseHashScanUrl: m.metadata?.releaseTxId && m.metadata.releaseTxId !== 'offline'
              ? `https://hashscan.io/testnet/transaction/${m.metadata.releaseTxId}` : undefined,
            receiptTopicId: m.metadata?.receiptTopicId,
            receiptTopicHashScanUrl: m.metadata?.receiptTopicId
              ? `https://hashscan.io/testnet/topic/${m.metadata.receiptTopicId}` : undefined,
          } : undefined,
        };
      });

      // If the task has a result but no result chat message exists (legacy tasks),
      // add the result as a final message
      if (task.resultText && !loaded.some((m: ChatMessage) => m.verification)) {
        loaded.push({
          id: `db-result-${task.id}`,
          role: 'dispatcher',
          content: task.resultText,
          taskId: task.id,
        });
      }

      // Inject the progress accordion for tasks that have been executed
      // so users can expand it and see the step-by-step process with checkmarks
      const hasExecuted = [
        'IN_PROGRESS', 'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED', 'REFUNDED', 'FAILED',
      ].includes(task.status);
      if (hasExecuted) {
        // Find where to insert: after the user message, before the result
        const resultIdx = loaded.findIndex((m: ChatMessage) => m.verification || m.taskId);
        const insertAt = resultIdx >= 0 ? resultIdx : loaded.length;
        loaded.splice(insertAt, 0, {
          id: `progress-${task.id}`,
          role: 'progress',
          content: '',
          progressTaskId: task.id,
          progressCollapsed: true,
        });
      }

      setMessages(loaded.length > 0 ? loaded : [WELCOME]);
      setActiveTaskId(taskId);
      autoHiredRef.current = true; // prevent auto-hire when loading historical

      if (task.status === 'QUOTING') {
        // Re-hydrate the quote table from the stored quoteData
        const qd = task.quoteData as any;
        if (qd?.agents?.length) {
          loaded.push({
            id: `quote-${task.id}`,
            role: 'quote',
            content: `Task classified as **${qd.classifiedType ?? 'custom'}**. Here are available agents:`,
            quoteData: {
              agents: qd.agents,
              userBalance: task.user?.hbarBalance ?? 0,
              taskId: task.id,
            },
          });
        }
        setPhase('awaiting_selection');
        setPendingTaskId(taskId);
        setIsReadOnly(false);
      } else if (task.status === 'RATING_WINDOW' && !task.userRating && !task.ratingSkipped && !(task.ratings?.length > 0)) {
        setPhase('rating_window');
        setPendingTaskId(taskId);
        setIsReadOnly(false);
      } else if (task.status === 'GATHERING_INPUTS') {
        setPhase('gathering_inputs');
        setPendingTaskId(taskId);
        setIsReadOnly(false);
      } else if (TERMINAL_STATUSES.has(task.status)) {
        setPhase('done');
        setPendingTaskId(null);
        setIsReadOnly(true);
      } else {
        setPhase('done');
        setPendingTaskId(null);
        setIsReadOnly(false);
      }
    } catch (err) {
      console.warn('Failed to load conversation:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Shared handler for after confirmTask resolves
  const handleConfirmResult = useCallback(
    async (result: any, taskId: string) => {
      if (result.status === 'GATHERING_INPUTS') {
        setMessages((prev) => [
          ...prev,
          { id: `dispatcher-gather-${Date.now()}`, role: 'dispatcher', content: result.reply },
        ]);
        setPhase('gathering_inputs');
        setPendingTaskId(taskId);
      } else {
        await refreshBalance();
        setMessages((prev) => [
          ...prev,
          {
            id: `dispatcher-${Date.now()}`,
            role: 'dispatcher',
            content: result.reply,
            taskId: result.taskId,
            verification: result.verification,
            timeline: result.timeline,
          },
        ]);
        if (result.status === 'RATING_WINDOW' && result.taskId) {
          setPhase('rating_window');
          setPendingTaskId(result.taskId);
        } else {
          setPhase('done');
          setPendingTaskId(null);
        }
      }
    },
    [refreshBalance]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user) return;

      // Gathering inputs phase
      if (phase === 'gathering_inputs' && pendingTaskId) {
        const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
        try {
          const result = await provideTaskInputs(pendingTaskId, user.id, content);
          if (result.status === 'GATHERING_INPUTS') {
            setMessages((prev) => [
              ...prev,
              { id: `dispatcher-input-${Date.now()}`, role: 'dispatcher', content: result.reply },
            ]);
          } else {
            await refreshBalance();
            setMessages((prev) => [
              ...prev,
              {
                id: `dispatcher-${Date.now()}`,
                role: 'dispatcher',
                content: result.reply,
                taskId: result.taskId,
                verification: result.verification,
                timeline: result.timeline,
              },
            ]);
            if (result.status === 'RATING_WINDOW' && result.taskId) {
              setPhase('rating_window');
              setPendingTaskId(result.taskId);
            } else {
              setPhase('done');
              setPendingTaskId(null);
            }
          }
        } catch (err: any) {
          setMessages((prev) => [
            ...prev,
            { id: `error-${Date.now()}`, role: 'system', content: `Error: ${err.message}` },
          ]);
          setPhase('idle');
          setPendingTaskId(null);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Show user message
      const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      // Auto-hire flow: detect intent first, only hire if it's a task request
      if (opts?.preselectedAgentId && !autoHiredRef.current && phase === 'idle') {
        autoHiredRef.current = true;
        try {
          // First check if the message is actually a task request
          const chatResult = await sendChatMessage(user.id, content);

          if (chatResult.type === 'conversation') {
            // Not a task — just reply conversationally
            setMessages((prev) => [
              ...prev,
              { id: `dispatcher-${Date.now()}`, role: 'dispatcher', content: chatResult.reply },
            ]);
            setPhase('idle');
            autoHiredRef.current = false; // allow re-try with a real task
            setIsLoading(false);
            return;
          }

          // It's a task — proceed with auto-hire
          setPhase('executing');
          const taskId = chatResult.taskId;
          setActiveTaskId(taskId);

          const progressId = `progress-${taskId}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `dispatcher-exec-${Date.now()}`,
              role: 'dispatcher',
              content: `Hiring **${opts.preselectedAgentName ?? 'your selected agent'}** and processing your task on Hedera...`,
            },
            { id: progressId, role: 'progress', content: '', progressTaskId: taskId },
          ]);

          const result = await confirmTask(taskId, user.id, opts.preselectedAgentId!);

          if (result.status === 'GATHERING_INPUTS') {
            setMessages((prev) => prev.filter((m) => m.id !== progressId));
          }

          await handleConfirmResult(result, taskId);
        } catch (err: any) {
          setMessages((prev) => [
            ...prev,
            { id: `error-${Date.now()}`, role: 'system', content: `Error: ${err.message}` },
          ]);
          setPhase('idle');
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Smart flow: detect intent — either create quote or respond conversationally
      setPhase('quoting');
      try {
        const result = await sendChatMessage(user.id, content);

        if (result.type === 'conversation') {
          // Conversational reply — no task created
          setMessages((prev) => [
            ...prev,
            { id: `dispatcher-${Date.now()}`, role: 'dispatcher', content: result.reply },
          ]);
          setPhase('idle');
        } else {
          // Task quote
          setActiveTaskId(result.taskId);
          setMessages((prev) => [
            ...prev,
            {
              id: `quote-${Date.now()}`,
              role: 'quote',
              content: `Task classified as **${result.classifiedType ?? 'custom'}**. Here are available agents:`,
              quoteData: {
                agents: result.agents,
                userBalance: result.userBalance,
                taskId: result.taskId,
              },
            },
          ]);
          setPendingTaskId(result.taskId);
          setPhase('awaiting_selection');
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, role: 'system', content: `Error: ${err.message}` },
        ]);
        setPhase('idle');
      } finally {
        setIsLoading(false);
      }
    },
    [user, phase, pendingTaskId, opts?.preselectedAgentId, opts?.preselectedAgentName, handleConfirmResult, refreshBalance]
  );

  const selectAgent = useCallback(
    async (agentId: string, taskId: string) => {
      if (!user) return;

      setIsLoading(true);
      setPhase('executing');

      const progressId = `progress-${taskId}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `dispatcher-exec-${Date.now()}`,
          role: 'dispatcher',
          content: 'Agent hired. Processing your task on Hedera...',
        },
        // Push the live accordion immediately — remove it if we end up in gathering_inputs
        { id: progressId, role: 'progress', content: '', progressTaskId: taskId },
      ]);

      try {
        const result = await confirmTask(taskId, user.id, agentId);

        if (result.status === 'GATHERING_INPUTS') {
          // Task isn't executing yet — remove the accordion until inputs are done
          setMessages((prev) => prev.filter((m) => m.id !== progressId));
        }

        await handleConfirmResult(result, taskId);
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== progressId));
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, role: 'system', content: `Error: ${err.message}` },
        ]);
        setPhase('idle');
      } finally {
        setIsLoading(false);
      }
    },
    [user, handleConfirmResult]
  );

  const submitRating = useCallback(
    async (taskId: string, stars: number, comment?: string) => {
      if (!user) return;
      try {
        await rateTask(taskId, user.id, stars, comment);
        setMessages((prev) => [
          ...prev,
          {
            id: `rating-${Date.now()}`,
            role: 'dispatcher',
            content: `Thank you for rating! Your feedback helps improve agent reputation scores on-chain.`,
          },
        ]);
      } catch (err: any) {
        console.warn('Rating failed:', err);
      }
      setPhase('done');
      setPendingTaskId(null);
    },
    [user]
  );

  const skipRating = useCallback(async () => {
    if (user && pendingTaskId) {
      try { await skipRatingApi(pendingTaskId, user.id); } catch (err) { console.warn('Failed to persist skip-rating:', err); }
    }
    setPhase('done');
    setPendingTaskId(null);
  }, [user, pendingTaskId]);

  return {
    messages,
    sendMessage,
    selectAgent,
    submitRating,
    skipRating,
    loadConversation,
    startNewChat,
    isLoading,
    phase,
    pendingTaskId,
    activeTaskId,
    isReadOnly,
  };
}
