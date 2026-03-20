import {
  AccountCreateTransaction,
  PrivateKey,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk';
import { ethers } from 'ethers';
import { getClient } from './client';
import { config } from '../config';

// Returns the operator account's EVM address (derived from its ECDSA public key)
export function getPlatformEvmAddress(): string {
  const key = PrivateKey.fromStringECDSA(config.hedera.operatorKey);
  return key.publicKey.toEvmAddress(); // e.g. "0xabc123..."
}

const MIRROR_BASE = `https://${process.env['HEDERA_NETWORK'] ?? 'testnet'}.mirrornode.hedera.com`;

// Create a brand new Hedera ECDSA account — returns keys to give to the user
export async function createHederaAccount(initialBalanceHbar = 0): Promise<{
  accountId: string;
  privateKeyDer: string;
  publicKeyDer: string;
  evmAddress: string;
}> {
  const client = getClient();
  const newKey = PrivateKey.generateECDSA();

  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(initialBalanceHbar))
    .setMaxTransactionFee(new Hbar(2))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId!.toString();

  return {
    accountId,
    privateKeyDer: newKey.toStringDer(),
    publicKeyDer: newKey.publicKey.toStringDer(),
    evmAddress: newKey.publicKey.toEvmAddress(),
  };
}

// Look up a Hedera account ID linked to an EVM address via Mirror Node.
// Uses the direct account lookup by EVM address — works for both aliased accounts
// (created via EVM) and native Hedera accounts whose key maps to the EVM address.
export async function getHederaAccountByEvmAddress(
  evmAddress: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${MIRROR_BASE}/api/v1/accounts/${evmAddress.toLowerCase()}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.account ?? null;
  } catch {
    return null;
  }
}

// Create a Hedera account linked to an existing EVM public key (recovered from MetaMask signature)
export async function createHederaAccountFromEvmKey(
  uncompressedPubKeyHex: string // 65 bytes uncompressed, no "0x" prefix
): Promise<{ accountId: string; evmAddress: string }> {
  const client = getClient();

  // Hedera SDK expects compressed ECDSA public key (33 bytes)
  const compressed = ethers.SigningKey.computePublicKey('0x' + uncompressedPubKeyHex, true);
  const pubKeyBytes = Buffer.from(compressed.slice(2), 'hex'); // strip "0x", 33 bytes
  const hederaPublicKey = PublicKey.fromBytesECDSA(pubKeyBytes);

  const tx = await new AccountCreateTransaction()
    .setKey(hederaPublicKey)
    .setInitialBalance(new Hbar(0))
    .setMaxTransactionFee(new Hbar(2))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId!.toString();

  return {
    accountId,
    evmAddress: hederaPublicKey.toEvmAddress(),
  };
}

// Verify a MetaMask personal_sign signature and return the recovered EVM address + public key
export function verifyEvmSignature(
  address: string,
  message: string,
  signature: string
): { recoveredAddress: string; uncompressedPubKey: string } {
  const recoveredAddress = ethers.verifyMessage(message, signature);

  if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Signature verification failed — address mismatch');
  }

  // Recover the full public key (needed to create Hedera account)
  const digest = ethers.hashMessage(message);
  const sig = ethers.Signature.from(signature);
  const uncompressedPubKey = ethers.SigningKey.recoverPublicKey(digest, sig).slice(2); // remove "0x"

  return { recoveredAddress, uncompressedPubKey };
}
