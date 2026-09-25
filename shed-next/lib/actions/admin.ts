'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sellerOrError, type SellerContext } from '@/lib/server/auth';
import { saveUpload } from '@/lib/server/uploads';
import * as sa from '@/lib/server/admin/superadmin';
import type { ActionResult } from './seller';

async function run(fn: (ctx: SellerContext) => Promise<ActionResult | void>): Promise<ActionResult> {
  const ctx = await sellerOrError({ allowLocked: true });
  if ('error' in ctx) return { error: ctx.error };
  if (ctx.role !== 'superadmin') return { error: 'Only Shed administrators can do that.' };
  try {
    return { ...((await fn(ctx)) || {}), at: Date.now() };
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    if (typeof e?.status === 'number') return { error: e.message, at: Date.now() };
    console.error(e);
    return { error: 'Something went wrong. Please try again.', at: Date.now() };
  }
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function storeActionA(id: string, action: Parameters<typeof sa.storeAction>[2]) {
  const r = await run(async (ctx) => ({ ok: await sa.storeAction(ctx, id, action) }));
  revalidatePath('/dashboard/admin', 'layout');
  if (action === 'delete' && r.ok) redirect('/dashboard/admin?ok=' + encodeURIComponent(r.ok));
  return r;
}

export async function updateStoreA(_: ActionResult, fd: FormData) {
  return run(async () => {
    const username = await sa.updateStore(s(fd, 'id'), { businessName: s(fd, 'businessName'), username: s(fd, 'username'), email: s(fd, 'email'), phone: s(fd, 'phone'), currency: s(fd, 'currency'), role: s(fd, 'role'), category: s(fd, 'category') });
    revalidatePath('/dashboard/admin', 'layout');
    return { ok: 'Store updated.', id: username };
  });
}

export async function activateLegacyStoresA() {
  return run(async () => ({ ok: `${await sa.activateLegacyStores()} older stores marked active.` }));
}

export async function sendMessageA(_: ActionResult, fd: FormData) {
  return run(async (ctx) => {
    await sa.sendMessage(ctx, { recipientId: s(fd, 'recipientId') || undefined, subject: s(fd, 'subject'), content: s(fd, 'content') });
    revalidatePath('/dashboard/admin/messages');
    return { ok: 'Message sent.' };
  });
}

export async function broadcastA(_: ActionResult, fd: FormData) {
  return run(async (ctx) => {
    const r = await sa.broadcastEmail(ctx, s(fd, 'subject'), String(fd.get('html') ?? ''));
    return { ok: `Sent to ${r.ok} of ${r.total} store owners${r.failed ? ` (${r.failed} failed)` : ''}.` };
  });
}

export async function saveClusterA(_: ActionResult, fd: FormData) {
  return run(async () => {
    await sa.saveCluster({ id: s(fd, 'id') || undefined, name: s(fd, 'name'), description: s(fd, 'description'), image: s(fd, 'image'), city: s(fd, 'city'), focusCategories: fd.getAll('focusCategories').map(String) });
    revalidatePath('/dashboard/admin/clusters');
    return { ok: 'Market saved.' };
  });
}

export async function clusterActionA(id: string, action: 'toggle' | 'delete') {
  return run(async () => {
    await sa.clusterAction(id, action);
    revalidatePath('/dashboard/admin/clusters');
    return { ok: action === 'delete' ? 'Market deleted.' : 'Market updated.' };
  });
}

export async function saveAdA(_: ActionResult, fd: FormData) {
  return run(async () => {
    await sa.saveAd({ productName: s(fd, 'productName'), description: s(fd, 'description'), imageUrl: s(fd, 'imageUrl'), price: s(fd, 'price'), currency: s(fd, 'currency'), storeUrl: s(fd, 'storeUrl'), businessName: s(fd, 'businessName'), position: s(fd, 'position') });
    revalidatePath('/dashboard/admin/ads');
    return { ok: 'Ad created.' };
  });
}

export async function adActionA(id: string, action: 'toggle' | 'delete') {
  return run(async () => {
    await sa.adAction(id, action);
    revalidatePath('/dashboard/admin/ads');
  });
}

export async function savePostA(_: ActionResult, fd: FormData) {
  let id = '';
  const r = await run(async (ctx) => {
    const cover = await saveUpload(fd.get('coverImage') as File | null, 'coverImage', ctx.admin.username);
    id = await sa.savePost(ctx, { id: s(fd, 'id') || undefined, title: s(fd, 'title'), excerpt: s(fd, 'excerpt'), content: String(fd.get('content') ?? ''), tags: s(fd, 'tags'), published: fd.get('published') === 'on', coverImage: cover });
    revalidatePath('/dashboard/admin/blog');
    revalidatePath('/blog');
  });
  if (r.error) return r;
  redirect('/dashboard/admin/blog?ok=' + encodeURIComponent('Post saved.'));
}

export async function postActionA(id: string, action: 'toggle' | 'delete') {
  return run(async () => {
    await sa.postAction(id, action);
    revalidatePath('/dashboard/admin/blog');
    revalidatePath('/blog');
  });
}

export async function supportActionA(kind: 'contact' | 'flag', id: string) {
  return run(async () => {
    await sa.supportAction(kind, id);
    revalidatePath('/dashboard/admin/support');
  });
}
