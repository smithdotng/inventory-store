import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { env } from './env';

const ALLOWED = /jpeg|jpg|png|gif|pdf|webp/;
const MAX_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {}

/**
 * Save an uploaded File (from FormData) into the shared uploads folder.
 * Same naming scheme as the old multer config: `${field}-${username}-${Date.now()}${ext}`.
 * Returns the public path, e.g. /uploads/logo-acme-1700000000000.png
 */
export async function saveUpload(file: File | null | undefined, field: string, username = 'unknown'): Promise<string | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  const ext = path.extname(file.name || '').toLowerCase();
  if (!ALLOWED.test(ext.slice(1)) || !ALLOWED.test(file.type)) throw new UploadError('Only image and PDF files are allowed.');
  if (file.size > MAX_BYTES) throw new UploadError('Files must be 5MB or smaller.');
  await fs.mkdir(env.uploadsDir, { recursive: true });
  const safeUser = String(username).replace(/[^\w.-]/g, '') || 'unknown';
  const name = `${field}-${safeUser}-${Date.now()}${Math.random().toString(36).slice(2, 5)}${ext}`;
  await fs.writeFile(path.join(env.uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

export async function saveUploads(files: File[], field: string, username?: string, max = 4) {
  const out: string[] = [];
  for (const f of files.slice(0, max)) {
    const p = await saveUpload(f, field, username);
    if (p) out.push(p);
  }
  return out;
}

/** Resolve a public asset path (/uploads/x.png or /images/x.png) to a file on disk, if it exists. */
export async function resolvePublicFile(publicPath?: string | null): Promise<string | null> {
  if (!publicPath || /^https?:/.test(publicPath)) return null;
  const clean = path.normalize(publicPath).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.startsWith('/uploads/')
    ? [path.join(env.uploadsDir, clean.replace(/^\/uploads\//, ''))]
    : [path.join(process.cwd(), 'public', clean), path.join(env.legacyPublicDir, clean)];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
