import { getPrismaClient } from '@repo/database';
import { getClient } from '../hedera/client';
import { writeReputationUpdate } from '../hedera/receipts';
import type { ReputationBreakdown } from '@repo/shared';

const prisma = getPrismaClient();

export function computeReputation(agent: {
  ratingAvg: number;
  slaCompletionRate: number;
  tasksCompleted: number;
  disputeRate: number;
}): number {
  const ratingScore = (agent.ratingAvg / 5) * 0.4;
  const slaScore = agent.slaCompletionRate * 0.35;
  const experienceScore = Math.min(1, Math.log10(agent.tasksCompleted + 1) / 3) * 0.15;
  const trustScore = (1 - agent.disputeRate) * 0.10;
  return ratingScore + slaScore + experienceScore + trustScore;
}

export function buildReputationBreakdown(agentId: string, agent: {
  ratingAvg: number;
  slaCompletionRate: number;
  tasksCompleted: number;
  disputeRate: number;
  totalRatings: number;
}): ReputationBreakdown {
  const compositeScore = computeReputation(agent);
  return {
    agentId,
    compositeScore,
    ratingScore: (agent.ratingAvg / 5) * 0.4,
    slaScore: agent.slaCompletionRate * 0.35,
    experienceScore: Math.min(1, Math.log10(agent.tasksCompleted + 1) / 3) * 0.15,
    trustScore: (1 - agent.disputeRate) * 0.10,
    totalRatings: agent.totalRatings,
    ratingAvg: agent.ratingAvg,
    slaCompletionRate: agent.slaCompletionRate,
    tasksCompleted: agent.tasksCompleted,
    disputeRate: agent.disputeRate,
  };
}

export async function recomputeAndSaveReputation(agentId: string, reputationTopicId?: string): Promise<number> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const newScore = computeReputation({
    ratingAvg: agent.ratingAvg,
    slaCompletionRate: agent.slaCompletionRate,
    tasksCompleted: agent.tasksCompleted,
    disputeRate: agent.disputeRate,
  });

  await prisma.agent.update({
    where: { id: agentId },
    data: { reputationScore: newScore },
  });

  if (reputationTopicId) {
    try {
      await writeReputationUpdate(getClient(), reputationTopicId, {
        agentId,
        newScore,
        ratingAvg: agent.ratingAvg,
        slaCompletionRate: agent.slaCompletionRate,
        tasksCompleted: agent.tasksCompleted,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Reputation] Failed to write reputation to HCS:', err);
    }
  }

  return newScore;
}
