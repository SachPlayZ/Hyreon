const HEDERA_NETWORK = process.env['HEDERA_NETWORK'] ?? 'testnet';
const MIRROR_BASE = `https://${HEDERA_NETWORK}.mirrornode.hedera.com`;

export async function getAccountBalance(accountId: string): Promise<number> {
  const res = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}`);
  if (!res.ok) return 0;
  const data = await res.json() as any;
  // Mirror Node returns balance in tinybars; 1 HBAR = 100,000,000 tinybars
  return data.balance?.balance ? data.balance.balance / 1e8 : 0;
}

const RPC_URL = `https://${HEDERA_NETWORK}.hashio.io/api`;

async function rpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as any;
  return json.result ?? null;
}

// Verify an EVM deposit using the JSON-RPC relay (same source MetaMask uses — no Mirror Node lag)
export async function verifyEvmDeposit(
  txHash: string,
  senderEvmAddress: string,
  platformEvmAddress: string,
  amountHbar: number
): Promise<{ valid: boolean; actualAmountHbar: number }> {
  try {
    const [tx, receipt] = await Promise.all([
      rpcCall('eth_getTransactionByHash', [txHash]),
      rpcCall('eth_getTransactionReceipt', [txHash]),
    ]);

    if (!tx) return { valid: false, actualAmountHbar: 0 };
    if (!receipt || receipt.status === '0x0') return { valid: false, actualAmountHbar: 0 };

    const normalize = (addr: string) => addr.toLowerCase().replace(/^0x/, '');
    const fromMatch = normalize(tx.from ?? '') === normalize(senderEvmAddress);
    const toMatch = normalize(tx.to ?? '') === normalize(platformEvmAddress);

    // Avoid Number precision loss — divide in two steps to stay within safe integer range
    // 1 HBAR = 10^18 weibars → ÷10^10 → tinybars → ÷10^8 → HBAR
    const weibars = BigInt(tx.value ?? '0x0');
    const tinybars = weibars / BigInt(10_000_000_000);
    const actualAmountHbar = Number(tinybars) / 1e8;
    const amountMatch = actualAmountHbar >= amountHbar - 0.01;

    return { valid: fromMatch && toMatch && amountMatch, actualAmountHbar };
  } catch {
    return { valid: false, actualAmountHbar: 0 };
  }
}

export async function findDepositTransaction(
  senderAccountId: string,
  receiverAccountId: string,
  amountHbar: number,
  memo: string
): Promise<{ txId: string; timestamp: string } | null> {
  // Query recent CRYPTOTRANSFER transactions involving the receiver
  const url = `${MIRROR_BASE}/api/v1/transactions?account.id=${receiverAccountId}&transactiontype=CRYPTOTRANSFER&order=desc&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as any;
  const txs: any[] = data.transactions ?? [];

  for (const tx of txs) {
    // Decode memo
    const decodedMemo = tx.memo_base64
      ? Buffer.from(tx.memo_base64, 'base64').toString('utf-8')
      : '';
    if (decodedMemo !== memo) continue;

    const transfers: any[] = tx.transfers ?? [];
    const senderTransfer = transfers.find(
      (t: any) => t.account === senderAccountId && t.amount < 0
    );
    const receiverTransfer = transfers.find(
      (t: any) => t.account === receiverAccountId && t.amount > 0
    );
    if (!senderTransfer || !receiverTransfer) continue;

    const receivedHbar = receiverTransfer.amount / 1e8;
    if (Math.abs(receivedHbar - amountHbar) < 0.01) {
      return { txId: tx.transaction_id, timestamp: tx.consensus_timestamp };
    }
  }
  return null;
}

export async function getTopicMessage(
  topicId: string,
  sequenceNumber: number
): Promise<{ message: string; consensusTimestamp: string; payerAccountId: string }> {
  const url = `${MIRROR_BASE}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  return {
    message: Buffer.from(data.message, 'base64').toString('utf-8'),
    consensusTimestamp: data.consensus_timestamp,
    payerAccountId: data.payer_account_id,
  };
}

export async function getTransaction(txId: string): Promise<any> {
  const url = `${MIRROR_BASE}/api/v1/transactions/${txId}`;
  const res = await fetch(url);
  return res.json();
}

/**
 * Look up the EVM address for a Hedera account ID via Mirror Node.
 * Returns the 0x-prefixed EVM address or null if not found.
 */
export async function lookupEvmAddress(accountId: string): Promise<string | null> {
  try {
    const res = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.evm_address ?? null;
  } catch {
    return null;
  }
}

export function getHashScanTxUrl(txId: string): string {
  return `https://hashscan.io/${HEDERA_NETWORK}/transaction/${txId}`;
}

export function getHashScanTopicUrl(topicId: string): string {
  return `https://hashscan.io/${HEDERA_NETWORK}/topic/${topicId}`;
}

export function getHashScanAccountUrl(accountId: string): string {
  return `https://hashscan.io/${HEDERA_NETWORK}/account/${accountId}`;
}
