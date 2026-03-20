import { PrismaClient } from '../generated/prisma';

export * from '../generated/prisma';
export { PrismaClient };

let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
