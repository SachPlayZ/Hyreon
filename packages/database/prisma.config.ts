import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env since prisma.config.ts skips automatic env loading
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async resolveDirectUrl() {
      return process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';
    },
  },
});
