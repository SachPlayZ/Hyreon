import { config } from './config';
import { getPrismaClient } from '@repo/database';
import { getClient } from './hedera/client';
import { createTopic } from './hedera/topics';
import { registerAgent } from './hcs10/setup';
import { createHCS10Client } from './hcs10/setup';
import { SummarizerWorker } from './workers/summarizer';
import { ContentGenWorker } from './workers/content-gen';
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
  const existingConn = await prisma.connection.findFirst({
    where: {
      dispatcherAccountId: dispatcherAgent.accountId,
      workerAccountId: workerAgent.accountId,
    },
  });

  if (existingConn) {
    console.log(
      `[Init] Connection ${dispatcherAgent.name} <-> ${workerAgent.name} already exists (${existingConn.connectionTopicId})`
    );
    return existingConn;
  }

  console.log(`[Init] Creating connection topic ${dispatcherAgent.name} <-> ${workerAgent.name}...`);

  // Create the connection topic directly with our operator client — bypasses the HCS-10
  // handshake which requires signing as the agent sub-accounts (keys we don't hold)
  const connectionTopicId = await createTopic(
    `ahb:connection:${dispatcherAgent.accountId}:${workerAgent.accountId}`
  );

  const conn = await prisma.connection.create({
    data: {
      dispatcherAccountId: dispatcherAgent.accountId,
      workerAccountId: workerAgent.accountId,
      connectionTopicId,
    },
  });

  console.log(`[Init] Connection topic created: ${connectionTopicId}`);
  return conn;
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
  console.log('[Boot] Hyeron starting...');

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

  // 5. Create HCS10 clients — use each agent's own account ID so getOperatorId()
  // resolves their registered HCS-11 profile. All sign with the operator key
  // since these accounts were created under the operator.
  const dispatcherClient = createHCS10Client(dispatcherAgent.accountId ?? undefined);
  const summarizerClient = createHCS10Client(summarizerAgent.accountId ?? undefined);
  const contentGenClient = createHCS10Client(contentGenAgent.accountId ?? undefined);

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
    console.log(`[Boot] Hyeron ready on port ${config.api.port}`);
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
