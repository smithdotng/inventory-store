import 'server-only';
import path from 'path';

/**
 * Environment used by the server code. Reuses the same variable names as the
 * old Express app, so the existing .env can be copied over unchanged.
 */
export const env = {
  mongoUri: process.env.MONGO_URI || '',
  dbName: process.env.DB_NAME || undefined,
  sessionSecret: process.env.SESSION_SECRET || 'fallback-secret',
  emailUser: process.env.EMAIL_USER || '',
  emailPass: process.env.EMAIL_PASS || '',
  businessUser: process.env.BUSINESS_USER || process.env.EMAIL_USER || 'stanley@shed.ng',
  /** Public base URL used in emails, e.g. https://shed.ng */
  baseUrl: (process.env.BASE_URL || process.env.DOMAIN_URL || 'http://localhost:3000').replace(/\/$/, ''),
  isProd: process.env.NODE_ENV === 'production',
  /**
   * Where uploaded images live. Defaults to the Express app's public/uploads
   * (one level up) so old and new app share the same files during migration.
   */
  uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR || '../public/uploads'),
  /** Legacy Express public folder — used to read logos for PDFs. */
  legacyPublicDir: path.resolve(process.cwd(), process.env.LEGACY_PUBLIC_DIR || '../public'),
};

export function absoluteUrl(p: string) {
  return `${env.baseUrl}${p.startsWith('/') ? p : `/${p}`}`;
}
