import express from 'express';
import cors from 'cors';
import { createRoutes } from './routes';
import { DispatcherAgent } from '../dispatcher';

export function createServer(dispatcher: DispatcherAgent) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', createRoutes(dispatcher));
  return app;
}
