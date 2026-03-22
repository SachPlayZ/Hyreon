import { getPrismaClient } from '@repo/database';
import { recomputeAndSaveReputation } from '../dispatcher/reputation';
import { config } from '../config';

const prisma = getPrismaClient();

export function startRatingWindowCloser(): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const expiredWindows = await prisma.task.findMany({
        where: {
          status: 'RATING_WINDOW',
          ratingWindowClosesAt: { lt: new Date() },
        },
      });

      for (const task of expiredWindows) {
        console.log(`[Rating Closer] Closing rating window for task ${task.id}`);

        try {
          // Atomically check status is still RATING_WINDOW to avoid race with user submitting rating
          const updated = await prisma.task.updateMany({
            where: { id: task.id, status: 'RATING_WINDOW' },
            data: { status: 'COMPLETED' },
          });
          if (updated.count === 0) continue; // already changed by rating submission

          if (task.assignedWorkerId) {
            await recomputeAndSaveReputation(
              task.assignedWorkerId,
              config.topics.reputation || undefined
            );
          }
        } catch (err) {
          console.error(`[Rating Closer] Failed to close rating window for task ${task.id}:`, err);
        }
      }
    } catch (err) {
      console.warn('[Rating Closer] Error:', err);
    }
  }, 30_000);
}
