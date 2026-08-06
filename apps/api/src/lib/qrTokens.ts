/**
 * Phase 13 — Shared Delivery QR Verification helpers.
 *
 * The QR payload stored in each student's app is AES-256-GCM encrypted JSON
 * so it reveals nothing to an observer who doesn't hold the server secret.
 * The server can decrypt and verify it during a restaurant scan.
 *
 * Encryption key is derived from the JWT secret so there's no extra secret
 * to manage, but it's domain-separated so a key leak in one domain can't be
 * replayed in the other.
 */

import crypto from 'node:crypto';
import { JWT_SECRET } from './secret';

// Domain-separated 256-bit AES key.
const AES_KEY = crypto.createHmac('sha256', JWT_SECRET).update('campus-bites-qr-aes-v1').digest(); // 32 bytes

/** How long QR tokens live (24 h — well past any realistic delivery window). */
export const QR_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pair-code splitting
// ---------------------------------------------------------------------------

/**
 * Split index: student A gets the first `floor(len/2)` characters, student B
 * gets the rest. For a 5-char pair code ("AB3DE") that is 2 chars for A and
 * 3 for B, so the two halves reconstruct the full code unambiguously.
 */
export function getPairCodePart(pairCode: string, part: 'A' | 'B'): string {
  const split = Math.floor(pairCode.length / 2);
  return part === 'A' ? pairCode.slice(0, split) : pairCode.slice(split);
}

/** The display string shown to the student — their chars + underscores. */
export function pairCodeDisplay(pairCode: string, part: 'A' | 'B'): string {
  const split = Math.floor(pairCode.length / 2);
  if (part === 'A') {
    return pairCode.slice(0, split) + '_'.repeat(pairCode.length - split);
  }
  return '_'.repeat(split) + pairCode.slice(split);
}

// ---------------------------------------------------------------------------
// Encryption / decryption
// ---------------------------------------------------------------------------

interface QrTokenData {
  matchId: string;
  orderId: string;
  studentId: string;
  restaurantId: string;
  part: 'A' | 'B';
  verificationPart: string;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Encrypt `data` into an opaque base64url string suitable for embedding in a
 * QR code. Uses AES-256-GCM with a random 12-byte IV; the auth tag is
 * appended so the ciphertext is self-authenticating.
 */
export function encryptQrPayload(data: QrTokenData): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const plaintext = JSON.stringify(data);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: 12 bytes IV | 16 bytes GCM tag | ciphertext
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/**
 * Decrypt a QR payload string. Returns the parsed data on success, or null if
 * the payload is invalid / tampered / using the wrong key.
 */
export function decryptQrPayload(encoded: string): QrTokenData | null {
  try {
    const buf = Buffer.from(encoded, 'base64url');
    if (buf.length < 29) return null; // 12 IV + 16 tag + at least 1 byte
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
    return JSON.parse(plaintext) as QrTokenData;
  } catch {
    return null;
  }
}

/** SHA-256 of the encrypted payload — used as the DB lookup key. */
export function hashPayload(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Token builder (used by the GET /shared-delivery/match endpoint)
// ---------------------------------------------------------------------------

export interface BuiltQrToken {
  tokenId: string;
  payload: string;   // encrypted — returned to the student and stored in DB
  payloadHash: string;
  expiresAt: string;
}

export function buildQrToken(data: Omit<QrTokenData, 'issuedAt' | 'expiresAt'>): BuiltQrToken {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MS).toISOString();
  const full: QrTokenData = { ...data, issuedAt, expiresAt };
  const payload = encryptQrPayload(full);
  const payloadHash = hashPayload(payload);
  return { tokenId: data.tokenId, payload, payloadHash, expiresAt };
}
