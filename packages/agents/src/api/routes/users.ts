import { Router } from 'express';
import { TransferTransaction, Hbar, AccountId, PrivateKey } from '@hashgraph/sdk';
import { getPrismaClient } from '@repo/database';
import { config } from '../../config';
import { getClient } from '../../hedera/client';
import {
  getAccountBalance,
  findDepositTransaction,
  verifyEvmDeposit,
  getHashScanTxUrl,
} from '../../hedera/mirror';
import {
  createHederaAccount,
  createHederaAccountFromEvmKey,
  getHederaAccountByEvmAddress,
  verifyEvmSignature,
  getPlatformEvmAddress,
} from '../../hedera/accounts';
import { encryptPrivateKey, decryptPrivateKey } from '../../hedera/keyEncryption';
import { lookupEvmAddress } from '../../hedera/mirror';

const prisma = getPrismaClient();
const router: Router = Router();

// ── Helper: resolve EVM address for a user if missing ──
async function resolveUserEvmAddress(user: any): Promise<any> {
  if (user.evmAddress || !user.hederaAccountId) return user;
  const evmAddr = await lookupEvmAddress(user.hederaAccountId);
  if (evmAddr) {
    // Fire-and-forget DB update
    prisma.user.update({
      where: { id: user.id },
      data: { evmAddress: evmAddr },
    }).catch(() => {});
    user.evmAddress = evmAddr;
  }
  return user;
}

// GET /api/users/platform-config — public info about the platform (EVM address, network, chainId)
router.get('/platform-config', (_req, res) => {
  try {
    const network = config.hedera.network;
    const chainId = network === 'mainnet' ? 295 : 296;
    res.json({
      platformAccountId: config.hedera.operatorId,
      platformEvmAddress: getPlatformEvmAddress(),
      network,
      chainId,
      chainIdHex: `0x${chainId.toString(16)}`,
      rpcUrl: `https://${network}.hashio.io/api`,
      blockExplorer: `https://hashscan.io/${network}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/auth/google
// Exchange Google authorization code for tokens (auth code flow), then find or create user.
router.post('/auth/google', async (req, res) => {
  try {
    const { code, name } = req.body as { code: string; name?: string };
    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Google OAuth not configured on server' });
      return;
    }

    // Exchange the authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'postmessage', // required for popup/implicit redirect in @react-oauth/google
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json() as { error_description?: string };
      res.status(401).json({ error: err.error_description ?? 'Failed to exchange Google code' });
      return;
    }

    const tokens = await tokenRes.json() as { id_token?: string; access_token?: string };
    if (!tokens.id_token) {
      res.status(401).json({ error: 'No id_token returned from Google' });
      return;
    }

    // Decode the id_token payload (we trust it — we just got it directly from Google's token endpoint)
    const [, payloadB64] = tokens.id_token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid id_token payload' });
      return;
    }

    const googleId = payload.sub;
    const googleName = name?.trim() || payload.name || payload.email?.split('@')[0] || 'User';

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // First login — create a Hedera wallet funded with enough HBAR to cover tx fees
      // (operator pays this; the user will deposit their own HBAR separately)
      const wallet = await createHederaAccount(1);
      const encryptedKey = encryptPrivateKey(wallet.privateKeyDer);

      user = await prisma.user.create({
        data: {
          name: googleName,
          hederaAccountId: wallet.accountId,
          authProvider: 'GOOGLE',
          googleId,
          encryptedPrivateKey: encryptedKey,
        },
      });
    }

    // Never return the encrypted key to the client
    await resolveUserEvmAddress(user);
    const { encryptedPrivateKey: _omit, ...safeUser } = user as any;
    res.json({ user: safeUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/login-evm
// Verify MetaMask signature → find or create user linked to their EVM address
// If new user, `name` is required.
router.post('/login-evm', async (req, res) => {
  try {
    const { address, signature, timestamp, name } = req.body as {
      address: string;
      signature: string;
      timestamp: number;
      name?: string;
    };

    if (!address || !signature || !timestamp) {
      res.status(400).json({ error: 'address, signature, and timestamp are required' });
      return;
    }

    // Reject signatures older than 5 minutes
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      res.status(400).json({ error: 'Signature expired — please sign again' });
      return;
    }

    const message = `Login to Hyreon\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
    const { recoveredAddress, uncompressedPubKey } = verifyEvmSignature(address, message, signature);
    const normalizedAddress = recoveredAddress.toLowerCase();

    // Check if user already exists by EVM address
    let user = await prisma.user.findUnique({ where: { evmAddress: normalizedAddress } });

    if (!user) {
      // Also check legacy records (old login-evm stored evmAddress as hederaAccountId)
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { hederaAccountId: normalizedAddress },
            { hederaAccountId: recoveredAddress },
          ],
        },
      });
    }

    if (!user) {
      // New user — require a name
      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required for new users', newUser: true });
        return;
      }

      // Find or create the Hedera account linked to this EVM address
      let hederaAccountId = await getHederaAccountByEvmAddress(recoveredAddress);
      if (!hederaAccountId) {
        const created = await createHederaAccountFromEvmKey(uncompressedPubKey);
        hederaAccountId = created.accountId;
      }

      // Handle race condition: another request may have created it
      user = await prisma.user.findUnique({ where: { hederaAccountId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: name.trim(),
            hederaAccountId,
            authProvider: 'METAMASK',
            evmAddress: normalizedAddress,
          },
        });
      } else if (!user.evmAddress) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { evmAddress: normalizedAddress },
        });
      }
    }

    await resolveUserEvmAddress(user);
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/balance — platform balance (DB)
router.get('/:id/balance', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    res.json({
      hbarBalance: user.hbarBalance,
      hbarDeposited: user.hbarDeposited,
      hbarSpent: user.hbarSpent,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/wallet-balance — real on-chain balance from Mirror Node
router.get('/:id/wallet-balance', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const walletBalance = await getAccountBalance(user.hederaAccountId);
    res.json({ walletBalance, hederaAccountId: user.hederaAccountId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/deposit/initiate
// Returns platform account ID + unique memo so user can send real HBAR from their wallet
router.post('/:id/deposit/initiate', async (req, res) => {
  try {
    const { amount } = req.body as { amount: number };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const memo = `ahb:dep:${crypto.randomUUID().slice(0, 8)}`;

    const pendingTx = await prisma.userTransaction.create({
      data: {
        userId: user.id,
        type: 'deposit',
        amountHbar: amount,
        memo,
        status: 'pending',
      },
    });

    const platformAccountId = config.hedera.operatorId;
    const network = config.hedera.network;

    res.json({
      transactionId: pendingTx.id,
      platformAccountId,
      platformEvmAddress: getPlatformEvmAddress(),
      amount,
      memo,
      network,
      hashScanAccountUrl: `https://hashscan.io/${network}/account/${platformAccountId}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/deposit/verify
// Polls Mirror Node to confirm the on-chain transfer, then credits DB balance
router.post('/:id/deposit/verify', async (req, res) => {
  try {
    const { transactionId } = req.body as { transactionId: string };
    if (!transactionId) {
      res.status(400).json({ error: 'transactionId is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const pendingTx = await prisma.userTransaction.findUnique({ where: { id: transactionId } });
    if (!pendingTx || pendingTx.userId !== user.id) {
      res.status(400).json({ error: 'Invalid transaction' });
      return;
    }
    if (pendingTx.status !== 'pending') {
      res.status(400).json({ error: 'Transaction already processed' });
      return;
    }

    const deadline = Date.now() + 90_000;
    let found: { txId: string; timestamp: string } | null = null;

    while (Date.now() < deadline) {
      found = await findDepositTransaction(
        user.hederaAccountId,
        config.hedera.operatorId,
        pendingTx.amountHbar,
        pendingTx.memo!
      );
      if (found) break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (!found) {
      await prisma.userTransaction.update({
        where: { id: pendingTx.id },
        data: { status: 'failed' },
      });
      res.status(408).json({
        error: 'Transfer not found on chain. Ensure you sent the exact amount with the correct memo.',
      });
      return;
    }

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          hbarBalance: { increment: pendingTx.amountHbar },
          hbarDeposited: { increment: pendingTx.amountHbar },
        },
      }),
      prisma.userTransaction.update({
        where: { id: pendingTx.id },
        data: { status: 'confirmed', hederaTxId: found.txId },
      }),
    ]);

    res.json({
      user: updatedUser,
      hederaTxId: found.txId,
      hashScanUrl: getHashScanTxUrl(found.txId),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/deposit/confirm-evm
// MetaMask users: verify the EVM tx and credit balance
router.post('/:id/deposit/confirm-evm', async (req, res) => {
  try {
    const { txHash, amount, senderEvmAddress } = req.body as {
      txHash: string;
      amount: number;
      senderEvmAddress: string;
    };
    if (!txHash || !amount || !senderEvmAddress) {
      res.status(400).json({ error: 'txHash, amount, and senderEvmAddress are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const alreadyProcessed = await prisma.userTransaction.findFirst({
      where: { hederaTxId: txHash, status: 'confirmed' },
    });
    if (alreadyProcessed) {
      res.status(400).json({ error: 'Transaction already processed' });
      return;
    }

    const platformEvmAddress = getPlatformEvmAddress();

    // Verify directly via JSON-RPC relay — no polling needed, same source as MetaMask
    const result = await verifyEvmDeposit(txHash, senderEvmAddress, platformEvmAddress, amount);

    if (!result.valid) {
      res.status(400).json({ error: 'Could not verify transaction. Check that you sent to the correct address with the correct amount.' });
      return;
    }

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          hbarBalance: { increment: result.actualAmountHbar },
          hbarDeposited: { increment: result.actualAmountHbar },
        },
      }),
      prisma.userTransaction.create({
        data: {
          userId: user.id,
          type: 'deposit',
          amountHbar: result.actualAmountHbar,
          hederaTxId: txHash,
          status: 'confirmed',
          memo: 'evm',
        },
      }),
    ]);

    res.json({
      user: updatedUser,
      hederaTxId: txHash,
      hashScanUrl: getHashScanTxUrl(txHash),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/deposit/google
// Google auth users: platform uses stored encrypted key to transfer from their account to operator.
// Requires explicit { amount, confirmed: true } — the frontend must show a confirmation dialog first.
router.post('/:id/deposit/google', async (req, res) => {
  try {
    const { amount, confirmed } = req.body as { amount: number; confirmed: boolean };

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    if (!confirmed) {
      res.status(400).json({ error: 'confirmed must be true — user must explicitly approve this transfer' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (user.authProvider !== 'GOOGLE') {
      res.status(400).json({ error: 'This endpoint is only for Google auth users' });
      return;
    }
    if (!user.encryptedPrivateKey) {
      res.status(500).json({ error: 'No stored key found for this account — contact support' });
      return;
    }

    // Decrypt user's private key and execute transfer: user → operator
    const privateKeyDer = decryptPrivateKey(user.encryptedPrivateKey);
    const userPrivateKey = PrivateKey.fromStringDer(privateKeyDer);

    const client = getClient();
    const tx = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(user.hederaAccountId), new Hbar(-amount))
      .addHbarTransfer(AccountId.fromString(config.hedera.operatorId), new Hbar(amount))
      .setTransactionMemo(`ahb:dep:google:${user.id.slice(0, 8)}`);

    // The user's account must sign this since it's sending from their account
    const frozen = await tx.freezeWith(client);
    const signed = await frozen.sign(userPrivateKey);
    const response = await signed.execute(client);
    await response.getReceipt(client);
    const txId = response.transactionId.toString();

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          hbarBalance: { increment: amount },
          hbarDeposited: { increment: amount },
        },
      }),
      prisma.userTransaction.create({
        data: {
          userId: user.id,
          type: 'deposit',
          amountHbar: amount,
          hederaTxId: txId,
          status: 'confirmed',
          memo: 'google',
        },
      }),
    ]);

    res.json({
      user: updatedUser,
      hederaTxId: txId,
      hashScanUrl: getHashScanTxUrl(txId),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/withdraw
// Platform sends real HBAR from operator account → user's hederaAccountId on-chain
router.post('/:id/withdraw', async (req, res) => {
  try {
    const { amount } = req.body as { amount: number };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (user.hbarBalance < amount) {
      res.status(400).json({ error: `Insufficient platform balance. Available: ${user.hbarBalance.toFixed(2)} ℏ` });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { hbarBalance: { decrement: amount } },
    });

    let txId: string;
    try {
      const client = getClient();
      const tx = new TransferTransaction()
        .addHbarTransfer(AccountId.fromString(config.hedera.operatorId), new Hbar(-amount))
        .addHbarTransfer(AccountId.fromString(user.hederaAccountId), new Hbar(amount))
        .setTransactionMemo(`ahb:withdraw:${user.id.slice(0, 8)}`);

      const frozen = await tx.freezeWith(client);
      const response = await frozen.execute(client);
      await response.getReceipt(client);
      txId = response.transactionId.toString();
    } catch (txErr: any) {
      await prisma.user.update({
        where: { id: user.id },
        data: { hbarBalance: { increment: amount } },
      });
      throw txErr;
    }

    await prisma.userTransaction.create({
      data: {
        userId: user.id,
        type: 'withdraw',
        amountHbar: amount,
        hederaTxId: txId,
        status: 'confirmed',
      },
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });

    res.json({
      user: updatedUser,
      hederaTxId: txId,
      hashScanUrl: getHashScanTxUrl(txId),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/transactions — deposit/withdraw history
router.get('/:id/transactions', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const transactions = await prisma.userTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
