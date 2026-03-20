import { getPrismaClient } from '@repo/database';
import { EscrowManager } from '../hedera/escrow';
import { getClient } from '../hedera/client';
import { config } from '../config';

const prisma = getPrismaClient();

export function startSlaMonitor(): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const overdueTasks = await prisma.task.findMany({
        where: {
          status: 'IN_PROGRESS',
          slaDeadline: { lt: new Date() },
        },
        include: { user: true, assignedWorker: true },
      });

      for (const task of overdueTasks) {
        console.log(`[SLA Monitor] Task ${task.id} missed SLA deadline, triggering refund`);

        try {
          const refundAmount = (task.escrowAmountHbar ?? 0) * (1 + 0.05); // gross + fee

          await prisma.$transaction([
            prisma.task.update({
              where: { id: task.id },
              data: { slaMet: false, status: 'REFUNDED' },
            }),
            // Mark platform fee as refunded — fee never retained on SLA breach
            prisma.transaction.updateMany({
              where: { taskId: task.id, type: 'PLATFORM_FEE' },
              data: { status: 'refunded' },
            }),
            ...(task.userId
              ? [
                  prisma.user.update({
                    where: { id: task.userId },
                    data: {
                      hbarBalance: { increment: refundAmount },
                      hbarSpent: { decrement: refundAmount },
                    },
                  }),
                  prisma.transaction.create({
                    data: {
                      taskId: task.id,
                      type: 'REFUND',
                      amountHbar: refundAmount,
                      fromAccount: config.hedera.operatorId,
                      toAccount: task.user?.hederaAccountId ?? task.userId,
                      status: 'completed',
                    },
                  }),
                ]
              : []),
          ]);

          // Log escrow refund to HCS
          if (task.escrowAmountHbar && config.topics.escrow) {
            try {
              const escrowManager = new EscrowManager(
                getClient(),
                config.hedera.operatorId,
                config.topics.escrow
              );
              await escrowManager.refundEscrow(task.id, task.escrowAmountHbar);
            } catch (err) {
              console.warn(`[SLA Monitor] Escrow refund HCS log failed for task ${task.id}:`, err);
            }
          }

          // Update agent SLA completion rate
          if (task.assignedWorker) {
            const worker = task.assignedWorker;
            const totalTasks = worker.tasksCompleted + 1;
            // SLA failed — successful count unchanged, denominator increases
            const newSlaRate = (worker.slaCompletionRate * worker.tasksCompleted) / totalTasks;
            await prisma.agent.update({
              where: { id: worker.id },
              data: {
                slaCompletionRate: Math.max(0, newSlaRate),
                tasksCompleted: { increment: 1 },
              },
            });
          }

          await prisma.chatMessage.create({
            data: {
              taskId: task.id,
              role: 'SYSTEM',
              content: 'SLA deadline exceeded. Your balance has been automatically refunded.',
            },
          });
        } catch (err) {
          console.error(`[SLA Monitor] Failed to process SLA breach for task ${task.id}:`, err);
        }
      }
    } catch (err) {
      console.warn('[SLA Monitor] Error:', err);
    }
  }, 10_000);
}
