import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// JWT secret — use env var in production, random per-process fallback for dev
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = '7d';

export interface AuthPayload {
  userId: string;
  authProvider: 'GOOGLE' | 'METAMASK';
}

/** Sign a JWT for a freshly-authenticated user */
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/** Express middleware: verifies Bearer token and attaches `req.auth` */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Express middleware: ensures the authenticated user matches the :id param.
 * Must be used AFTER requireAuth.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as any).auth as AuthPayload | undefined;
  if (!auth) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (auth.userId !== req.params.id) {
    res.status(403).json({ error: 'Forbidden — you can only access your own resources' });
    return;
  }
  next();
}

// ── EVM signature replay prevention ──
// In-memory set of used signatures (cleared on restart — acceptable for 5-min window)
const usedSignatures = new Map<string, number>(); // signature -> expiry timestamp

/** Record a signature as used. Returns false if already used (replay). */
export function markSignatureUsed(signature: string, ttlMs: number = 5 * 60 * 1000): boolean {
  // Clean expired entries periodically
  const now = Date.now();
  if (usedSignatures.size > 10000) {
    for (const [sig, expiry] of usedSignatures) {
      if (expiry < now) usedSignatures.delete(sig);
    }
  }

  if (usedSignatures.has(signature) && usedSignatures.get(signature)! > now) {
    return false; // replay
  }

  usedSignatures.set(signature, now + ttlMs);
  return true;
}
