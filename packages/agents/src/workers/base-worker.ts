import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { getPrismaClient } from '@repo/database';
import { getNewMessages, sendMessageOnConnection } from '../hcs10/messaging';
import { createHCS10Client } from '../hcs10/setup';
import { decryptPrivateKey } from '../hedera/keyEncryption';

const prisma = getPrismaClient();

export abstract class BaseWorker {
  abstract name: string;
  abstract capability: string;
  abstract taskName: string;
  abstract slaSeconds: number;
  abstract priceHbar: number;
  protected hcs10Client!: HCS10Client;
  private pollInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    // Use the worker's own account ID + private key so HCS-10 messages have correct envelope
    const worker = await prisma.agent.findFirst({ where: { capability: this.capability, type: 'WORKER' } });
    const workerKey = worker?.encryptedPrivateKey ? decryptPrivateKey(worker.encryptedPrivateKey) : undefined;
    this.hcs10Client = createHCS10Client(worker?.accountId ?? undefined, workerKey);
    console.log(`[${this.name}] Worker initialized (account: ${worker?.accountId ?? 'operator'})`);
    this.startPolling();
  }

  abstract executeTask(payload: string): Promise<string>;

  private startPolling(): void {
    this.pollInterval = setInterval(() => this.pollForTasks(), 5000);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async pollForTasks(): Promise<void> {
    try {
      const worker = await prisma.agent.findFirst({
        where: { capability: this.capability, type: 'WORKER' },
      });
      if (!worker) return;

      const connections = await prisma.connection.findMany({
        where: { workerAccountId: worker.accountId ?? '' },
      });

      for (const conn of connections) {
        const messages = await getNewMessages(
          this.hcs10Client,
          conn.connectionTopicId,
          conn.lastMessageSequence
        );

        for (const msg of messages) {
          if (msg.data?.type === 'task_request') {
            console.log(`[${this.name}] Received task: ${msg.data.taskId}`);
            await this.handleTaskRequest(conn.connectionTopicId, msg.data, msg.sequence);
          }
        }

        const maxSeq = messages.reduce((max, m) => Math.max(max, m.sequence), conn.lastMessageSequence);
        if (maxSeq > conn.lastMessageSequence) {
          await prisma.connection.update({
            where: { id: conn.id },
            data: { lastMessageSequence: maxSeq },
          });
        }
      }
    } catch (err) {
      console.warn(`[${this.name}] Poll error:`, err);
    }
  }

  private async handleTaskRequest(
    connectionTopicId: string,
    taskRequest: any,
    sequence: number
  ): Promise<void> {
    const { taskId } = taskRequest;
    const start = Date.now();
    try {
      // Fetch full task from DB — keeps HCS messages small
      // Atomically claim the task — only process if still IN_PROGRESS to prevent double-execution
      const claimed = await prisma.task.updateMany({
        where: { id: taskId, status: 'IN_PROGRESS' },
        data: { status: 'IN_PROGRESS' }, // no-op update; we just need the count check
      });
      if (claimed.count === 0) {
        console.log(`[${this.name}] Task ${taskId} already processed or not in progress, skipping`);
        return;
      }

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw new Error(`Task ${taskId} not found in database`);

      const result = await this.executeTask(task.userMessage);

      // Save result to DB so orchestrator can read it without another large HCS message
      await prisma.task.update({
        where: { id: taskId },
        data: { resultText: result },
      });

      // Send small status-only notification — no payload in HCS
      await sendMessageOnConnection(this.hcs10Client, connectionTopicId, {
        type: 'task_result',
        taskId,
        status: 'completed',
        executionTimeMs: Date.now() - start,
      });
    } catch (err: any) {
      await sendMessageOnConnection(this.hcs10Client, connectionTopicId, {
        type: 'task_result',
        taskId,
        status: 'failed',
        error: err.message,
        executionTimeMs: Date.now() - start,
      });
    }
  }
}
