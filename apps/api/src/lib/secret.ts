import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * JWT signing secret resolution.
 *
 * Phase 2 security fix: there is NO hardcoded fallback secret any more.
 * Previously an unset `CAMPUS_BITES_JWT_SECRET` silently fell back to the
 * literal string 'campus-bites-dev-secret-change-in-production', which is
 * published in this repository — meaning anyone could forge an admin token
 * against a default deployment.
 *
 * Behaviour now:
 *   - production: `CAMPUS_BITES_JWT_SECRET` is REQUIRED and must be >= 32
 *     characters. The process refuses to boot otherwise.
 *   - development: if the variable is unset we generate a cryptographically
 *     random secret once and persist it to `.jwt-secret` beside the database
 *     file, so local sessions survive a restart. It is never committed
 *     (see .gitignore) and never shared between machines.
 */

const MIN_SECRET_LENGTH = 32;

/** Secrets that must never be accepted, whatever the environment. */
const BANNED_SECRETS = new Set([
  'campus-bites-dev-secret-change-in-production',
  'change-this-in-production',
  'secret',
  'changeme',
]);

function devSecretPath(): string {
  const dbPath = process.env.CAMPUS_BITES_DB_PATH || path.join(__dirname, '../../campus-bites.sqlite3');
  return path.join(path.dirname(path.resolve(dbPath)), '.jwt-secret');
}

function loadOrCreateDevSecret(): string {
  const file = devSecretPath();
  try {
    const existing = fs.readFileSync(file, 'utf-8').trim();
    if (existing.length >= MIN_SECRET_LENGTH) return existing;
  } catch {
    // no file yet — fall through and create one
  }
  const generated = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, generated, { mode: 0o600 });
  console.warn(
    `[campus-bites-api] CAMPUS_BITES_JWT_SECRET was not set. Generated a random development secret at ${file}. ` +
      'Set CAMPUS_BITES_JWT_SECRET explicitly before deploying.',
  );
  return generated;
}

function resolveSecret(): string {
  const fromEnv = process.env.CAMPUS_BITES_JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (fromEnv) {
    if (BANNED_SECRETS.has(fromEnv)) {
      throw new Error(
        '[campus-bites-api] CAMPUS_BITES_JWT_SECRET is set to a known placeholder value. ' +
          'Generate a real one, e.g. `openssl rand -base64 48`.',
      );
    }
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `[campus-bites-api] CAMPUS_BITES_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters ` +
          `(got ${fromEnv.length}). Generate one with \`openssl rand -base64 48\`.`,
      );
    }
    return fromEnv;
  }

  if (isProduction) {
    throw new Error(
      '[campus-bites-api] CAMPUS_BITES_JWT_SECRET is required in production and was not set. ' +
        'Generate one with `openssl rand -base64 48`.',
    );
  }

  return loadOrCreateDevSecret();
}

export const JWT_SECRET: string = resolveSecret();

/** Stable, non-reversible hash used for refresh-token storage. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
