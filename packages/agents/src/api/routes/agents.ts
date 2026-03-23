import { Router } from 'express';
import crypto from 'crypto';
import { getPrismaClient } from '@repo/database';
import { buildReputationBreakdown } from '../../dispatcher/reputation';
import { registerAgent } from '../../hcs10/setup';
import { createHCS10Client } from '../../hcs10/setup';
import { requireAuth } from '../middleware/auth';
import {
  ensureConnectionBetween,
  initiateHCS10Handshake,
  checkHandshakeComplete,
  verifyTopicExists,
  verifyAccountExists,
} from '../../hcs10/connections';
import { lookupEvmAddress } from '../../hedera/mirror';
import { encryptPrivateKey, decryptPrivateKey } from '../../hedera/keyEncryption';

const prisma = getPrismaClient();
const router = Router();

// ── Helper: resolve EVM addresses for agents missing them ──
async function resolveEvmAddresses(agents: any[]): Promise<any[]> {
  const needsLookup = agents.filter((a) => a.accountId && !a.evmAddress);
  if (needsLookup.length === 0) return agents;

  // Look up in parallel (max 10 at a time to avoid rate limits)
  const batches: any[][] = [];
  for (let i = 0; i < needsLookup.length; i += 10) {
    batches.push(needsLookup.slice(i, i + 10));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (agent) => {
        const evmAddr = await lookupEvmAddress(agent.accountId);
        if (evmAddr) {
          agent.evmAddress = evmAddr;
          // Fire-and-forget DB update
          prisma.agent.update({
            where: { id: agent.id },
            data: { evmAddress: evmAddr },
          }).catch(() => {});
        }
      })
    );
  }

  return agents;
}

const AGENT_REGISTRATION_DEPOSIT_HBAR = 10;

// ── Helper: generate API key for HCS-10 third-party agents ──
function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `ahb_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

// ── Helper: verify API key ──
async function verifyAgentApiKey(agentId: string, token: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || !agent.apiKeyHash) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return hash === agent.apiKeyHash;
}

// ── Helper: get dispatcher account ID ──
async function getDispatcherAccountId(): Promise<string | null> {
  const dispatcher = await prisma.agent.findFirst({ where: { type: 'DISPATCHER' } });
  return dispatcher?.accountId ?? null;
}

// POST /api/agents/register — third-party agent registration
// Supports three protocols: 'api' (default), 'hcs10_managed', 'hcs10_self'
router.post('/register', requireAuth, async (req, res) => {
  try {
    const {
      agentName, apiUrl, taskType, priceHbar, slaSeconds, description, userId,
      exampleRequestBody, requestFieldsConfig, exampleResponseBody,
      protocol,
      // Flow B fields
      accountId: selfAccountId, inboundTopicId: selfInboundTopicId,
      outboundTopicId: selfOutboundTopicId, profileTopicId: selfProfileTopicId,
    } = req.body as {
      agentName: string;
      apiUrl?: string;
      taskType: string;
      priceHbar: number;
      slaSeconds?: number;
      description?: string;
      userId: string;
      exampleRequestBody?: any;
      requestFieldsConfig?: any;
      exampleResponseBody?: any;
      protocol?: 'api' | 'hcs10_managed' | 'hcs10_self';
      accountId?: string;
      inboundTopicId?: string;
      outboundTopicId?: string;
      profileTopicId?: string;
    };

    const agentProtocol = protocol ?? 'api';

    // ── Common validation ──
    if (!agentName || !taskType || !priceHbar || !userId) {
      res.status(400).json({ error: 'agentName, taskType, priceHbar and userId are required' });
      return;
    }

    // ── Protocol-specific validation ──
    if (agentProtocol === 'api') {
      if (!apiUrl) {
        res.status(400).json({ error: 'apiUrl is required for API protocol agents' });
        return;
      }
      try { new URL(apiUrl); } catch {
        res.status(400).json({ error: 'apiUrl must be a valid URL' });
        return;
      }
    }

    if (agentProtocol === 'hcs10_self') {
      if (!selfAccountId || !selfInboundTopicId || !selfOutboundTopicId) {
        res.status(400).json({
          error: 'accountId, inboundTopicId, and outboundTopicId are required for HCS-10 self-managed agents',
        });
        return;
      }
    }

    // ── Verify user and balance ──
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found — you must be logged in to register an agent' });
      return;
    }
    if (user.hbarBalance < AGENT_REGISTRATION_DEPOSIT_HBAR) {
      res.status(400).json({
        error: `Insufficient balance. Agent registration requires a ${AGENT_REGISTRATION_DEPOSIT_HBAR} ℏ deposit. Your balance: ${user.hbarBalance.toFixed(2)} ℏ`,
        requiredDeposit: AGENT_REGISTRATION_DEPOSIT_HBAR,
        currentBalance: user.hbarBalance,
      });
      return;
    }

    const capability = taskType.toLowerCase().replace(/\s+/g, '_');
    let agentAccountId = user.hederaAccountId;
    let inboundTopicId: string | null = null;
    let outboundTopicId: string | null = null;
    let profileTopicId: string | null = null;
    let connectionTopicId: string | null = null;
    let apiKeyRaw: string | null = null;
    let apiKeyHash: string | null = null;
    let apiKeyPrefix: string | null = null;
    let connectionStatus = 'none';
    let hcs10Verified = false;
    let agentEncryptedKey: string | null = null;

    // ── Protocol: API (existing behavior) ──
    if (agentProtocol === 'api') {
      // Verify the API is reachable
      try {
        const pingRes = await fetch(apiUrl!, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        if (!pingRes.ok && pingRes.status !== 404 && pingRes.status !== 405) {
          console.warn(`[agents/register] Ping returned ${pingRes.status} for ${apiUrl}`);
        }
      } catch {
        console.warn(`[agents/register] Could not reach ${apiUrl} — registering anyway`);
      }
    }

    // ── Protocol: HCS10_MANAGED (Flow A) ──
    if (agentProtocol === 'hcs10_managed') {
      console.log(`[agents/register] Creating HCS-10 infrastructure for ${agentName}...`);

      const result = await registerAgent({
        name: agentName,
        description: description ?? `Third-party agent: ${agentName}`,
        capability,
        agentType: 'worker',
        taskName: taskType,
        priceHbar,
        slaSeconds: slaSeconds ?? 120,
      });

      agentAccountId = result.accountId;
      if (result.privateKey) {
        agentEncryptedKey = encryptPrivateKey(result.privateKey);
      }
      inboundTopicId = result.inboundTopicId;
      outboundTopicId = result.outboundTopicId;
      profileTopicId = result.profileTopicId;

      // Create connection with dispatcher
      const dispatcherAccountId = await getDispatcherAccountId();
      if (dispatcherAccountId) {
        const conn = await ensureConnectionBetween(
          dispatcherAccountId,
          result.accountId,
          'DispatcherBot',
          agentName
        );
        connectionTopicId = conn.connectionTopicId;
        connectionStatus = 'active';
      }

      // Generate API key for external task interaction
      const key = generateApiKey();
      apiKeyRaw = key.raw;
      apiKeyHash = key.hash;
      apiKeyPrefix = key.prefix;
      hcs10Verified = true;

      console.log(`[agents/register] HCS-10 agent ${agentName} registered: ${agentAccountId}`);
    }

    // ── Protocol: HCS10_SELF (Flow B) ──
    if (agentProtocol === 'hcs10_self') {
      console.log(`[agents/register] Verifying self-managed HCS-10 agent ${agentName}...`);

      // Verify topics and account exist on-chain
      const [acctOk, inOk, outOk] = await Promise.all([
        verifyAccountExists(selfAccountId!),
        verifyTopicExists(selfInboundTopicId!),
        verifyTopicExists(selfOutboundTopicId!),
      ]);

      if (!acctOk) {
        res.status(400).json({ error: `Account ${selfAccountId} not found on Hedera testnet` });
        return;
      }
      if (!inOk) {
        res.status(400).json({ error: `Inbound topic ${selfInboundTopicId} not found on Hedera testnet` });
        return;
      }
      if (!outOk) {
        res.status(400).json({ error: `Outbound topic ${selfOutboundTopicId} not found on Hedera testnet` });
        return;
      }

      agentAccountId = selfAccountId!;
      inboundTopicId = selfInboundTopicId!;
      outboundTopicId = selfOutboundTopicId!;
      profileTopicId = selfProfileTopicId ?? null;
      hcs10Verified = true;

      // Initiate HCS-10 handshake (async — agent must accept on their side)
      const dispatcherAccountId = await getDispatcherAccountId();
      if (dispatcherAccountId) {
        try {
          const dispatcher = await prisma.agent.findFirst({ where: { type: 'DISPATCHER' } });
          const dispKey = dispatcher?.encryptedPrivateKey ? decryptPrivateKey(dispatcher.encryptedPrivateKey) : undefined;
          const dispatcherClient = createHCS10Client(dispatcher?.accountId ?? undefined, dispKey);
          await initiateHCS10Handshake(dispatcherClient, selfInboundTopicId!);
          connectionStatus = 'pending_handshake';
          console.log(`[agents/register] HCS-10 handshake initiated with ${agentName}`);
        } catch (err: any) {
          console.warn(`[agents/register] Could not initiate handshake: ${err.message}`);
          connectionStatus = 'handshake_failed';
        }
      }

      // Generate API key
      const key = generateApiKey();
      apiKeyRaw = key.raw;
      apiKeyHash = key.hash;
      apiKeyPrefix = key.prefix;
    }

    // ── Map protocol string to enum ──
    const thirdPartyProtocol = agentProtocol === 'hcs10_managed'
      ? 'HCS10_MANAGED' as const
      : agentProtocol === 'hcs10_self'
        ? 'HCS10_SELF' as const
        : 'API' as const;

    // ── Atomically deduct deposit and create agent ──
    const [, agent] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          hbarBalance: { decrement: AGENT_REGISTRATION_DEPOSIT_HBAR },
          hbarSpent: { increment: AGENT_REGISTRATION_DEPOSIT_HBAR },
        },
      }),
      prisma.agent.create({
        data: {
          name: agentName,
          type: 'WORKER',
          capability,
          accountId: agentAccountId,
          evmAddress: user.evmAddress ?? null,
          inboundTopicId,
          outboundTopicId,
          profileTopicId,
          apiUrl: agentProtocol === 'api' ? apiUrl : null,
          taskName: taskType,
          rateHbar: priceHbar,
          slaSeconds: slaSeconds ?? 120,
          description,
          isThirdParty: true,
          thirdPartyProtocol,
          hcs10Verified,
          encryptedPrivateKey: agentEncryptedKey,
          apiKeyHash,
          apiKeyPrefix,
          connectionStatus,
          ownerId: userId,
          version: '1.0',
          exampleRequestBody: exampleRequestBody ?? undefined,
          requestFieldsConfig: requestFieldsConfig ?? undefined,
          exampleResponseBody: exampleResponseBody ?? undefined,
        },
      }),
      prisma.userTransaction.create({
        data: {
          userId,
          type: 'withdraw',
          amountHbar: AGENT_REGISTRATION_DEPOSIT_HBAR,
          status: 'confirmed',
          memo: `agent_registration_deposit`,
        },
      }),
    ]);

    // ── Build response ──
    const response: any = { agent, depositCharged: AGENT_REGISTRATION_DEPOSIT_HBAR };

    if (agentProtocol !== 'api') {
      response.hcs10 = {
        accountId: agentAccountId,
        inboundTopicId,
        outboundTopicId,
        profileTopicId,
        connectionTopicId,
        connectionStatus,
      };
      // Return API key only once at registration
      response.apiKey = apiKeyRaw;
    }

    res.status(201).json(response);
  } catch (err: any) {
    console.error('[agents/register] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const agents = await prisma.agent.findMany({ orderBy: { type: 'asc' } });
    await resolveEvmAddresses(agents);
    res.json({ agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: { ratings: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    await resolveEvmAddresses([agent]);
    res.json({ agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id/connection-status — check HCS-10 connection status
router.get('/:id/connection-status', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Check if a connection exists in the connections table
    const connection = agent.accountId
      ? await prisma.connection.findFirst({
          where: { workerAccountId: agent.accountId },
        })
      : null;

    res.json({
      connectionStatus: agent.connectionStatus,
      hasConnection: !!connection,
      connectionTopicId: connection?.connectionTopicId ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:id/complete-connection — finalize HCS-10 handshake for Flow B
router.post('/:id/complete-connection', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (agent.thirdPartyProtocol !== 'HCS10_SELF') {
      res.status(400).json({ error: 'This endpoint is only for HCS-10 self-managed agents' });
      return;
    }

    // Check if connection already exists
    const existingConn = agent.accountId
      ? await prisma.connection.findFirst({
          where: { workerAccountId: agent.accountId },
        })
      : null;

    if (existingConn) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { connectionStatus: 'active' },
      });
      res.json({
        status: 'active',
        connectionTopicId: existingConn.connectionTopicId,
      });
      return;
    }

    // Try to create a direct connection (fallback if handshake didn't complete)
    const dispatcherAccountId = await getDispatcherAccountId();
    if (!dispatcherAccountId || !agent.accountId) {
      res.status(500).json({ error: 'Dispatcher not available' });
      return;
    }

    const conn = await ensureConnectionBetween(
      dispatcherAccountId,
      agent.accountId,
      'DispatcherBot',
      agent.name
    );

    await prisma.agent.update({
      where: { id: agent.id },
      data: { connectionStatus: 'active' },
    });

    res.json({
      status: 'active',
      connectionTopicId: conn.connectionTopicId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:agentId/tasks/pending — external HCS-10 agents fetch assigned tasks
router.get('/:agentId/tasks/pending', async (req, res) => {
  const { agentId } = req.params;
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn(`[agents/poll] ${agentId} — missing Bearer token`);
      res.status(401).json({ error: 'API key required' });
      return;
    }
    const token = authHeader.slice(7);
    const valid = await verifyAgentApiKey(agentId, token);
    if (!valid) {
      console.warn(`[agents/poll] ${agentId} — invalid API key`);
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    const tasks = await prisma.task.findMany({
      where: {
        assignedWorkerId: agentId,
        status: { in: ['IN_PROGRESS', 'ESCROW_CREATED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[agents/poll] ${agentId} — ${tasks.length} pending task(s)`);
    res.json({ tasks });
  } catch (err: any) {
    console.error(`[agents/poll] ${agentId} — error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:agentId/tasks/:taskId/result — external HCS-10 agents submit results
router.post('/:agentId/tasks/:taskId/result', async (req, res) => {
  const { agentId, taskId } = req.params;
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn(`[agents/result] ${agentId} task ${taskId} — missing Bearer token`);
      res.status(401).json({ error: 'API key required' });
      return;
    }
    const token = authHeader.slice(7);
    const valid = await verifyAgentApiKey(agentId, token);
    if (!valid) {
      console.warn(`[agents/result] ${agentId} task ${taskId} — invalid API key`);
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    const { resultText } = req.body as { resultText: string };
    if (!resultText) {
      console.warn(`[agents/result] ${agentId} task ${taskId} — missing resultText`);
      res.status(400).json({ error: 'resultText is required' });
      return;
    }

    // Verify the task belongs to this agent
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        assignedWorkerId: agentId,
      },
    });
    if (!task) {
      console.warn(`[agents/result] ${agentId} task ${taskId} — not found or not assigned`);
      res.status(404).json({ error: 'Task not found or not assigned to this agent' });
      return;
    }

    // Only store resultText — do NOT change status here.
    // The orchestrator's poll loop detects resultText and continues the
    // payment / receipt / rating pipeline (ESCROW_RELEASED → RATING_WINDOW etc.).
    // Setting status to COMPLETED here would skip that entire flow.
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { resultText },
    });

    console.log(`[agents/result] ${agentId} task ${taskId} — result submitted (${resultText.length} chars)`);
    res.json({ task: updated });
  } catch (err: any) {
    console.error(`[agents/result] ${agentId} task ${taskId} — error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id — update agent details (owner only)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { userId, agentName, apiUrl, priceHbar, slaSeconds, description,
      exampleRequestBody, requestFieldsConfig, exampleResponseBody, taskType } = req.body as {
      userId: string;
      agentName?: string;
      apiUrl?: string;
      priceHbar?: number;
      slaSeconds?: number;
      description?: string;
      taskType?: string;
      exampleRequestBody?: any;
      requestFieldsConfig?: any;
      exampleResponseBody?: any;
    };

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    // Check ownership: primary by ownerId, fallback by evmAddress for pre-auth agents
    if (agent.ownerId !== userId) {
      let fallbackOwner = false;
      if (!agent.ownerId && agent.evmAddress) {
        const reqUser = await prisma.user.findUnique({ where: { id: userId } });
        if (reqUser?.evmAddress && reqUser.evmAddress.toLowerCase() === agent.evmAddress.toLowerCase()) {
          fallbackOwner = true;
          // Claim ownership for future checks
          await prisma.agent.update({ where: { id: agent.id }, data: { ownerId: userId } });
        }
      }
      if (!fallbackOwner) {
        res.status(403).json({ error: 'Only the agent owner can edit this agent' });
        return;
      }
    }

    if (apiUrl) {
      try { new URL(apiUrl); } catch {
        res.status(400).json({ error: 'apiUrl must be a valid URL' });
        return;
      }
    }

    const updated = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        ...(agentName !== undefined && { name: agentName }),
        ...(apiUrl !== undefined && { apiUrl }),
        ...(priceHbar !== undefined && { rateHbar: priceHbar }),
        ...(slaSeconds !== undefined && { slaSeconds }),
        ...(description !== undefined && { description }),
        ...(taskType !== undefined && {
          taskName: taskType,
          capability: taskType.toLowerCase().replace(/\s+/g, '_'),
        }),
        ...(exampleRequestBody !== undefined && { exampleRequestBody }),
        ...(requestFieldsConfig !== undefined && { requestFieldsConfig }),
        ...(exampleResponseBody !== undefined && { exampleResponseBody }),
      },
    });

    res.json({ agent: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id/reputation
router.get('/:id/reputation', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const breakdown = buildReputationBreakdown(agent.id, {
      ratingAvg: agent.ratingAvg,
      slaCompletionRate: agent.slaCompletionRate,
      tasksCompleted: agent.tasksCompleted,
      disputeRate: agent.disputeRate,
      totalRatings: agent.totalRatings,
    });
    res.json({ reputation: breakdown });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
