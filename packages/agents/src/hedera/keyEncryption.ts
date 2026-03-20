import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSecret(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('KEY_ENCRYPTION_SECRET must be set and at least 32 characters');
  }
  // Use first 32 bytes as the key
  return Buffer.from(secret.slice(0, 32), 'utf8');
}

/**
 * Encrypts a Hedera private key (DER hex string) for server-side storage.
 * Returns a base64-encoded string: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function encryptPrivateKey(privateKeyDer: string): string {
  const key = getSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKeyDer, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(12) + authTag(16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a previously encrypted private key.
 */
export function decryptPrivateKey(encryptedB64: string): string {
  const key = getSecret();
  const data = Buffer.from(encryptedB64, 'base64');

  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
