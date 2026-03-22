import { getPrismaClient } from '@repo/database';
import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { getClient } from '../hedera/client';
import { EscrowManager } from '../hedera/escrow';
import { writeReceipt, computeResultHash } from '../hedera/receipts';
import { sendMessageOnConnection, getNewMessages } from '../hcs10/messaging';
import { classifyTask, matchAgents, extractFieldsFromMessage, formatResponseForUser, generateInputQuestion } from './classifier';
import { recomputeAndSaveReputation } from './reputation';
import { config, platformFeePercent } from '../config';
import { getHashScanTxUrl, getHashScanTopicUrl } from '../hedera/mirror';
import type { QuoteResult, QuoteAgent } from '@repo/shared';

const prisma = getPrismaClient();

export interface OrchestratorResult {
  taskId: string;
  result: string;
  status: string;
  timeline: TimelineStep[];
  verification: VerificationLinks;
  slaMet?: boolean;
  platformFeeHbar?: number;
}

export interface TimelineStep {
  step: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  timestamp?: string;
  txId?: string;
  hashScanUrl?: string;
}

export interface VerificationLinks {
  escrowTxId?: string;
  escrowHashScanUrl?: string;
  releaseTxId?: string;
  releaseHashScanUrl?: string;
  receiptTopicId?: string;
  receiptTopicHashScanUrl?: string;
  receiptSequenceNumber?: number;
  resultHash?: string;
  ratingTopicId?: string;
  reputationTopicId?: string;
}

export class DispatcherOrchestrator {
  private hcs10Client: HCS10Client;
  private escrowManager: EscrowManager;
  private escrowTopicId: string;
  private receiptTopicId: string;
  private reputationTopicId: string;
  private ratingTopicId: string;

  constructor(
    hcs10Client: HCS10Client,
    escrowTopicId: string,
    receiptTopicId: string,
    reputationTopicId = '',
    ratingTopicId = ''
  ) {
    this.hcs10Client = hcs10Client;
    this.escrowTopicId = escrowTopicId;
    this.receiptTopicId = receiptTopicId;
    this.reputationTopicId = reputationTopicId;
    this.ratingTopicId = ratingTopicId;
    this.escrowManager = new EscrowManager(getClient(), config.hedera.operatorId, escrowTopicId);
  }

  async createQuote(userId: string, userMessage: string): Promise<QuoteResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // 1. Get all active worker agents
    const allWorkers = await prisma.agent.findMany({
      where: { type: 'WORKER', status: 'active' },
    });

    const thirdPartyAgents = allWorkers.filter((a) => a.isThirdParty);
    const platformAgents = allWorkers.filter((a) => !a.isThirdParty);

    // 2. Semantic matching for third-party agents
    let thirdPartyMatches: QuoteAgent[] = [];
    if (thirdPartyAgents.length > 0) {
      try {
        const matches = await matchAgents(userMessage, thirdPartyAgents.map((a) => ({
          id: a.id, name: a.name, description: a.description, taskName: a.taskName, capability: a.capability,
        })));
        thirdPartyMatches = matches.map((m) => {
          const a = thirdPartyAgents.find((ag) => ag.id === m.agentId)!;
          return {
            agent_id: a.id,
            name: a.name,
            price_hbar: a.rateHbar,
            sla_seconds: a.slaSeconds,
            rating_avg: a.ratingAvg,
            reputation_score: a.reputationScore,
            tasks_completed: a.tasksCompleted,
            is_third_party: true,
            description: a.description ?? undefined,
            relevance_score: m.relevanceScore,
            relevance_reasoning: m.reasoning,
          };
        });
      } catch (err) {
        console.warn('[Orchestrator] Semantic matching failed:', err);
      }
    }

    // 3. Legacy classification for platform agents
    let platformMatches: QuoteAgent[] = [];
    let classifiedType: 'SUMMARIZATION' | 'CONTENT_GENERATION' | undefined;
    if (platformAgents.length > 0) {
      try {
        const classification = await classifyTask(userMessage);
        classifiedType = classification.type.toUpperCase() as 'SUMMARIZATION' | 'CONTENT_GENERATION';
        const capability = classification.type;
        platformMatches = platformAgents
          .filter((a) => a.capability === capability || a.taskName === capability)
          .map((a) => ({
            agent_id: a.id,
            name: a.name,
            price_hbar: a.rateHbar,
            sla_seconds: a.slaSeconds,
            rating_avg: a.ratingAvg,
            reputation_score: a.reputationScore,
            tasks_completed: a.tasksCompleted,
            is_third_party: false,
          }));
      } catch (err) {
        console.warn('[Orchestrator] Platform classification failed:', err);
      }
    }

    // 4. Merge: third-party matches first (they're relevance-sorted), then platform agents
    const agents = [...thirdPartyMatches, ...platformMatches];

    if (agents.length === 0) {
      throw new Error('No agents are currently available that match your request. Please try rephrasing or check back later.');
    }

    const task = await prisma.task.create({
      data: {
        userMessage,
        classifiedType: classifiedType ?? null,
        status: 'QUOTING',
        userId,
        quoteData: JSON.parse(JSON.stringify({ agents, classifiedType })),
      },
    });

    await prisma.chatMessage.create({
      data: { taskId: task.id, role: 'USER', content: userMessage },
    });

    return { taskId: task.id, classifiedType, agents, userBalance: user.hbarBalance };
  }

  // For third-party agents with exampleRequestBody: start gathering inputs from user
  async gatherInputs(
    taskId: string,
    userId: string,
    selectedAgentId: string
  ): Promise<{ taskId: string; status: string; question: string; agentName: string }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    if (task.userId !== userId) throw new Error('Unauthorized');

    const worker = await prisma.agent.findUnique({ where: { id: selectedAgentId } });
    if (!worker) throw new Error('Agent not found');

    const question = await generateInputQuestion(
      worker.exampleRequestBody,
      (worker.requestFieldsConfig as Record<string, { required: boolean }>) ?? {},
      worker.name,
      worker.description,
    );

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'GATHERING_INPUTS', assignedWorkerId: worker.id },
    });

    await prisma.chatMessage.create({
      data: { taskId, role: 'DISPATCHER', content: question },
    });

    return { taskId, status: 'GATHERING_INPUTS', question, agentName: worker.name };
  }

  // Process user's natural-language response and extract fields
  async processUserInputs(
    taskId: string,
    userId: string,
    userMessage: string
  ): Promise<{ ready: boolean; question?: string; taskId: string }> {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignedWorker: true } });
    if (!task) throw new Error('Task not found');
    if (task.userId !== userId) throw new Error('Unauthorized');
    if (task.status !== 'GATHERING_INPUTS') throw new Error('Task is not gathering inputs');

    const worker = task.assignedWorker!;
    const fieldsConfig = (worker.requestFieldsConfig as Record<string, { required: boolean }>) ?? {};

    await prisma.chatMessage.create({
      data: { taskId, role: 'USER', content: userMessage },
    });

    const { extracted, missing } = await extractFieldsFromMessage(
      userMessage,
      worker.exampleRequestBody,
      fieldsConfig
    );

    if (missing.length > 0) {
      const followUp = `I still need the following: **${missing.join(', ')}**. Could you provide those?`;
      await prisma.chatMessage.create({
        data: { taskId, role: 'DISPATCHER', content: followUp },
      });
      return { ready: false, question: followUp, taskId };
    }

    // All fields present — store the request body and mark as ready for execution
    await prisma.task.update({
      where: { id: taskId },
      data: { requestBody: extracted, status: 'QUOTING' },
    });

    return { ready: true, taskId };
  }

  async confirmAndExecute(
    taskId: string,
    userId: string,
    selectedAgentId: string
  ): Promise<OrchestratorResult> {
    const timeline: TimelineStep[] = [];
    const addStep = (step: string, status: TimelineStep['status'], extra?: Partial<TimelineStep>) => {
      timeline.push({ step, status, timestamp: new Date().toISOString(), ...extra });
    };

    try {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw new Error('Task not found');
      if (task.status !== 'QUOTING') throw new Error(`Task is not in QUOTING state: ${task.status}`);
      if (task.userId !== userId) throw new Error('Unauthorized');

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const worker = await prisma.agent.findUnique({ where: { id: selectedAgentId } });
      if (!worker || !worker.accountId) throw new Error('Worker agent not found or missing accountId');

      const grossAmount = worker.rateHbar;

      if (user.hbarBalance < grossAmount) {
        throw new Error(
          `Insufficient balance: need ${grossAmount.toFixed(2)} HBAR, have ${user.hbarBalance.toFixed(2)} HBAR`
        );
      }

      // Validate HCS-10 connection exists before committing funds
      if (!(worker.isThirdParty && worker.thirdPartyProtocol === 'API' && worker.apiUrl)) {
        const connection = await prisma.connection.findFirst({
          where: { workerAccountId: worker.accountId },
        });
        if (!connection) {
          throw new Error(`No connection established with agent ${worker.name}. The agent may still be setting up.`);
        }
      }

      // Step 1: Classify
      await prisma.task.update({ where: { id: taskId }, data: { status: 'CLASSIFYING' } });
      addStep('Classifying', 'completed');

      // Step 2: Hire
      addStep('Hiring Worker', 'active');
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'HIRING', assignedWorkerId: worker.id },
      });

      addStep('Hiring Worker', 'completed');

      // Step 3: Deduct balance (atomic — re-check balance inside transaction to prevent races)
      const platformFee = grossAmount * platformFeePercent;
      const netAmount = grossAmount - platformFee;

      await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.findUnique({ where: { id: userId } });
        if (!freshUser || freshUser.hbarBalance < grossAmount) {
          throw new Error(`Insufficient balance: need ${grossAmount.toFixed(2)} HBAR`);
        }
        await tx.user.update({
          where: { id: userId },
          data: { hbarBalance: { decrement: grossAmount }, hbarSpent: { increment: grossAmount } },
        });
        await tx.transaction.create({
          data: {
            taskId,
            type: 'PLATFORM_FEE',
            amountHbar: platformFee,
            fromAccount: freshUser.hederaAccountId,
            toAccount: config.hedera.operatorId,
            status: 'completed',
          },
        });
      });
      await prisma.task.update({ where: { id: taskId }, data: { platformFeeHbar: platformFee } });

      // Step 4: Escrow on HCS
      addStep('Creating Escrow', 'active');
      await prisma.task.update({ where: { id: taskId }, data: { status: 'ESCROW_CREATED' } });

      const escrow = await this.escrowManager.createEscrowWithFee(
        taskId,
        worker.accountId,
        grossAmount,
        platformFeePercent
      );
      const slaDeadline = new Date(Date.now() + worker.slaSeconds * 1000);

      await prisma.task.update({
        where: { id: taskId },
        data: { escrowAmountHbar: grossAmount, escrowTxId: escrow.txId, slaDeadline },
      });
      await prisma.transaction.create({
        data: {
          taskId,
          type: 'ESCROW_CREATE',
          hederaTxId: escrow.txId,
          topicId: this.escrowTopicId,
          sequenceNumber: escrow.sequenceNumber,
          amountHbar: grossAmount,
          fromAccount: config.hedera.operatorId,
          toAccount: worker.accountId,
          status: 'completed',
        },
      });
      addStep('Creating Escrow', 'completed', {
        txId: escrow.txId,
        hashScanUrl: getHashScanTxUrl(escrow.txId),
      });
      // Escrow step logged in timeline — no separate chat message

      // Step 5: Delegate — branch on third-party vs platform agent
      addStep('Delegating Task', 'active');
      await prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });

      const classifiedType = task.classifiedType ?? 'SUMMARIZATION';
      let resultMessage: { result: string; status: string } | null = null;

      if (worker.isThirdParty && worker.thirdPartyProtocol === 'API' && worker.apiUrl) {
        // ── Third-party API agent: HTTP POST to their apiUrl ──
        // Use the constructed requestBody if available, otherwise fall back to legacy format
        const requestBody = task.requestBody ?? {
          taskId,
          taskType: classifiedType.toLowerCase(),
          userMessage: task.userMessage,
          priceHbar: worker.rateHbar,
          slaSeconds: worker.slaSeconds,
        };

        addStep('Delegating Task', 'completed');
        addStep('Processing (third-party)', 'active');

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), worker.slaSeconds * 1000);

          const httpRes = await fetch(worker.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!httpRes.ok) {
            throw new Error(`Agent API returned HTTP ${httpRes.status}`);
          }

          const data = await httpRes.json() as any;

          // Format the response: if agent has exampleResponseBody, use LLM to format as natural language
          let resultText: string;
          if (worker.exampleResponseBody && typeof data === 'object') {
            try {
              resultText = await formatResponseForUser(data, worker.exampleResponseBody, worker.name);
            } catch {
              // Fallback: stringify the response
              resultText = data.result ?? JSON.stringify(data, null, 2);
            }
          } else {
            resultText = data.result ?? JSON.stringify(data, null, 2);
          }

          if (!resultText) throw new Error('Agent returned empty result');
          resultMessage = { result: resultText, status: 'completed' };
        } catch (err: any) {
          console.warn(`[Orchestrator] Third-party agent ${worker.name} failed:`, err.message);
          resultMessage = null;
        }
      } else {
        // ── HCS-10 messaging (platform agents + HCS-10 third-party agents) ──
        const connection = await prisma.connection.findFirst({
          where: { workerAccountId: worker.accountId },
        });
        if (!connection) throw new Error(`No HCS-10 connection established with worker: ${worker.name}`);

        await prisma.task.update({
          where: { id: taskId },
          data: { connectionTopicId: connection.connectionTopicId },
        });

        // Only send taskId — worker fetches the full task from DB.
        // Keeps HCS messages small and avoids inscription limits.
        await sendMessageOnConnection(
          this.hcs10Client,
          connection.connectionTopicId,
          {
            type: 'task_request',
            taskId,
            taskType: classifiedType.toLowerCase(),
            escrowTxId: escrow.txId,
            escrowAmount: grossAmount,
          },
          `ahb:task:${taskId}`
        );
        addStep('Delegating Task', 'completed');
        addStep('Processing', 'active');

        // Poll for result notification — worker saves result to DB, sends small status-only HCS msg
        const startTime = Date.now();
        const timeout = worker.slaSeconds * 1000;
        let lastSequence = 0;

        while (Date.now() - startTime < timeout) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const messages = await getNewMessages(
              this.hcs10Client,
              connection.connectionTopicId,
              lastSequence
            );
            for (const msg of messages) {
              lastSequence = Math.max(lastSequence, msg.sequence);
              if (msg.data?.type === 'task_result' && msg.data?.taskId === taskId) {
                // Fetch result from DB — worker stored it there to keep HCS message small
                // Retry a few times in case the DB write hasn't committed yet
                let resultText: string | null = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                  const updatedTask = await prisma.task.findUnique({ where: { id: taskId } });
                  if (updatedTask?.resultText) {
                    resultText = updatedTask.resultText;
                    break;
                  }
                  if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
                }
                let finalResult = resultText ?? msg.data.result ?? '';
                // Rephrase the raw result into friendly markdown for the user
                if (finalResult && worker.isThirdParty) {
                  try {
                    finalResult = await formatResponseForUser(
                      finalResult,
                      worker.exampleResponseBody ?? null,
                      worker.name
                    );
                  } catch (err) {
                    console.warn('[Orchestrator] Could not rephrase HCS-10 result:', err);
                  }
                }
                resultMessage = {
                  ...msg.data,
                  result: finalResult,
                };
                break;
              }
            }
            if (resultMessage) break;
          } catch (err) {
            console.warn('Poll error:', err);
          }
        }
      }

      // SLA check
      const slaMet =
        !!resultMessage &&
        resultMessage.status !== 'failed' &&
        Date.now() <= slaDeadline.getTime();

      if (!slaMet || !resultMessage || resultMessage.status === 'failed') {
        const refundAmount = grossAmount; // full amount including fee — fee never retained on failure

        await prisma.$transaction([
          // Restore full balance to user (including platform fee since task failed)
          prisma.user.update({
            where: { id: userId },
            data: { hbarBalance: { increment: refundAmount }, hbarSpent: { decrement: refundAmount } },
          }),
          prisma.task.update({ where: { id: taskId }, data: { slaMet: false, status: 'REFUNDED' } }),
          // Mark the fee record as refunded — fee was never retained
          prisma.transaction.updateMany({
            where: { taskId, type: 'PLATFORM_FEE' },
            data: { status: 'refunded' },
          }),
          // Record the refund
          prisma.transaction.create({
            data: {
              taskId,
              type: 'REFUND',
              amountHbar: refundAmount,
              fromAccount: config.hedera.operatorId,
              toAccount: user.hederaAccountId,
              status: 'completed',
            },
          }),
        ]);

        // Log refund event on-chain (HCS message — no real HBAR moves since it never left operator)
        try { await this.escrowManager.refundEscrow(taskId, grossAmount); } catch {}

        const totalTasks = worker.tasksCompleted + 1;
        const newSlaRate = (worker.slaCompletionRate * worker.tasksCompleted) / totalTasks;
        await prisma.agent.update({
          where: { id: worker.id },
          data: { slaCompletionRate: newSlaRate, tasksCompleted: { increment: 1 } },
        });

        await prisma.chatMessage.create({
          data: {
            taskId,
            role: 'SYSTEM',
            content: `SLA deadline exceeded or agent failed. Your full ${refundAmount.toFixed(2)} HBAR (including platform fee) has been refunded to your balance.`,
          },
        });
        addStep('Failed', 'failed');
        return {
          taskId,
          result: resultMessage?.result || 'Task failed or timed out',
          status: 'REFUNDED',
          timeline,
          verification: {},
          slaMet: false,
        };
      }

      addStep('Processing', 'completed');

      // Step 7: Verify
      addStep('Verifying Result', 'active');
      const resultHash = computeResultHash(resultMessage.result);
      await prisma.task.update({
        where: { id: taskId },
        data: { resultText: resultMessage.result, resultHash, slaMet: true },
      });
      addStep('Verifying Result', 'completed');

      // Step 8: Pay worker — on-chain transfer of net amount (platform fee stays in operator account)
      addStep('Releasing Payment', 'active');
      let releaseTxId = '';
      let paymentFailed = false;
      try {
        releaseTxId = await this.escrowManager.releaseEscrow(worker.accountId, escrow.netAmount, taskId);
      } catch (err) {
        console.error('[Orchestrator] Payment release failed — will retry:', err);
        paymentFailed = true;
      }

      await prisma.task.update({
        where: { id: taskId },
        data: {
          releaseTxId: releaseTxId || null,
          status: paymentFailed ? 'PAYMENT_FAILED' : 'ESCROW_RELEASED',
        },
      });
      if (!paymentFailed) {
        await prisma.transaction.create({
          data: {
            taskId,
            type: 'ESCROW_RELEASE',
            hederaTxId: releaseTxId,
            amountHbar: escrow.netAmount,
            fromAccount: config.hedera.operatorId,
            toAccount: worker.accountId,
            status: 'completed',
          },
        });
      }
      addStep('Releasing Payment', 'completed', {
        txId: releaseTxId,
        hashScanUrl: releaseTxId !== 'offline' ? getHashScanTxUrl(releaseTxId) : undefined,
      });
      // Payment step logged in timeline — no separate chat message

      // Step 9: Receipt
      addStep('Writing Receipt', 'active');
      const dispatcher = await prisma.agent.findFirst({ where: { type: 'DISPATCHER' } });
      const receipt = await writeReceipt(getClient(), this.receiptTopicId, {
        version: '1.0',
        type: 'task_receipt',
        taskId,
        dispatcher: dispatcher?.accountId ?? config.hedera.operatorId,
        worker: worker.accountId,
        taskType: classifiedType.toLowerCase(),
        escrowAmount: grossAmount,
        platformFee,
        escrowTxId: escrow.txId,
        releaseTxId,
        resultHash,
        slaMet: true,
        slaSeconds: worker.slaSeconds,
        completedAt: new Date().toISOString(),
        isThirdParty: worker.isThirdParty,
      });

      const ratingWindowClosesAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.task.update({
        where: { id: taskId },
        data: {
          receiptTopicId: this.receiptTopicId,
          receiptSequenceNumber: receipt.sequenceNumber,
          status: 'RATING_WINDOW',
          ratingWindowClosesAt,
        },
      });
      await prisma.transaction.create({
        data: {
          taskId,
          type: 'RECEIPT',
          hederaTxId: receipt.txId,
          topicId: this.receiptTopicId,
          sequenceNumber: receipt.sequenceNumber,
          status: 'completed',
        },
      });
      // Update SLA rate: this task succeeded — increment both numerator and denominator
      const successTotal = worker.tasksCompleted + 1;
      const successRate = (worker.slaCompletionRate * worker.tasksCompleted + 1) / successTotal;
      await prisma.agent.update({
        where: { id: worker.id },
        data: { tasksCompleted: { increment: 1 }, slaCompletionRate: successRate },
      });
      addStep('Writing Receipt', 'completed', {
        txId: receipt.txId,
        hashScanUrl: getHashScanTopicUrl(this.receiptTopicId),
      });
      // Save the final result as a single chat message (the actual agent output)
      await prisma.chatMessage.create({
        data: {
          taskId,
          role: 'DISPATCHER',
          content: resultMessage.result,
          metadata: {
            isResult: true,
            receiptTopicId: this.receiptTopicId,
            receiptSequenceNumber: receipt.sequenceNumber,
            escrowTxId: escrow.txId,
            releaseTxId,
          },
        },
      });

      try {
        await recomputeAndSaveReputation(worker.id, this.reputationTopicId || undefined);
      } catch (err) {
        console.warn('[Orchestrator] Reputation update failed:', err);
      }

      return {
        taskId,
        result: resultMessage.result,
        status: 'RATING_WINDOW',
        timeline,
        verification: {
          escrowTxId: escrow.txId,
          escrowHashScanUrl: getHashScanTxUrl(escrow.txId),
          releaseTxId,
          releaseHashScanUrl: releaseTxId !== 'offline' ? getHashScanTxUrl(releaseTxId) : undefined,
          receiptTopicId: this.receiptTopicId,
          receiptTopicHashScanUrl: getHashScanTopicUrl(this.receiptTopicId),
          receiptSequenceNumber: receipt.sequenceNumber,
          resultHash,
          ratingTopicId: this.ratingTopicId || undefined,
          reputationTopicId: this.reputationTopicId || undefined,
        },
        slaMet: true,
        platformFeeHbar: platformFee,
      };
    } catch (error: any) {
      console.error(`[Orchestrator] Task ${taskId} failed:`, error);
      await prisma.task.update({ where: { id: taskId }, data: { status: 'FAILED' } });
      await prisma.chatMessage.create({
        data: { taskId, role: 'SYSTEM', content: `Task failed: ${error.message}` },
      });
      addStep('Failed', 'failed');
      throw error;
    }
  }
}
