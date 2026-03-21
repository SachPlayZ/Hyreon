import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { getPrismaClient } from '@repo/database';
import { createTopic } from '../hedera/topics';
import { config } from '../config';

const prisma = getPrismaClient();
const MIRROR_BASE = `https://${config.hedera.network}.mirrornode.hedera.com/api/v1`;

// ── Existing HCS-10 SDK wrappers ──

export async function initiateConnection(
  client: HCS10Client,
  workerInboundTopicId: string
): Promise<string> {
  const receipt = await client.submitConnectionRequest(
    workerInboundTopicId,
    'Hyeron connection request'
  ) as any;
  return receipt.transactionId.toString();
}

export async function acceptConnection(
  client: HCS10Client,
  workerInboundTopicId: string,
  requestingAccountId: string,
  connectionRequestId: string
): Promise<string> {
  const response = await (client as any).handleConnectionRequest(
    workerInboundTopicId,
    requestingAccountId,
    connectionRequestId
  );
  return response.connectionTopicId;
}

export async function waitForConnection(
  client: HCS10Client,
  inboundTopicId: string,
  connectionRequestId: string
): Promise<string> {
  const confirmation = await (client as any).waitForConnectionConfirmation(
    inboundTopicId,
    connectionRequestId,
    30,
    2000
  );
  return confirmation.connectionTopicId;
}

// ── Reusable connection helpers ──

/**
 * Ensure a connection exists between dispatcher and worker.
 * Creates a direct HCS topic (bypasses HCS-10 handshake) for platform-managed agents.
 */
export async function ensureConnectionBetween(
  dispatcherAccountId: string,
  workerAccountId: string,
  dispatcherName?: string,
  workerName?: string
): Promise<{ connectionTopicId: string; isNew: boolean }> {
  const existingConn = await prisma.connection.findFirst({
    where: { dispatcherAccountId, workerAccountId },
  });

  if (existingConn) {
    console.log(
      `[Connection] ${dispatcherName ?? dispatcherAccountId} <-> ${workerName ?? workerAccountId} already exists (${existingConn.connectionTopicId})`
    );
    return { connectionTopicId: existingConn.connectionTopicId, isNew: false };
  }

  console.log(
    `[Connection] Creating topic ${dispatcherName ?? dispatcherAccountId} <-> ${workerName ?? workerAccountId}...`
  );

  const connectionTopicId = await createTopic(
    `ahb:connection:${dispatcherAccountId}:${workerAccountId}`
  );

  await prisma.connection.create({
    data: { dispatcherAccountId, workerAccountId, connectionTopicId },
  });

  console.log(`[Connection] Topic created: ${connectionTopicId}`);
  return { connectionTopicId, isNew: true };
}

// ── HCS-10 handshake for self-managed agents (Flow B) ──

/**
 * Initiate an HCS-10 connection handshake with an external agent.
 * The external agent must accept the request on their side.
 */
export async function initiateHCS10Handshake(
  client: HCS10Client,
  workerInboundTopicId: string
): Promise<{ connectionRequestId: string }> {
  const receipt = await client.submitConnectionRequest(
    workerInboundTopicId,
    'Hyeron marketplace connection request'
  ) as any;
  return { connectionRequestId: receipt.transactionId.toString() };
}

/**
 * Check if an HCS-10 handshake has completed (non-blocking).
 * Returns the connectionTopicId if the external agent accepted, null otherwise.
 */
export async function checkHandshakeComplete(
  client: HCS10Client,
  dispatcherInboundTopicId: string,
  connectionRequestId: string
): Promise<string | null> {
  try {
    const confirmation = await (client as any).waitForConnectionConfirmation(
      dispatcherInboundTopicId,
      connectionRequestId,
      5, // short timeout — non-blocking check
      2000
    );
    return confirmation.connectionTopicId;
  } catch {
    return null; // not yet accepted
  }
}

/**
 * Verify a Hedera topic exists via Mirror Node.
 */
export async function verifyTopicExists(topicId: string): Promise<boolean> {
  try {
    const res = await fetch(`${MIRROR_BASE}/topics/${topicId}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Verify a Hedera account exists via Mirror Node.
 */
export async function verifyAccountExists(accountId: string): Promise<boolean> {
  try {
    const res = await fetch(`${MIRROR_BASE}/accounts/${accountId}`);
    return res.ok;
  } catch {
    return false;
  }
}
