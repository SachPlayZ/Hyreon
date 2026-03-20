import { TopicMessageSubmitTransaction, TopicId } from '@hashgraph/sdk';
import { HCS10Client } from '@hashgraphonline/standards-sdk';
import { getClient } from '../hedera/client';
import { config } from '../config';

const MIRROR_BASE = `https://${config.hedera.network}.mirrornode.hedera.com/api/v1`;

// Submit directly via the Hedera SDK signed by the operator.
// The HCS-10 SDK's sendMessage requires the agent sub-account keys which
// createAndRegisterAgent generates internally and never exposes — we can't use it.
// Messages still go through the same HCS topics and are fully verifiable on-chain.
export async function sendMessageOnConnection(
  _client: HCS10Client,
  connectionTopicId: string,
  data: object,
  memo?: string
): Promise<void> {
  const client = getClient();
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(connectionTopicId))
    .setMessage(JSON.stringify(data));
  if (memo) tx.setTransactionMemo(memo);
  const response = await tx.execute(client);
  await response.getReceipt(client);
}

// Fetch messages directly from Mirror Node REST API — bypasses the HCS-10 SDK
// which only returns messages in HCS-10 format and silently drops raw messages
// submitted via TopicMessageSubmitTransaction.
export async function getNewMessages(
  _client: HCS10Client,
  connectionTopicId: string,
  afterSequence = 0
): Promise<Array<{ sequence: number; data: any; timestamp: string }>> {
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
