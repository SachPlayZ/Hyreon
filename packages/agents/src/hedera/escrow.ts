import {
  TransferTransaction,
  Hbar,
  AccountId,
  TopicMessageSubmitTransaction,
  TopicId,
  Client,
} from '@hashgraph/sdk';

export class EscrowManager {
  private client: Client;
  private operatorId: string;
  private escrowTopicId: string;

  constructor(client: Client, operatorId: string, escrowTopicId: string) {
    this.client = client;
    this.operatorId = operatorId;
    this.escrowTopicId = escrowTopicId;
  }

  async createEscrow(
    taskId: string,
    workerAccountId: string,
    amountHbar: number
  ): Promise<{ txId: string; sequenceNumber: number }> {
    const escrowIntent = {
      type: 'escrow_created',
      taskId,
      amount: amountHbar,
      currency: 'HBAR',
      from: this.operatorId,
      to: workerAccountId,
      timestamp: new Date().toISOString(),
    };

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(this.escrowTopicId))
      .setMessage(JSON.stringify(escrowIntent));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      txId: response.transactionId.toString(),
      sequenceNumber: Number(receipt.topicSequenceNumber!),
    };
  }

  async createEscrowWithFee(
    taskId: string,
    workerAccountId: string,
    grossAmount: number,
    feePercent: number
  ): Promise<{ txId: string; sequenceNumber: number; platformFee: number; netAmount: number }> {
    const platformFee = grossAmount * feePercent;
    const netAmount = grossAmount - platformFee;

    const escrowIntent = {
      type: 'escrow_created',
      taskId,
      grossAmount,
      platformFee,
      netAmount,
      currency: 'HBAR',
      from: this.operatorId,
      to: workerAccountId,
      timestamp: new Date().toISOString(),
    };

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(this.escrowTopicId))
      .setMessage(JSON.stringify(escrowIntent));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      txId: response.transactionId.toString(),
      sequenceNumber: Number(receipt.topicSequenceNumber!),
      platformFee,
      netAmount,
    };
  }

  async releaseEscrow(
    workerAccountId: string,
    amountHbar: number,
    taskId: string
  ): Promise<string> {
    const tx = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(this.operatorId), new Hbar(-amountHbar))
      .addHbarTransfer(AccountId.fromString(workerAccountId), new Hbar(amountHbar))
      .setTransactionMemo(`ahb:escrow:release:${taskId}`);

    const frozen = await tx.freezeWith(this.client);
    const response = await frozen.execute(this.client);
    await response.getReceipt(this.client);
    return response.transactionId.toString();
  }

  // Single atomic transfer: operator → worker (net) + treasury (fee)
  async releaseEscrowWithTreasury(
    workerAccountId: string,
    netAmount: number,
    treasuryAccountId: string,
    platformFee: number,
    taskId: string
  ): Promise<{ txId: string }> {
    const grossAmount = netAmount + platformFee;

    const tx = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(this.operatorId), new Hbar(-grossAmount))
      .addHbarTransfer(AccountId.fromString(workerAccountId), new Hbar(netAmount))
      .addHbarTransfer(AccountId.fromString(treasuryAccountId), new Hbar(platformFee))
      .setTransactionMemo(`ahb:release:${taskId}`);

    const frozen = await tx.freezeWith(this.client);
    const response = await frozen.execute(this.client);
    await response.getReceipt(this.client);
    return { txId: response.transactionId.toString() };
  }

  async refundEscrow(taskId: string, amountHbar: number): Promise<string> {
    const refundIntent = {
      type: 'escrow_refunded',
      taskId,
      amount: amountHbar,
      timestamp: new Date().toISOString(),
    };

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(this.escrowTopicId))
      .setMessage(JSON.stringify(refundIntent));

    const response = await tx.execute(this.client);
    return response.transactionId.toString();
  }
}
