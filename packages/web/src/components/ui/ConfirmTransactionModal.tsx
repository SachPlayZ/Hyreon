'use client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card';
import { Button } from './button';
import { Loader2, ShieldAlert, ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  amountHbar: number;
  fromAccount: string;
  toLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown to Google-auth users before the platform uses their stored key
 * to sign a transfer from their Hedera account.
 */
export function ConfirmTransactionModal({
  open,
  title = 'Confirm Transfer',
  description,
  amountHbar,
  fromAccount,
  toLabel = 'Platform',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm mx-4 shadow-2xl border-amber-500/30 animate-fade-in">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <ShieldAlert size={18} className="text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && (
                <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/40 border border-border/50 rounded-xl p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold font-mono">{amountHbar} ℏ</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">From</span>
              <span className="font-mono text-xs truncate max-w-[160px]">{fromAccount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">To</span>
              <span className="font-mono text-xs">{toLabel}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Because you signed in with Google, the platform holds your Hedera private key securely. This transfer will be signed on your behalf.
          </p>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2 bg-amber-600 hover:bg-amber-500 text-white"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              {loading ? 'Processing…' : 'Approve'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
