'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { initiateDeposit as depositHbar } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, TrendingUp, Wallet, CheckCircle, AlertCircle } from 'lucide-react';

export default function DepositPage() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await depositHbar(user.id, amt);
      setUser({
        ...user,
        hbarBalance: data.user.hbarBalance,
        hbarDeposited: data.user.hbarDeposited,
        hbarSpent: data.user.hbarSpent,
      });
      setSuccess(`Deposited ${amt} ℏ — new balance: ${data.user.hbarBalance.toFixed(2)} ℏ`);
      setAmount('');
    } catch (err: any) {
      setError(err.message ?? 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in space-y-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/chat')}
          className="gap-1.5 text-muted-foreground -ml-2"
        >
          <ArrowLeft size={14} /> Back to Chat
        </Button>

        {/* Balance card */}
        <Card className="border-primary/20 bg-primary/5 shadow-lg">
          <CardContent className="pt-6 pb-5 text-center">
            <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Wallet size={22} className="text-primary" />
            </div>
            <p className="text-muted-foreground text-sm mb-1">Current Balance</p>
            <p className="text-4xl font-bold tracking-tight">
              {user.hbarBalance.toFixed(2)}{' '}
              <span className="text-2xl text-muted-foreground font-normal">ℏ</span>
            </p>
            <Separator className="my-4" />
            <div className="flex justify-center gap-8 text-xs text-muted-foreground">
              <div className="text-center">
                <p className="text-foreground font-medium">{user.hbarDeposited.toFixed(2)} ℏ</p>
                <p>Total Deposited</p>
              </div>
              <div className="text-center">
                <p className="text-foreground font-medium">{user.hbarSpent.toFixed(2)} ℏ</p>
                <p>Total Spent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deposit form */}
        <Card className="border-border/60 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              Add HBAR
            </CardTitle>
            <CardDescription className="text-xs">
              Funds are tracked on the platform and used to pay agents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (HBAR)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10.00"
                  min="0.01"
                  step="0.01"
                  className="font-mono"
                />
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(String(preset))}
                    className="text-xs font-mono"
                  >
                    {preset} ℏ
                  </Button>
                ))}
              </div>

              {error && (
                <Alert variant="destructive" className="py-3">
                  <AlertCircle size={14} />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="py-3 border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <AlertDescription className="text-xs text-emerald-400">{success}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loading} className="w-full glow-purple">
                {loading ? 'Processing...' : 'Deposit HBAR'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
