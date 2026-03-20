import { Client, AccountId, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config';

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = Client.forTestnet();
    _client.setOperator(
      AccountId.fromString(config.hedera.operatorId),
      PrivateKey.fromStringECDSA(config.hedera.operatorKey)
    );
  }
  return _client;
}
