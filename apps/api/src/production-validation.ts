/**
 * Production environment validation — fail-fast with an explicit error if
 * required environment variables are missing. This protects against accidentally
 * starting with no JWT_SECRET (or an empty secret) in production.
 */
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k] || process.env[k]?.trim() === '');
  if (missing.length > 0) {
    console.error(`[api] missing required environment variables in production: ${missing.join(', ')}`);
    // Exit with non-zero to let host know start failed
    process.exit(1);
  }
}
