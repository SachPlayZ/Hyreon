import { TopicMessageSubmitTransaction, TopicId, Client } from '@hashgraph/sdk';
import { createHash } from 'crypto';

export interface TaskReceipt {
  version: '1.0';
  type: 'task_receipt';
  taskId: string;
  dispatcher: string;
  worker: string;
  taskType: string;
  escrowAmount: number;
  platformFee: number;
  escrowTxId: string;
  releaseTxId?: string;
  resultHash: string;
  slaMet: boolean;
  slaSeconds: number;
  isThirdParty?: boolean;
  userRating?: number;
  completedAt: string;
}

export interface RatingReceiptData {
  taskId: string;
  agentId: string;
  stars: number;
  comment?: string;
  ratedAt: string;
}

export interface ReputationUpdateData {
  agentId: string;
  newScore: number;
  ratingAvg: number;
  slaCompletionRate: number;
  tasksCompleted: number;
  updatedAt: string;
}

export function computeResultHash(resultText: string): string {
  return createHash('sha256').update(resultText).digest('hex');
}

export async function writeReceipt(
  client: Client,
  receiptTopicId: string,
  receipt: TaskReceipt
): Promise<{ txId: string; sequenceNumber: number }> {
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(receiptTopicId))
    .setMessage(JSON.stringify(receipt))
    .setTransactionMemo('ahb:task-receipt');

  const response = await tx.execute(client);
  const hederaReceipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    sequenceNumber: Number(hederaReceipt.topicSequenceNumber!),
  };
}

export async function writeRatingReceipt(
  client: Client,
  topicId: string,
  ratingData: RatingReceiptData
): Promise<{ txId: string; sequenceNumber: number }> {
  const message = {
    version: '1.0',
    type: 'rating_receipt',
    ...ratingData,
  };

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(JSON.stringify(message))
    .setTransactionMemo('ahb:rating-receipt');

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber!),
  };
}

export async function writeReputationUpdate(
  client: Client,
  topicId: string,
  data: ReputationUpdateData
): Promise<{ txId: string; sequenceNumber: number }> {
  const message = {
    version: '1.0',
    type: 'reputation_update',
    ...data,
  };

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(JSON.stringify(message))
    .setTransactionMemo('ahb:reputation-update');

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    txId: response.transactionId.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber!),
  };
}
