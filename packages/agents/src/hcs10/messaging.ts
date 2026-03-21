import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { config } from '../config';

const MIRROR_BASE = `https://${config.hedera.network}.mirrornode.hedera.com/api/v1`;

/**
 * Send a message on a connection topic using the HCS-10 SDK.
 * The SDK wraps it in the HCS-10 envelope ({ p: "hcs-10", op: "message", data, ... })
 * so third-party agents using the SDK's getMessages() can see it.
 *
 * `client` must be initialised with the sender's own account ID + private key.
 */
export async function sendMessageOnConnection(
  client: HCS10Client,
  connectionTopicId: string,
  data: object,
  memo?: string
): Promise<void> {
  await client.sendMessage(connectionTopicId, JSON.stringify(data), memo);
}

/**
 * Retrieve new messages from a connection topic using the HCS-10 SDK.
 * Only returns messages with the HCS-10 envelope (p: "hcs-10", op: "message").
 * Falls back to raw Mirror Node fetch for backwards compatibility with
 * messages sent before the SDK migration.
 */
export async function getNewMessages(
  client: HCS10Client,
  connectionTopicId: string,
  afterSequence = 0
): Promise<Array<{ sequence: number; data: any; timestamp: string }>> {
  // Try SDK-based retrieval first — this correctly parses HCS-10 envelopes
  try {
    const { messages } = await client.getMessages(connectionTopicId);

    return messages
      .filter((msg: any) => {
        const seq = msg.sequence_number ?? msg.sequenceNumber ?? 0;
        return seq > afterSequence;
      })
      .map((msg: any) => {
        const seq = msg.sequence_number ?? msg.sequenceNumber ?? 0;
        let parsedData: any;
        try {
          parsedData = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        } catch {
          parsedData = msg.data;
        }
        return {
          sequence: seq,
          data: parsedData,
          timestamp: msg.consensus_timestamp ?? '',
        };
      });
  } catch (err) {
    console.warn('[messaging] SDK getMessages failed, falling back to Mirror Node:', err);
  }

  // Fallback: raw Mirror Node fetch (handles legacy raw-JSON messages)
  const url = `${MIRROR_BASE}/topics/${connectionTopicId}/messages?limit=50&order=asc`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mirror Node error ${res.status} fetching topic ${connectionTopicId}: ${body}`);
  }
  const json = await res.json() as { messages: any[] };

  return (json.messages ?? [])
    .filter((msg: any) => msg.sequence_number > afterSequence)
    .flatMap((msg: any) => {
      try {
        const raw = Buffer.from(msg.message, 'base64').toString('utf8');
        const data = JSON.parse(raw);
        return [{ sequence: msg.sequence_number, data, timestamp: msg.consensus_timestamp }];
      } catch {
        return [];
      }
    });
}
