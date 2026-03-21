import { Router } from 'express';
import { getPrismaClient } from '@repo/database';
import { getTopicMessage, getTransaction, getHashScanTxUrl, getHashScanTopicUrl } from '../../hedera/mirror';
import { DispatcherAgent } from '../../dispatcher';
import { detectIntent, generateConversationalReply } from '../../dispatcher/classifier';

const prisma = getPrismaClient();

export function createTasksRouter(dispatcher: DispatcherAgent): Router {
  const router = Router();

  // GET /api/tasks/open — tasks with status QUOTING
  router.get('/open', async (req, res) => {
    try {
      const tasks = await prisma.task.findMany({
        where: { status: 'QUOTING' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ tasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks/chat — smart entry point: detects intent and either creates a quote or responds conversationally
  router.post('/chat', async (req, res) => {
    try {
      const { userId, message } = req.body as { userId: string; message: string };
      if (!userId || !message) {
        res.status(400).json({ error: 'userId and message are required' });
        return;
      }

      const intent = await detectIntent(message);

      if (intent === 'conversation') {
        const reply = await generateConversationalReply(message);
        res.json({ type: 'conversation', reply });
        return;
      }

      // It's a task request — create a quote as before
      const quote = await dispatcher.createQuote(userId, message);
      res.json({ type: 'quote', ...quote });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks — create quote (legacy, still works)
  router.post('/', async (req, res) => {
    try {
      const { userId, message } = req.body as { userId: string; message: string };
      if (!userId || !message) {
        res.status(400).json({ error: 'userId and message are required' });
        return;
      }
      const quote = await dispatcher.createQuote(userId, message);
      res.json({ type: 'quote', ...quote });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks/:id/confirm — confirm and execute
  router.post('/:id/confirm', async (req, res) => {
    try {
      const { userId, agentId } = req.body as { userId: string; agentId: string };
      if (!userId || !agentId) {
        res.status(400).json({ error: 'userId and agentId are required' });
        return;
      }
      const result = await dispatcher.confirmTask(req.params.id, userId, agentId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks/:id/provide-inputs — user provides inputs for third-party agent
  router.post('/:id/provide-inputs', async (req, res) => {
    try {
      const { userId, message } = req.body as { userId: string; message: string };
      if (!userId || !message) {
        res.status(400).json({ error: 'userId and message are required' });
        return;
      }
      const result = await dispatcher.processUserInputs(req.params.id, userId, message);

      if (result.ready) {
        // Inputs complete — now execute the task
        const task = await prisma.task.findUnique({ where: { id: req.params.id } });
        if (!task?.assignedWorkerId) {
          res.status(400).json({ error: 'No agent assigned' });
          return;
        }
        const execResult = await dispatcher.confirmTask(req.params.id, userId, task.assignedWorkerId);
        res.json(execResult);
      } else {
        res.json({ taskId: result.taskId, status: 'GATHERING_INPUTS', reply: result.question });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tasks
  router.get('/', async (req, res) => {
    try {
      const { status, userId, limit = '20' } = req.query as {
        status?: string;
        userId?: string;
        limit?: string;
      };
      const tasks = await prisma.task.findMany({
        where: {
          ...(status ? { status: status as any } : {}),
          ...(userId ? { userId } : {}),
        },
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { assignedWorker: true, user: true },
      });
      res.json({ tasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tasks/:id
  router.get('/:id', async (req, res) => {
    try {
      const task = await prisma.task.findUnique({
        where: { id: req.params.id },
        include: {
          transactions: true,
          chatMessages: { orderBy: { createdAt: 'asc' } },
          assignedWorker: true,
          user: true,
          ratings: true,
        },
      });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      res.json({ task });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tasks/:id/verify
  router.get('/:id/verify', async (req, res) => {
    try {
      const task = await prisma.task.findUnique({ where: { id: req.params.id } });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const verification: any = {
        taskId: task.id,
        hashScanUrls: {},
        mirrorData: {},
        slaMet: task.slaMet,
        platformFeeHbar: task.platformFeeHbar,
      };

      if (task.escrowTxId) {
        verification.escrowTxId = task.escrowTxId;
        verification.hashScanUrls.escrow = getHashScanTxUrl(task.escrowTxId);
        try {
          verification.mirrorData.escrow = await getTransaction(task.escrowTxId);
        } catch {}
      }

      if (task.releaseTxId) {
        verification.releaseTxId = task.releaseTxId;
        verification.hashScanUrls.release = getHashScanTxUrl(task.releaseTxId);
        try {
          verification.mirrorData.release = await getTransaction(task.releaseTxId);
        } catch {}
      }

      if (task.receiptTopicId && task.receiptSequenceNumber) {
        verification.receiptTopicId = task.receiptTopicId;
        verification.receiptSeq = task.receiptSequenceNumber;
        verification.hashScanUrls.receipt = getHashScanTopicUrl(task.receiptTopicId);
        try {
          const receipt = await getTopicMessage(task.receiptTopicId, task.receiptSequenceNumber);
          verification.mirrorData.receipt = JSON.parse(receipt.message);
          const onChainHash = verification.mirrorData.receipt.resultHash;
          verification.hashMatch = onChainHash === task.resultHash;
        } catch {}
      }

      res.json(verification);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks/:id/rate
  router.post('/:id/rate', async (req, res) => {
    try {
      const { userId, stars, comment } = req.body as {
        userId: string;
        stars: number;
        comment?: string;
      };
      if (!userId || !stars) {
        res.status(400).json({ error: 'userId and stars are required' });
        return;
      }
      const result = await dispatcher.rateTask(req.params.id, userId, stars, comment);
      if (!result.success) {
        res.status(400).json({ error: result.message });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tasks/:id/skip-rating — mark rating as skipped so it doesn't reappear
  router.post('/:id/skip-rating', async (req, res) => {
    try {
      const { userId } = req.body as { userId: string };
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const task = await prisma.task.findUnique({ where: { id: req.params.id } });
      if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
      if (task.userId !== userId) { res.status(403).json({ error: 'Unauthorized' }); return; }
      await prisma.task.update({
        where: { id: req.params.id },
        data: { userRating: 0 },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
