import { config } from './config';
import { getPrismaClient } from '@repo/database';
import { getClient } from './hedera/client';
import { createTopic } from './hedera/topics';
import { registerAgent, createHCS10Client } from './hcs10/setup';
import { ensureConnectionBetween } from './hcs10/connections';
import { SummarizerWorker } from './workers/summarizer';
import { ContentGenWorker } from './workers/content-gen';
import { encryptPrivateKey, decryptPrivateKey } from './hedera/keyEncryption';
import { DispatcherAgent } from './dispatcher';
import { createServer } from './api/server';
import { startSlaMonitor } from './jobs/sla-monitor';
import { startRatingWindowCloser } from './jobs/rating-window-closer';

const prisma = getPrismaClient();

async function ensureAgentRegistered(
  name: string,
  description: string,
  capability: string,
  agentType: 'dispatcher' | 'worker',
  type: 'DISPATCHER' | 'WORKER',
  taskName: string,
  slaSeconds: number,
  priceHbar: number
) {
  const existing = await prisma.agent.findFirst({ where: { name } });
  if (existing) {
    console.log(`[Init] ${name} already registered (${existing.accountId})`);
    return existing;
  }

  console.log(`[Init] Registering ${name}...`);
  const result = await registerAgent({
    name,
    description,
    capability,
    agentType,
    taskName,
    priceHbar,
    slaSeconds,
  });

  const agent = await prisma.agent.create({
    data: {
      name,
      type,
      capability,
      accountId: result.accountId,
      encryptedPrivateKey: result.privateKey ? encryptPrivateKey(result.privateKey) : undefined,
      inboundTopicId: result.inboundTopicId,
      outboundTopicId: result.outboundTopicId,
      profileTopicId: result.profileTopicId,
      taskName,
      slaSeconds,
      rateHbar: priceHbar,
    },
  });

  console.log(`[Init] ${name} registered: ${result.accountId}`);
  console.log(`  INBOUND_TOPIC: ${result.inboundTopicId}`);
  console.log(`  OUTBOUND_TOPIC: ${result.outboundTopicId}`);
  return agent;
}

async function ensureConnection(
  dispatcherAgent: any,
  workerAgent: any,
) {
  return ensureConnectionBetween(
    dispatcherAgent.accountId,
    workerAgent.accountId,
    dispatcherAgent.name,
    workerAgent.name
  );
}

async function ensureTopics() {
  let escrowTopicId = config.topics.escrow;
  let receiptTopicId = config.topics.receipt;
  let reputationTopicId = config.topics.reputation;
  let ratingTopicId = config.topics.rating;

  if (!escrowTopicId) {
    console.log('[Init] Creating escrow topic...');
    escrowTopicId = await createTopic('ahb:escrow-log');
    console.log(`[Init] Escrow topic: ${escrowTopicId}`);
    console.log(`  Add to .env: ESCROW_TOPIC_ID=${escrowTopicId}`);
  }

  if (!receiptTopicId) {
    console.log('[Init] Creating receipt topic...');
    receiptTopicId = await createTopic('ahb:task-receipts');
    console.log(`[Init] Receipt topic: ${receiptTopicId}`);
    console.log(`  Add to .env: RECEIPT_TOPIC_ID=${receiptTopicId}`);
  }

  if (!reputationTopicId) {
    console.log('[Init] Creating reputation topic...');
    reputationTopicId = await createTopic('ahb:reputation-log');
    console.log(`[Init] Reputation topic: ${reputationTopicId}`);
    console.log(`  Add to .env: REPUTATION_TOPIC_ID=${reputationTopicId}`);
  }

  if (!ratingTopicId) {
    console.log('[Init] Creating rating topic...');
    ratingTopicId = await createTopic('ahb:rating-log');
    console.log(`[Init] Rating topic: ${ratingTopicId}`);
    console.log(`  Add to .env: RATING_TOPIC_ID=${ratingTopicId}`);
  }

  return { escrowTopicId, receiptTopicId, reputationTopicId, ratingTopicId };
}

async function main() {
  console.log('[Boot] Hyreon starting...');

  // 1. Connect to database
  await prisma.$connect();
  console.log('[Boot] Database connected');

  // 2. Initialize Hedera client
  getClient();
  console.log('[Boot] Hedera client initialized');

  // 3. Ensure HCS topics exist
  const { escrowTopicId, receiptTopicId, reputationTopicId, ratingTopicId } = await ensureTopics();

  // 4. Register agents
  const dispatcherAgent = await ensureAgentRegistered(
    'DispatcherBot',
    'Orchestrates tasks by hiring worker agents from the HOL Registry',
    'orchestration',
    'dispatcher',
    'DISPATCHER',
    'orchestration',
    0,
    0
  );

  const summarizerAgent = await ensureAgentRegistered(
    'SummarizerBot',
    'Summarizes text content using Claude',
    'summarization',
    'worker',
    'WORKER',
    'summarization',
    120,
    1.0
  );

  const contentGenAgent = await ensureAgentRegistered(
    'ContentGenBot',
    'Generates high-quality content including blog posts, marketing copy, and creative writing using Claude',
    'content_generation',
    'worker',
    'WORKER',
    'content_generation',
    180,
    2.0
  );

  // 5. Create HCS10 clients — each agent must use its own account ID + private key.
  function agentKey(agent: any): string | undefined {
    if (agent.encryptedPrivateKey) return decryptPrivateKey(agent.encryptedPrivateKey);
    return undefined;
  }
  const dispatcherClient = createHCS10Client(dispatcherAgent.accountId ?? undefined, agentKey(dispatcherAgent));
  const summarizerClient = createHCS10Client(summarizerAgent.accountId ?? undefined, agentKey(summarizerAgent));
  const contentGenClient = createHCS10Client(contentGenAgent.accountId ?? undefined, agentKey(contentGenAgent));

  // 6. Ensure connections
  if (dispatcherAgent.accountId && summarizerAgent.accountId) {
    await ensureConnection(dispatcherAgent, summarizerAgent);
  }

  if (dispatcherAgent.accountId && contentGenAgent.accountId) {
    await ensureConnection(dispatcherAgent, contentGenAgent);
  }

  // 7. Start workers
  const summarizerWorker = new SummarizerWorker();
  const contentGenWorker = new ContentGenWorker();
  await summarizerWorker.initialize();
  await contentGenWorker.initialize();
  console.log('[Boot] Workers started');

  // 8. Start background jobs
  const slaMonitorInterval = startSlaMonitor();
  const ratingCloserInterval = startRatingWindowCloser();
  console.log('[Boot] Background jobs started (SLA monitor, rating window closer)');

  // 9. Start API
  const dispatcher = new DispatcherAgent(
    dispatcherClient,
    escrowTopicId,
    receiptTopicId,
    reputationTopicId,
    ratingTopicId
  );
  const app = createServer(dispatcher);
  app.listen(config.api.port, () => {
    console.log(`[Boot] Hyreon ready on port ${config.api.port}`);
    console.log(`[Boot] Health: http://localhost:${config.api.port}/api/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    summarizerWorker.stop();
    contentGenWorker.stop();
    clearInterval(slaMonitorInterval);
    clearInterval(ratingCloserInterval);
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Boot] Fatal error:', err);
  process.exit(1);
});
