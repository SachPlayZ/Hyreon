import { Router } from 'express';
import { getPrismaClient } from '@repo/database';
import { buildReputationBreakdown } from '../../dispatcher/reputation';

const prisma = getPrismaClient();
const router = Router();

const AGENT_REGISTRATION_DEPOSIT_HBAR = 10;

// POST /api/agents/register — third-party agent registration
// Requires the registering user to have 10 HBAR on their platform balance (registration deposit).
router.post('/register', async (req, res) => {
  try {
    const {
      agentName, apiUrl, taskType, priceHbar, slaSeconds, description, userId,
      exampleRequestBody, requestFieldsConfig, exampleResponseBody,
    } = req.body as {
      agentName: string;
      apiUrl: string;
      taskType: string;
      priceHbar: number;
      slaSeconds?: number;
      description?: string;
      userId: string;
      exampleRequestBody?: any;
      requestFieldsConfig?: any;
      exampleResponseBody?: any;
    };

    if (!agentName || !apiUrl || !taskType || !priceHbar || !userId) {
      res.status(400).json({ error: 'agentName, apiUrl, taskType, priceHbar and userId are required' });
      return;
    }

    // Validate apiUrl
    try { new URL(apiUrl); } catch {
      res.status(400).json({ error: 'apiUrl must be a valid URL' });
      return;
    }

    // Verify the registering user exists and has enough balance for the deposit
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

    // Use the registering user's Hedera account for payouts
    const accountId = user.hederaAccountId;

    const capability = taskType.toLowerCase().replace(/\s+/g, '_');

    // Verify the API is reachable with a HEAD request to the actual URL
    try {
      const pingRes = await fetch(apiUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      if (!pingRes.ok && pingRes.status !== 404 && pingRes.status !== 405) {
        console.warn(`[agents/register] Ping returned ${pingRes.status} for ${apiUrl}`);
      }
    } catch {
      console.warn(`[agents/register] Could not reach ${apiUrl} — registering anyway`);
    }

    // Atomically deduct the registration deposit and create the agent
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
          accountId,
          apiUrl,
          taskName: taskType,
          rateHbar: priceHbar,
          slaSeconds: slaSeconds ?? 120,
          description,
          isThirdParty: true,
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

    res.status(201).json({ agent, depositCharged: AGENT_REGISTRATION_DEPOSIT_HBAR });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const agents = await prisma.agent.findMany({ orderBy: { type: 'asc' } });
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
    res.json({ agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id — update agent details (owner only)
router.patch('/:id', async (req, res) => {
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
    if (agent.ownerId !== userId) {
      res.status(403).json({ error: 'Only the agent owner can edit this agent' });
      return;
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
