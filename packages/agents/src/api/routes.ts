import { Router } from 'express';
import { DispatcherAgent } from '../dispatcher';
import usersRouter from './routes/users';
import { createTasksRouter } from './routes/tasks';
import agentsRouter from './routes/agents';
import healthRouter from './routes/health';

export function createRoutes(dispatcher: DispatcherAgent): Router {
  const router = Router();

  router.use('/users', usersRouter);
  router.use('/tasks', createTasksRouter(dispatcher));
  router.use('/agents', agentsRouter);
  router.use('/health', healthRouter);

  return router;
}
