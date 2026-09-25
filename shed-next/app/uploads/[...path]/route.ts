import fs from 'fs/promises';
import path from 'path';
import { env } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};

/** Serves seller uploads from UPLOADS_DIR (shared with the old Express app). */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const rel = params.path.map((p) => decodeURIComponent(p)).join('/');
  const file = path.resolve(env.uploadsDir, rel);
  if (!file.startsWith(env.uploadsDir + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const data = await fs.readFile(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Never let an uploaded SVG/PDF run script in our origin.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
