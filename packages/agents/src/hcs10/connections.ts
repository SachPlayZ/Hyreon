import { HCS10Client } from '@hashgraphonline/standards-sdk';

export async function initiateConnection(
  client: HCS10Client,
  workerInboundTopicId: string
): Promise<string> {
  const receipt = await client.submitConnectionRequest(
    workerInboundTopicId,
    'Agent Hiring Board connection request'
  );
  return receipt.transactionId.toString();
}

export async function acceptConnection(
  client: HCS10Client,
  workerInboundTopicId: string,
  requestingAccountId: string,
  connectionRequestId: string
): Promise<string> {
  const response = await client.handleConnectionRequest(
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
  const confirmation = await client.waitForConnectionConfirmation(
    inboundTopicId,
    connectionRequestId,
    30,
    2000
  );
  return confirmation.connectionTopicId;
}
