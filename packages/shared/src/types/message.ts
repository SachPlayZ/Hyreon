export interface TaskRequestMessage {
  type: 'task_request';
  taskId: string;
  taskType: 'summarization' | 'content_generation';
  payload: string;
  escrowTxId: string;
  escrowAmount: number;
}

export interface TaskResultMessage {
  type: 'task_result';
  taskId: string;
  status: 'completed' | 'failed';
  result: string;
  executionTimeMs: number;
}

export interface PaymentReleasedMessage {
  type: 'payment_released';
  taskId: string;
  releaseTxId: string;
  amount: number;
  receiptTopicId: string;
  receiptSequenceNumber: number;
}

export type HCS10Message = TaskRequestMessage | TaskResultMessage | PaymentReleasedMessage;
