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
          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'COMPLETED' },
          });

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
