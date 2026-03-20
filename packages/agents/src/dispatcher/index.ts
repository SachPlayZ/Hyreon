import { getPrismaClient } from '@repo/database';
import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { getClient } from '../hedera/client';
import { DispatcherOrchestrator } from './orchestrator';
import { recomputeAndSaveReputation } from './reputation';
import { writeRatingReceipt } from '../hedera/receipts';
import { config } from '../config';
import type { QuoteResult } from '@repo/shared';

const prisma = getPrismaClient();

export class DispatcherAgent {
  private orchestrator: DispatcherOrchestrator;
  private ratingTopicId: string;
  private reputationTopicId: string;

  constructor(
    hcs10Client: HCS10Client,
    escrowTopicId: string,
    receiptTopicId: string,
    reputationTopicId = '',
    ratingTopicId = ''
  ) {
    this.ratingTopicId = ratingTopicId;
    this.reputationTopicId = reputationTopicId;
    this.orchestrator = new DispatcherOrchestrator(
      hcs10Client,
      escrowTopicId,
      receiptTopicId,
      reputationTopicId,
      ratingTopicId
    );
  }

  async createQuote(userId: string, message: string): Promise<QuoteResult> {
    return this.orchestrator.createQuote(userId, message);
  }

  async confirmTask(
    taskId: string,
    userId: string,
    selectedAgentId: string
  ): Promise<{ taskId: string; reply: string; status: string; timeline: any[]; verification: any; slaMet?: boolean; platformFeeHbar?: number }> {
    try {
      // Check if this is a third-party agent that needs input gathering
      const worker = await prisma.agent.findUnique({ where: { id: selectedAgentId } });
      if (worker?.isThirdParty && worker.exampleRequestBody) {
        // Only gather inputs if we don't already have them (prevents re-asking after processUserInputs)
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task?.requestBody) {
          const gatherResult = await this.orchestrator.gatherInputs(taskId, userId, selectedAgentId);
          return {
            taskId: gatherResult.taskId,
            reply: gatherResult.question,
            status: 'GATHERING_INPUTS',
            timeline: [],
            verification: {},
          };
        }
      }

      const result = await this.orchestrator.confirmAndExecute(taskId, userId, selectedAgentId);
      return {
        taskId: result.taskId,
        reply: result.result,
        status: result.status,
        timeline: result.timeline,
        verification: result.verification,
        slaMet: result.slaMet,
        platformFeeHbar: result.platformFeeHbar,
      };
    } catch (error: any) {
      return {
        taskId,
        reply: `I encountered an error processing your task: ${error.message}`,
        status: 'FAILED',
        timeline: [],
        verification: {},
      };
    }
  }

  async processUserInputs(taskId: string, userId: string, message: string) {
    return this.orchestrator.processUserInputs(taskId, userId, message);
  }

  async rateTask(
    taskId: string,
    userId: string,
    stars: number,
    comment?: string
  ): Promise<{ success: boolean; message: string; newReputationScore?: number }> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignedWorker: true },
    });

    if (!task) return { success: false, message: 'Task not found' };
    if (task.userId !== userId) return { success: false, message: 'Unauthorized' };

    if (task.status !== 'RATING_WINDOW' && task.status !== 'COMPLETED') {
      return { success: false, message: 'Task is not in rating window' };
    }

    if (task.ratingWindowClosesAt && new Date() > task.ratingWindowClosesAt) {
      return { success: false, message: 'Rating window has closed' };
    }

    if (stars < 1 || stars > 5) {
      return { success: false, message: 'Stars must be between 1 and 5' };
    }

    if (!task.assignedWorkerId) return { success: false, message: 'No worker assigned to task' };

    const worker = task.assignedWorker!;

    // Save rating to DB
    const rating = await prisma.rating.create({
      data: {
        taskId,
        agentId: task.assignedWorkerId,
        stars,
        comment,
      },
    });

    // Update agent rating average
    const newTotalRatings = worker.totalRatings + 1;
    const newRatingAvg = (worker.ratingAvg * worker.totalRatings + stars) / newTotalRatings;
    await prisma.agent.update({
      where: { id: task.assignedWorkerId },
      data: { ratingAvg: newRatingAvg, totalRatings: newTotalRatings },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { userRating: stars, userComment: comment },
    });

    // Log to HCS
    let onChainTxId: string | undefined;
    if (this.ratingTopicId) {
      try {
        const hcsResult = await writeRatingReceipt(getClient(), this.ratingTopicId, {
          taskId,
          agentId: task.assignedWorkerId,
          stars,
          comment,
          ratedAt: new Date().toISOString(),
        });
        onChainTxId = hcsResult.txId;
        await prisma.rating.update({
          where: { id: rating.id },
          data: { loggedOnChainTxId: onChainTxId },
        });
      } catch (err) {
        console.warn('[rateTask] Failed to log rating to HCS:', err);
      }
    }

    // Recompute reputation
    let newReputationScore: number | undefined;
    try {
      newReputationScore = await recomputeAndSaveReputation(
        task.assignedWorkerId,
        this.reputationTopicId || undefined
      );
    } catch (err) {
      console.warn('[rateTask] Failed to recompute reputation:', err);
    }

    return {
      success: true,
      message: 'Rating submitted successfully',
      newReputationScore,
    };
  }
}
