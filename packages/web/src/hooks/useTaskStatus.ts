'use client';
import useSWR from 'swr';
import { getTask } from '@/lib/api';

export function useTaskStatus(taskId: string | null) {
  const { data, error } = useSWR(
    taskId ? `/api/tasks/${taskId}` : null,
    () => getTask(taskId!),
    {
      refreshInterval: (data) => {
        const status = data?.task?.status;
        if (!status || ['COMPLETED', 'ESCROW_RELEASED', 'FAILED', 'REFUNDED'].includes(status)) {
          return 0;
        }
        return 3000;
      },
    }
  );
  return { task: data?.task, isLoading: !error && !data, error };
}
