export interface EscrowState {
  taskId: string;
  workerAccountId: string;
  amountHbar: number;
  escrowTxId: string;
  sequenceNumber: number;
  status: 'created' | 'released' | 'refunded';
  platformFee?: number;
}

export interface PaymentReceipt {
  taskId: string;
  releaseTxId: string;
  amount: number;
  platformFee: number;
  receiptTopicId: string;
  receiptSequenceNumber: number;
}
