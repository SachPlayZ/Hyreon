'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import {
  initiateDeposit,
  verifyDeposit,
  confirmEvmDeposit,
  depositGoogle,
  getPlatformConfig,
  withdrawHbar,
  getWalletBalance,
  getUserTransactions,
} from '@/lib/api';
import { ConfirmTransactionModal } from '@/components/ui/ConfirmTransactionModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  User,
  Clock,
  ChevronRight,
  Zap,
} from 'lucide-react';

type DepositStep = 'idle' | 'initiated' | 'verifying' | 'done';
type DepositMode = 'metamask' | 'manual' | 'google';

interface DepositInfo {
  transactionId: string;
  platformAccountId: string;
  platformEvmAddress: string;
  amount: number;
  memo: string;
  hashScanAccountUrl: string;
}

interface PlatformConfig {
  platformAccountId: string;
  platformEvmAddress: string;
  network: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  blockExplorer: string;
}

interface TxRecord {
  id: string;
  type: 'deposit' | 'withdraw';
  amountHbar: number;
  hederaTxId: string | null;
  status: string;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser, refreshBalance, logout } = useUser();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositStep, setDepositStep] = useState<DepositStep>('idle');
  const [depositMode, setDepositMode] = useState<DepositMode>(
    user?.authProvider === 'GOOGLE' ? 'google' : 'metamask'
  );
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [depositError, setDepositError] = useState('');
  const [depositSuccess, setDepositSuccess] = useState('');
  const [depositTxUrl, setDepositTxUrl] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum;

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');
  const [withdrawTxUrl, setWithdrawTxUrl] = useState('');

  const [copied, setCopied] = useState<string>('');

  // Google deposit confirmation modal
  const [googleDepositConfirmOpen, setGoogleDepositConfirmOpen] = useState(false);
  const [googleDepositLoading, setGoogleDepositLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const loadWalletBalance = useCallback(async () => {
    if (!user) return;
    setWalletLoading(true);
    try {
      const data = await getWalletBalance(user.id);
      setWalletBalance(data.walletBalance);
    } catch {
      setWalletBalance(null);
    } finally {
      setWalletLoading(false);
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const data = await getUserTransactions(user.id);
      setTxHistory(data.transactions);
    } catch {
      setTxHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadWalletBalance();
    loadHistory();
  }, [loadWalletBalance, loadHistory]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  // MetaMask direct send
  const handleMetaMaskDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { setDepositError('Enter a valid amount'); return; }
    if (!window.ethereum) { setDepositError('MetaMask not detected'); return; }

    setDepositLoading(true);
    setDepositError('');
    try {
      // Load platform config if needed
      const cfg: PlatformConfig = platformConfig ?? await getPlatformConfig().then((d) => { setPlatformConfig(d); return d; });

      // Ensure MetaMask is on Hedera network
      const currentChainId: string = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId !== cfg.chainIdHex) {
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: cfg.chainIdHex }] });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            // Network not added yet — add it
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: cfg.chainIdHex,
                chainName: `Hedera ${cfg.network.charAt(0).toUpperCase() + cfg.network.slice(1)}`,
                nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
                rpcUrls: [cfg.rpcUrl],
                blockExplorerUrls: [cfg.blockExplorer],
              }],
            });
          } else throw switchErr;
        }
      }

      const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const senderEvmAddress = accounts[0];

      // 1 HBAR = 10^18 weibars on Hedera EVM (same denomination as ETH/wei)
      const valueWei = BigInt(Math.floor(amt * 1e18));
      const valueHex = '0x' + valueWei.toString(16);

      const txHash: string = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: senderEvmAddress, to: cfg.platformEvmAddress, value: valueHex }],
      });

      setDepositStep('verifying');

      // Wait for the EVM receipt directly — much faster and more reliable than Mirror Node polling
      const deadline = Date.now() + 60_000;
      let evmReceipt: any = null;
      while (!evmReceipt && Date.now() < deadline) {
        evmReceipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });
        if (!evmReceipt) await new Promise((r) => setTimeout(r, 1500));
      }
      if (!evmReceipt) throw new Error('Transaction did not confirm within 60 seconds');
      if (evmReceipt.status === '0x0') throw new Error('Transaction reverted on-chain');

      const data = await confirmEvmDeposit(user!.id, txHash, amt, senderEvmAddress);
      setUser({ ...user!, hbarBalance: data.user.hbarBalance, hbarDeposited: data.user.hbarDeposited, hbarSpent: data.user.hbarSpent });
      setDepositTxUrl(data.hashScanUrl);
      setDepositSuccess(`${amt} ℏ confirmed on-chain and added to your balance.`);
      setDepositStep('done');
      loadWalletBalance();
      loadHistory();
    } catch (err: any) {
      if (err.code === 4001) setDepositError('Transaction rejected in MetaMask');
      else setDepositError(err.message ?? 'Deposit failed');
      setDepositStep('idle');
    } finally {
      setDepositLoading(false);
    }
  };

  // Manual flow: Step 1 — get memo + platform account from backend
  const handleInitiateDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { setDepositError('Enter a valid amount'); return; }
    setDepositLoading(true);
    setDepositError('');
    try {
      const data = await initiateDeposit(user!.id, amt);
      setDepositInfo(data);
      setDepositStep('initiated');
    } catch (err: any) {
      setDepositError(err.message ?? 'Failed to initiate deposit');
    } finally {
      setDepositLoading(false);
    }
  };

  // Manual flow: Step 2 — poll Mirror Node for memo-based transfer
  const handleVerifyDeposit = async () => {
    if (!depositInfo) return;
    setDepositStep('verifying');
    setDepositError('');
    try {
      const data = await verifyDeposit(user!.id, depositInfo.transactionId);
      setUser({ ...user!, hbarBalance: data.user.hbarBalance, hbarDeposited: data.user.hbarDeposited, hbarSpent: data.user.hbarSpent });
      setDepositTxUrl(data.hashScanUrl);
      setDepositSuccess(`Confirmed! ${depositInfo.amount} ℏ added to your platform balance.`);
      setDepositStep('done');
      loadWalletBalance();
      loadHistory();
    } catch (err: any) {
      setDepositError(err.message ?? 'Could not verify transfer');
      setDepositStep('initiated');
    }
  };

  const resetDeposit = () => {
    setDepositStep('idle');
    setDepositInfo(null);
    setDepositAmount('');
    setDepositError('');
    setDepositSuccess('');
    setDepositTxUrl('');
  };

  // Google deposit: called after the user approves the ConfirmTransactionModal
  const handleGoogleDepositConfirmed = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setGoogleDepositLoading(true);
    setDepositError('');
    try {
      const data = await depositGoogle(user!.id, amt);
      setUser({ ...user!, hbarBalance: data.user.hbarBalance, hbarDeposited: data.user.hbarDeposited, hbarSpent: data.user.hbarSpent });
      setDepositTxUrl(data.hashScanUrl);
      setDepositSuccess(`${amt} ℏ confirmed on-chain and added to your balance.`);
      setDepositStep('done');
      setGoogleDepositConfirmOpen(false);
      loadWalletBalance();
      loadHistory();
    } catch (err: any) {
      setDepositError(err.message ?? 'Deposit failed');
      setGoogleDepositConfirmOpen(false);
    } finally {
      setGoogleDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError('');
    setWithdrawSuccess('');
    try {
      const data = await withdrawHbar(user!.id, amt);
      setUser({ ...user!, hbarBalance: data.user.hbarBalance, hbarDeposited: data.user.hbarDeposited, hbarSpent: data.user.hbarSpent });
      setWithdrawTxUrl(data.hashScanUrl);
      setWithdrawSuccess(`Sent ${amt} ℏ to your wallet on-chain.`);
      setWithdrawAmount('');
      loadWalletBalance();
      loadHistory();
    } catch (err: any) {
      setWithdrawError(err.message ?? 'Withdrawal failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <User size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{user.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{user.hederaAccountId}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={logout} className="text-muted-foreground text-xs">
          Sign out
        </Button>
      </div>

      {/* Balance overview */}
      <div className="grid grid-cols-2 gap-3">
        {/* On-chain wallet balance */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">On-chain Wallet</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadWalletBalance}
                className="h-6 w-6 p-0 text-muted-foreground"
              >
                <RefreshCw size={11} className={walletLoading ? 'animate-spin' : ''} />
              </Button>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {walletLoading
                ? '…'
                : walletBalance !== null
                  ? walletBalance.toFixed(2)
                  : '—'}
              <span className="text-sm text-muted-foreground font-normal ml-1">ℏ</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Live from Mirror Node</p>
          </CardContent>
        </Card>

        {/* Platform balance */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Platform Balance</p>
              <Zap size={12} className="text-primary" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-primary">
              {user.hbarBalance.toFixed(2)}
              <span className="text-sm text-primary/60 font-normal ml-1">ℏ</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Available for tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/20 border border-border/30 rounded-xl px-4 py-3 text-center">
          <p className="text-lg font-semibold">{user.hbarDeposited.toFixed(2)} ℏ</p>
          <p className="text-xs text-muted-foreground">Total Deposited</p>
        </div>
        <div className="bg-muted/20 border border-border/30 rounded-xl px-4 py-3 text-center">
          <p className="text-lg font-semibold">{user.hbarSpent.toFixed(2)} ℏ</p>
          <p className="text-xs text-muted-foreground">Total Spent on Tasks</p>
        </div>
      </div>

      {/* Deposit card */}
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownToLine size={15} className="text-emerald-400" />
            Deposit HBAR
          </CardTitle>
          <CardDescription className="text-xs">
            Send real HBAR from your Hedera wallet to the platform. Verified on-chain via Mirror Node.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {depositStep === 'done' ? (
            <div className="space-y-3">
              <Alert className="py-3 border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <AlertDescription className="text-xs text-emerald-400">{depositSuccess}</AlertDescription>
              </Alert>
              {depositTxUrl && (
                <a href={depositTxUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink size={11} /> View on HashScan
                </a>
              )}
              <Button variant="outline" size="sm" onClick={resetDeposit} className="w-full text-xs">
                Make another deposit
              </Button>
            </div>
          ) : depositStep === 'initiated' ? (
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-400">
                  Send exactly {depositInfo!.amount} ℏ to this account:
                </p>
                {/* Platform account */}
                <div className="flex items-center justify-between bg-card/80 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-muted-foreground">To (Platform Account)</p>
                    <p className="font-mono text-sm font-semibold">{depositInfo!.platformAccountId}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(depositInfo!.platformAccountId, 'account')}
                  >
                    {copied === 'account' ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </Button>
                </div>
                {/* Memo — REQUIRED */}
                <div className="flex items-center justify-between bg-card/80 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Memo (required — do not skip)</p>
                    <p className="font-mono text-sm font-semibold">{depositInfo!.memo}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(depositInfo!.memo, 'memo')}
                  >
                    {copied === 'memo' ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The memo is used to identify your transfer. Without it, your deposit cannot be confirmed.
                </p>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Send from any Hedera wallet (HashPack, Blade, etc.), then click below.
              </p>

              {depositStep === 'initiated' && (
                <Button
                  onClick={handleVerifyDeposit}
                  className="w-full gap-2 glow-purple"
                >
                  <CheckCircle2 size={14} />
                  I've sent the transfer — Verify Now
                </Button>
              )}

              {depositError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle size={13} />
                  <AlertDescription className="text-xs">{depositError}</AlertDescription>
                </Alert>
              )}

              <Button variant="ghost" size="sm" onClick={resetDeposit} className="w-full text-xs text-muted-foreground">
                Cancel
              </Button>
            </div>
          ) : depositStep === 'verifying' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Scanning Mirror Node…</p>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Looking for your transfer on Hedera Testnet. This can take up to 90 seconds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mode toggle */}
              <div className="flex rounded-xl border border-border/50 overflow-hidden">
                {user.authProvider === 'GOOGLE' ? (
                  <button
                    onClick={() => setDepositMode('google')}
                    className="flex-1 py-2 text-xs font-medium bg-primary text-primary-foreground"
                  >
                    Platform Transfer
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setDepositMode('metamask')}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        depositMode === 'metamask'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      MetaMask
                    </button>
                    <button
                      onClick={() => setDepositMode('manual')}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        depositMode === 'manual'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Manual Transfer
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="depositAmount">Amount (HBAR)</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="10.00"
                  min="0.01"
                  step="0.01"
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDepositAmount(String(p))}
                    className="text-xs font-mono"
                  >
                    {p} ℏ
                  </Button>
                ))}
              </div>
              {depositError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle size={13} />
                  <AlertDescription className="text-xs">{depositError}</AlertDescription>
                </Alert>
              )}
              {depositMode === 'google' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    The platform will transfer HBAR from your managed Hedera account ({user.hederaAccountId}) to the platform. You'll be asked to approve before anything moves.
                  </p>
                  <Button
                    onClick={() => {
                      const amt = parseFloat(depositAmount);
                      if (!amt || amt <= 0) { setDepositError('Enter a valid amount'); return; }
                      setDepositError('');
                      setGoogleDepositConfirmOpen(true);
                    }}
                    disabled={googleDepositLoading}
                    className="w-full gap-2 glow-purple"
                  >
                    {googleDepositLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                    {googleDepositLoading ? 'Processing…' : 'Deposit via Platform'}
                  </Button>
                </>
              ) : depositMode === 'metamask' ? (
                <>
                  <Button
                    onClick={handleMetaMaskDeposit}
                    disabled={depositLoading || !hasMetaMask}
                    className="w-full gap-2 glow-purple"
                  >
                    {depositLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {depositLoading ? 'Sending…' : hasMetaMask ? 'Send via MetaMask' : 'MetaMask not detected'}
                  </Button>
                  {!hasMetaMask && (
                    <p className="text-xs text-muted-foreground text-center">
                      Install MetaMask browser extension to use this option.
                    </p>
                  )}
                </>
              ) : (
                <Button
                  onClick={handleInitiateDeposit}
                  disabled={depositLoading}
                  className="w-full gap-2 glow-purple"
                >
                  {depositLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                  {depositLoading ? 'Preparing…' : 'Get Deposit Instructions'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdraw card */}
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpFromLine size={15} className="text-primary" />
            Withdraw HBAR
          </CardTitle>
          <CardDescription className="text-xs">
            Platform sends real HBAR from escrow directly to your Hedera account on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="withdrawAmount">Amount (HBAR)</Label>
            <Input
              id="withdrawAmount"
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="5.00"
              min="0.01"
              step="0.01"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Available: <span className="font-mono text-foreground">{user.hbarBalance.toFixed(2)} ℏ</span>
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 5, 10, 25].map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount(String(p))}
                className="text-xs font-mono"
              >
                {p} ℏ
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted/20 border border-border/40 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground">To</p>
              <p className="font-mono text-sm">{user.hederaAccountId}</p>
            </div>
          </div>
          {withdrawError && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle size={13} />
              <AlertDescription className="text-xs">{withdrawError}</AlertDescription>
            </Alert>
          )}
          {withdrawSuccess && (
            <div className="space-y-2">
              <Alert className="py-2 border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <AlertDescription className="text-xs text-emerald-400">{withdrawSuccess}</AlertDescription>
              </Alert>
              {withdrawTxUrl && (
                <a href={withdrawTxUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink size={11} /> View on HashScan
                </a>
              )}
            </div>
          )}
          <Button
            onClick={handleWithdraw}
            disabled={withdrawLoading}
            variant="outline"
            className="w-full gap-2"
          >
            {withdrawLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}
            {withdrawLoading ? 'Sending on-chain…' : 'Withdraw to Wallet'}
          </Button>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              Transaction History
            </CardTitle>
            <CardDescription className="text-xs">Your deposits and withdrawals</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadHistory} className="h-7 w-7 p-0 text-muted-foreground">
            <RefreshCw size={11} className={historyLoading ? 'animate-spin' : ''} />
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : txHistory.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {txHistory.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`size-8 rounded-lg flex items-center justify-center ${
                      tx.type === 'deposit'
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-primary/10 border border-primary/20'
                    }`}>
                      {tx.type === 'deposit'
                        ? <ArrowDownToLine size={13} className="text-emerald-400" />
                        : <ArrowUpFromLine size={13} className="text-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{tx.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className={`text-sm font-mono font-semibold ${
                        tx.type === 'deposit' ? 'text-emerald-400' : 'text-foreground'
                      }`}>
                        {tx.type === 'deposit' ? '+' : '-'}{tx.amountHbar.toFixed(2)} ℏ
                      </p>
                      <Badge
                        variant={tx.status === 'confirmed' ? 'default' : tx.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {tx.status}
                      </Badge>
                    </div>
                    {tx.hederaTxId && (
                      <a
                        href={`https://hashscan.io/testnet/transaction/${tx.hederaTxId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="opacity-20" />

      {/* Account info footer */}
      <div className="bg-muted/10 border border-border/30 rounded-xl p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Info</p>
        {[
          { label: 'User ID', value: user.id.slice(0, 16) + '…' },
          { label: 'Hedera Account', value: user.hederaAccountId },
          { label: 'Network', value: 'Hedera Testnet' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-mono text-xs">{value}</span>
          </div>
        ))}
        <div className="pt-1">
          <a
            href={`https://hashscan.io/testnet/account/${user.hederaAccountId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink size={11} /> View on HashScan
          </a>
        </div>
      </div>

      <ConfirmTransactionModal
        open={googleDepositConfirmOpen}
        title="Confirm Deposit"
        description="Platform will sign this transfer using your stored Hedera key."
        amountHbar={parseFloat(depositAmount) || 0}
        fromAccount={user.hederaAccountId}
        toLabel="Platform"
        loading={googleDepositLoading}
        onConfirm={handleGoogleDepositConfirmed}
        onCancel={() => setGoogleDepositConfirmOpen(false)}
      />
    </div>
  );
}
