import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Cryptographically secure numeric code with a fixed number of digits. */
export function generateNumericCode(digits = 6): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
