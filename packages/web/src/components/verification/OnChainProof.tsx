'use client';
import { useState } from 'react';
import { ExternalLink, RefreshCw, CheckCircle, XCircle, Shield, Coins, Hash } from 'lucide-react';
import { verifyTask } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Props {
  taskId: string;
  escrowTxId?: string;
  releaseTxId?: string;
  receiptTopicId?: string;
  receiptSequenceNumber?: number;
  resultHash?: string;
  slaMet?: boolean;
  platformFeeHbar?: number;
}

export function OnChainProof({
  taskId,
  escrowTxId,
  releaseTxId,
  receiptTopicId,
  receiptSequenceNumber,
  resultHash,
  slaMet,
  platformFeeHbar,
}: Props) {
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const data = await verifyTask(taskId);
      setVerification(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash size={15} className="text-primary" />
            On-Chain Proof
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={verify}
            disabled={loading}
            className="gap-1.5 text-xs text-muted-foreground h-7"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Verify
          </Button>
        </div>

        {/* SLA & fee badges */}
        {(slaMet !== undefined || platformFeeHbar !== undefined) && (
          <div className="flex gap-2 flex-wrap pt-1">
            {slaMet !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 text-xs',
                  slaMet
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                <Shield size={10} />
                SLA {slaMet ? 'met' : 'missed'}
              </Badge>
            )}
            {platformFeeHbar !== undefined && (
              <Badge variant="outline" className="gap-1 text-xs border-primary/30 bg-primary/10 text-primary">
                <Coins size={10} />
                Fee: {platformFeeHbar.toFixed(4)} ℏ
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <Separator />

      <CardContent className="pt-4 space-y-2">
        {escrowTxId && (
          <ProofRow label="Escrow TX" txId={escrowTxId} url={`https://hashscan.io/testnet/transaction/${escrowTxId}`} />
        )}
        {releaseTxId && releaseTxId !== 'offline' && (
          <ProofRow label="Payment TX" txId={releaseTxId} url={`https://hashscan.io/testnet/transaction/${releaseTxId}`} />
        )}
        {receiptTopicId && (
          <ProofRow
            label={`Receipt (seq: ${receiptSequenceNumber})`}
            txId={receiptTopicId}
            url={`https://hashscan.io/testnet/topic/${receiptTopicId}`}
          />
        )}
        {resultHash && (
          <div className="flex items-start gap-3 py-1">
            <span className="text-muted-foreground text-xs w-28 flex-shrink-0 pt-0.5">Result Hash</span>
            <span className="text-foreground/80 font-mono text-[10px] break-all leading-relaxed">{resultHash}</span>
          </div>
        )}

        {verification && (
          <>
            <Separator className="my-3" />
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                {verification.hashMatch ? (
                  <CheckCircle size={14} className="text-emerald-400" />
                ) : (
                  <XCircle size={14} className="text-destructive" />
                )}
                <span className={cn(
                  'text-xs font-medium',
                  verification.hashMatch ? 'text-emerald-400' : 'text-destructive'
                )}>
                  {verification.hashMatch
                    ? 'Hash verified — result matches on-chain receipt'
                    : 'Hash mismatch or receipt not yet indexed'}
                </span>
              </div>
              {verification.mirrorData?.receipt && (
                <pre className="text-[10px] text-muted-foreground overflow-auto max-h-40 mt-2">
                  {JSON.stringify(verification.mirrorData.receipt, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProofRow({ label, txId, url }: { label: string; txId: string; url: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="text-muted-foreground text-xs w-28 flex-shrink-0">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/70 flex items-center gap-1 font-mono text-xs transition-colors"
      >
        {txId.slice(0, 22)}… <ExternalLink size={10} />
      </a>
    </div>
  );
}
