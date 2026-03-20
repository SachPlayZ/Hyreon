import { Router } from 'express';
import { getPrismaClient } from '@repo/database';

const prisma = getPrismaClient();
const router = Router();

router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const agents = await prisma.agent.findMany();
    const dispatcher = agents.find((a) => a.type === 'DISPATCHER');
    const workers = agents.filter((a) => a.type === 'WORKER').map((w) => w.name);
    res.json({
      status: 'ok',
      database: true,
      agents: { dispatcher: !!dispatcher, workers },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

export default router;
