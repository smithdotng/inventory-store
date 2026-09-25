'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sellerOrError, type SellerContext } from '@/lib/server/auth';
import { saveUpload, saveUploads, UploadError } from '@/lib/server/uploads';
import * as catalog from '@/lib/server/seller/catalog';
import * as sales from '@/lib/server/seller/sales';
import * as account from '@/lib/server/seller/account';
import { startSubscription } from '@/lib/server/seller/billing';
import * as outlets from '@/lib/server/seller/outlets';

export type ActionResult = { ok?: string; error?: string; id?: string; at?: number };

const MANAGERS = ['admin'];
const STOCK = ['stock_clerk'];
const SELLERS = ['cashier', 'stock_clerk'];

/** Auth + error handling for every seller action. Known (validation) errors are shown to the user. */
async function run(roles: string[] | null, fn: (ctx: SellerContext) => Promise<ActionResult | void>, opts: { allowLocked?: boolean } = {}): Promise<ActionResult> {
  const ctx = await sellerOrError({ roles: roles || undefined, allowLocked: opts.allowLocked });
  if ('error' in ctx) return { error: ctx.error };
  try {
    return { ...((await fn(ctx)) || {}), at: Date.now() };
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    if (typeof e?.status === 'number' || e instanceof UploadError) return { error: e.message, at: Date.now() };
    console.error(e);
    return { error: 'Something went wrong. Please try again.', at: Date.now() };
  }
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string) => (fd.get(k) === null || s(fd, k) === '' ? undefined : Number(s(fd, k)));
const files = (fd: FormData, k: string) => fd.getAll(k).filter((f): f is File => typeof f !== 'string' && f.size > 0);

/* ─────────────── Inventory ─────────────── */

export async function addProductAction(_: ActionResult, fd: FormData) {
  return run(STOCK, async (ctx) => {
    const images = await saveUploads(files(fd, 'images'), 'productImages', ctx.admin.username);
    const id = await catalog.addProduct(ctx, {
      name: s(fd, 'name'),
      description: s(fd, 'description'),
      stock: Number(s(fd, 'stock')),
      cost: Number(s(fd, 'cost')),
      commission: n(fd, 'commission') ?? null,
      isVatable: fd.get('isVatable') === 'on',
      images,
    });
    revalidatePath('/dashboard/inventory');
    return { ok: `${s(fd, 'name')} added.`, id };
  });
}

export async function updateProductAction(_: ActionResult, fd: FormData) {
  return run(STOCK, async (ctx) => {
    const addImages = await saveUploads(files(fd, 'images'), 'productImages', ctx.admin.username);
    await catalog.updateProduct(ctx, s(fd, 'id'), {
      name: fd.has('name') ? s(fd, 'name') : undefined,
      description: fd.has('description') ? s(fd, 'description') : undefined,
      stock: fd.has('stock') ? Number(s(fd, 'stock')) : undefined,
      cost: fd.has('cost') ? Number(s(fd, 'cost')) : undefined,
      commission: fd.has('commission') ? n(fd, 'commission') ?? null : undefined,
      isVatable: fd.has('vatField') ? fd.get('isVatable') === 'on' : undefined,
      removeImages: fd.getAll('removeImages').map(String),
      addImages,
    });
    revalidatePath('/dashboard/inventory');
    return { ok: 'Product updated.' };
  });
}

export async function adjustStockAction(id: string, stock: number) {
  return run(STOCK, async (ctx) => {
    await catalog.updateProduct(ctx, id, { stock: Math.max(0, Math.floor(stock)) });
    revalidatePath('/dashboard/inventory');
  });
}

export async function deleteProductAction(id: string) {
  return run(STOCK, async (ctx) => {
    await catalog.deleteProduct(ctx, id);
    revalidatePath('/dashboard/inventory');
    return { ok: 'Product deleted.' };
  });
}

/* ─────────────── POS & invoices ─────────────── */

export interface PosSaleInput {
  lines: { itemId: string; quantity: number }[];
  customer: { customerId?: string | null; name?: string; phone?: string; email?: string };
  paymentMethod: string;
  paymentStatus?: 'Paid' | 'Pending';
}

export async function posSaleAction(input: PosSaleInput) {
  return run(SELLERS, async (ctx) => {
    const id = await sales.createSale(ctx, { lines: input.lines, customer: input.customer, paymentMethod: input.paymentMethod, paymentStatus: input.paymentStatus === 'Pending' ? 'Pending' : 'Paid', source: 'pos' });
    revalidatePath('/dashboard');
    return { id, ok: 'Sale recorded.' };
  });
}

export interface InvoiceInput {
  lines: { itemId?: string; quantity: number; newProduct?: { name: string; cost: number; stock: number } }[];
  customer: { customerId?: string | null; name?: string; phone?: string; email?: string };
  paymentMethod: string;
  bankDetails?: { bankName: string; bankAccountName: string; accountNumber: string } | null;
  additionalComments?: string;
  paid?: boolean;
}

export async function createInvoiceAction(input: InvoiceInput) {
  return run(MANAGERS, async (ctx) => {
    if (!input.customer?.customerId && !input.customer?.name?.trim()) return { error: 'Choose a customer or enter a new customer name.' };
    const id = await sales.createSale(ctx, { ...input, paymentStatus: input.paid ? 'Paid' : 'Pending', source: 'invoice' });
    revalidatePath('/dashboard/invoices');
    return { id, ok: 'Invoice created.' };
  });
}

export async function updateInvoiceAction(id: string, data: Parameters<typeof sales.updateInvoice>[2]) {
  return run(MANAGERS, async (ctx) => {
    await sales.updateInvoice(ctx, id, data);
    revalidatePath(`/dashboard/sales/${id}`);
    return { ok: 'Invoice updated. It will show as a revised invoice.' };
  });
}

export async function markPaidAction(id: string) {
  return run(MANAGERS, async (ctx) => {
    await sales.markPaid(ctx, id);
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard/invoices');
    revalidatePath(`/dashboard/sales/${id}`);
    return { ok: 'Marked as paid.' };
  });
}

export async function emailReceiptAction(_: ActionResult, fd: FormData) {
  return run(SELLERS, async (ctx) => {
    await sales.emailReceipt(ctx, s(fd, 'id'), s(fd, 'email'));
    return { ok: `Sent to ${s(fd, 'email')}.` };
  });
}

/* ─────────────── Customers ─────────────── */

export async function saveCustomerAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    const data = { name: s(fd, 'name'), phone: s(fd, 'phone'), email: s(fd, 'email') };
    const id = s(fd, 'id');
    if (id) await catalog.updateCustomer(ctx, id, data);
    const newId = id ? id : await catalog.addCustomer(ctx, data);
    revalidatePath('/dashboard/customers');
    return { ok: id ? 'Customer updated.' : 'Customer added.', id: newId };
  });
}

export async function deleteCustomerAction(id: string) {
  const r = await run(MANAGERS, async (ctx) => {
    await catalog.deleteCustomer(ctx, id);
  });
  if (r.error) return r;
  redirect('/dashboard/customers?ok=' + encodeURIComponent('Customer deleted.'));
}

/* ─────────────── Settings, team, messages, billing ─────────────── */

export async function saveSettingsAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    const logo = await saveUpload(fd.get('logo') as File | null, 'logo', ctx.admin.username);
    const bank = (p: string) => ({ bankName: s(fd, `${p}BankName`), bankAccountName: s(fd, `${p}BankAccountName`), accountNumber: s(fd, `${p}AccountNumber`) });
    await account.updateSettings(ctx, {
      firstName: s(fd, 'firstName'),
      lastName: s(fd, 'lastName'),
      businessName: s(fd, 'businessName'),
      description: s(fd, 'description'),
      currency: s(fd, 'currency'),
      country: s(fd, 'country'),
      phone: s(fd, 'phone'),
      email: s(fd, 'email'),
      address: s(fd, 'address'),
      facebook: s(fd, 'facebook'),
      instagram: s(fd, 'instagram'),
      twitter: s(fd, 'twitter'),
      website: s(fd, 'website'),
      publicPhone: fd.get('publicPhone') === 'on',
      publicEmail: fd.get('publicEmail') === 'on',
      publicAddress: fd.get('publicAddress') === 'on',
      applyVat: fd.get('applyVat') === 'on',
      vatRate: s(fd, 'vatRate'),
      paymentInstructions: s(fd, 'paymentInstructions'),
      category: s(fd, 'category'),
      clusterId: s(fd, 'clusterId'),
      primaryAccount: bank('primary'),
      secondaryAccount: bank('secondary'),
      logo,
    });
    revalidatePath('/dashboard', 'layout');
    return { ok: 'Settings saved.' };
  });
}

export async function changePasswordAction(_: ActionResult, fd: FormData) {
  return run(null, async (ctx) => {
    await account.changePassword(ctx, String(fd.get('current') ?? ''), String(fd.get('password') ?? ''), String(fd.get('confirm') ?? ''));
    return { ok: 'Password changed.' };
  }, { allowLocked: true });
}

export async function inviteMemberAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    await account.inviteMember(ctx, { firstName: s(fd, 'firstName'), lastName: s(fd, 'lastName'), email: s(fd, 'email'), role: s(fd, 'role') });
    revalidatePath('/dashboard/team');
    return { ok: `Invitation sent to ${s(fd, 'email')}.` };
  });
}

export async function teamAction(id: string, action: 'activate' | 'deactivate' | 'resend' | 'remove' | 'role', role?: string) {
  return run(MANAGERS, async (ctx) => {
    await account.teamAction(ctx, id, action, role);
    revalidatePath('/dashboard/team');
    return { ok: { activate: 'Access restored.', deactivate: 'Access paused.', resend: 'Invitation re-sent.', remove: 'Removed from team.', role: 'Role updated.' }[action] };
  });
}

export async function messageAction(id: string, action: 'read' | 'unread' | 'trash' | 'restore' | 'delete') {
  return run(MANAGERS, async (ctx) => {
    await account.messageAction(ctx, id, action);
    revalidatePath('/dashboard/messages');
    revalidatePath('/dashboard', 'layout');
  }, { allowLocked: true });
}

export async function subscribeAction() {
  let link = '';
  const r = await run(null, async (ctx) => {
    if (ctx.userType !== 'admin') return { error: 'Only the store owner can manage billing.' };
    link = await startSubscription(ctx.admin);
  }, { allowLocked: true });
  if (r.error || !link) redirect('/dashboard/billing?error=' + encodeURIComponent(r.error || 'Could not start payment. Please try again.'));
  redirect(link);
}

/* ─────────────── Outlets ─────────────── */


export async function createOutletAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    const id = await outlets.createOutlet(ctx, { name: s(fd, 'name'), location: s(fd, 'location'), mobile: s(fd, 'mobile'), username: s(fd, 'username'), password: String(fd.get('password') ?? '') });
    revalidatePath('/dashboard/outlets');
    return { ok: 'Outlet created.', id };
  });
}

export async function updateOutletAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    await outlets.updateOutlet(ctx, s(fd, 'id'), { name: s(fd, 'name'), location: s(fd, 'location'), mobile: s(fd, 'mobile'), password: String(fd.get('password') ?? '') || undefined });
    revalidatePath(`/dashboard/outlets/${s(fd, 'id')}`);
    return { ok: 'Outlet updated.' };
  });
}

export async function dispenseAction(_: ActionResult, fd: FormData) {
  return run(MANAGERS, async (ctx) => {
    const qty = Number(s(fd, 'quantity')) * (fd.get('direction') === 'return' ? -1 : 1);
    await outlets.dispense(ctx, s(fd, 'outletId'), s(fd, 'itemId'), qty);
    revalidatePath(`/dashboard/outlets/${s(fd, 'outletId')}`);
    return { ok: qty > 0 ? 'Stock sent to outlet.' : 'Stock returned to your inventory.' };
  });
}

export async function payCommissionAction(outletId: string) {
  return run(MANAGERS, async (ctx) => {
    const amount = await outlets.payCommission(ctx, outletId);
    revalidatePath(`/dashboard/outlets/${outletId}`);
    revalidatePath('/dashboard/outlets');
    return { ok: `Commission of ${(ctx.admin.currency || '₦') + amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} marked as paid.` };
  });
}

export async function deleteOutletAction(outletId: string) {
  const r = await run(MANAGERS, async (ctx) => {
    await outlets.deleteOutlet(ctx, outletId);
  });
  if (r.error) return r;
  redirect('/dashboard/outlets?ok=' + encodeURIComponent('Outlet deleted. Its unsold stock was returned to your inventory.'));
}
