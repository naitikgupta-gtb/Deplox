/**
 * AES-256-GCM encryption for env vars at rest.
 *
 * Layout of `encryptedValue` (base64):
 *   [12 bytes iv][16 bytes auth tag][N bytes ciphertext]
 *
 * Key comes from DEPLOX_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8 — env vars encrypted at rest,
 * decrypted only at the moment of injection into the runtime container.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadConfig } from '@deplox/shared-config';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const cfg = loadConfig();
  return Buffer.from(cfg.DEPLOX_ENCRYPTION_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(ciphertextB64: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('ciphertext too short');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Encrypts an optional GitHub OAuth access token (may be null for public repos). */
export function encryptOptionalToken(token: string | null): string | null {
  return token ? encrypt(token) : null;
}

export function decryptOptionalToken(ciphertext: string | null): string | null {
  return ciphertext ? decrypt(ciphertext) : null;
}