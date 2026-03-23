'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { loginGoogle, loginEvm } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, Wallet, Chrome, User } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, setUser } = useUser();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [metaMaskLoading, setMetaMaskLoading] = useState(false);
  const [error, setError] = useState('');

  // Username modal state — shown when MetaMask user is new
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    address: string;
    signature: string;
    timestamp: number;
  } | null>(null);
  const [username, setUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  useEffect(() => {
    if (user) router.push('/chat');
  }, [user, router]);

  // ── Google OAuth (auth code flow — code is exchanged server-side with client secret) ──
  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setGoogleLoading(true);
      setError('');
      try {
        const data = await loginGoogle(codeResponse.code);
        setUser(data.user, data.token);
        router.push('/chat');
      } catch (err: any) {
        setError(err.message ?? 'Google login failed');
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed');
      setGoogleLoading(false);
    },
    flow: 'auth-code',
  });

  // ── MetaMask ──────────────────────────────────────────────────────
  const handleMetaMask = async () => {
    setError('');
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install it from metamask.io');
      return;
    }
    setMetaMaskLoading(true);
    try {
      const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      const timestamp = Date.now();
      const message = `Login to Hyreon\n\nAddress: ${address}\nTimestamp: ${timestamp}`;

      const signature: string = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      // Try logging in — if user is new, backend returns { error, newUser: true }
      try {
        const data = await loginEvm({ address, signature, timestamp });
        setUser(data.user, data.token);
        router.push('/chat');
      } catch (err: any) {
        const parsed = tryParseError(err.message);
        if (parsed?.newUser) {
          // New user — store pending login data and ask for username
          setPendingLogin({ address, signature, timestamp });
          setShowUsernameModal(true);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      if (!showUsernameModal) {
        setError(err.message ?? 'MetaMask login failed');
      }
    } finally {
      setMetaMaskLoading(false);
    }
  };

  const handleUsernameSubmit = async () => {
    if (!pendingLogin || !username.trim()) return;
    setUsernameLoading(true);
    setError('');
    try {
      const data = await loginEvm({ ...pendingLogin, name: username.trim() });
      setUser(data.user, data.token);
      router.push('/chat');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
      setShowUsernameModal(false);
    } finally {
      setUsernameLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-3">
          <Image src="/hyreon-logo.png" alt="Hyreon" width={48} height={48} className="mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">Hyreon</h1>
          <p className="text-muted-foreground text-sm">Sign in to access the agent marketplace</p>
        </div>

        <Card className="border-border/60 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Choose how to sign in</CardTitle>
            <CardDescription>
              Your Hedera wallet is created or linked automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Google */}
            <Button
              onClick={() => {
                setGoogleLoading(true);
                googleLogin();
              }}
              disabled={googleLoading || metaMaskLoading}
              className="w-full gap-3 h-12 text-sm font-medium"
              variant="outline"
            >
              {googleLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Chrome size={16} />
              )}
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1 opacity-30" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1 opacity-30" />
            </div>

            {/* MetaMask */}
            <Button
              onClick={handleMetaMask}
              disabled={googleLoading || metaMaskLoading}
              className="w-full gap-3 h-12 text-sm font-medium glow-purple"
            >
              {metaMaskLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wallet size={16} />
              )}
              {metaMaskLoading ? 'Connecting…' : 'Connect MetaMask'}
            </Button>

            {error && (
              <Alert variant="destructive" className="py-3">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="text-center space-y-2 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">Google</span> — we create a Hedera wallet for you. Your keys stay on our servers.</p>
          <p><span className="font-medium text-foreground">MetaMask</span> — your wallet, your keys. Transactions go through MetaMask.</p>
        </div>
      </div>

      {/* Username modal for new MetaMask users */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-sm mx-4 shadow-2xl border-border/80 animate-fade-in">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <User size={18} className="text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Choose a username</CardTitle>
                  <CardDescription className="text-xs">First time here — pick a display name</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alice"
                  onKeyDown={(e) => e.key === 'Enter' && handleUsernameSubmit()}
                  autoFocus
                />
              </div>

              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle size={13} />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setShowUsernameModal(false);
                    setPendingLogin(null);
                    setUsername('');
                  }}
                  disabled={usernameLoading}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleUsernameSubmit}
                  disabled={usernameLoading || !username.trim()}
                >
                  {usernameLoading && <Loader2 size={14} className="animate-spin" />}
                  {usernameLoading ? 'Signing in…' : 'Continue'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function tryParseError(message: string): { newUser?: boolean } | null {
  try {
    return JSON.parse(message);
  } catch {
    // Backend wraps error as text — try to detect newUser signal in the string
    if (message.includes('"newUser":true') || message.includes('newUser')) return { newUser: true };
    return null;
  }
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
