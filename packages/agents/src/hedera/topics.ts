import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
} from '@hashgraph/sdk';
import { getClient } from './client';

export async function createTopic(memo: string): Promise<string> {
  const client = getClient();
  const tx = new TopicCreateTransaction().setTopicMemo(memo);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return receipt.topicId!.toString();
}

export async function submitTopicMessage(
  topicId: string,
  message: string
): Promise<{ txId: string; sequenceNumber: number }> {
  const client = getClient();
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return {
    txId: response.transactionId.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber!),
  };
}
