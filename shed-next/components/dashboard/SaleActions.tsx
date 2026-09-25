'use client';

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { emailReceiptAction, markPaidAction, updateInvoiceAction, type ActionResult } from '@/lib/actions/seller';
import { Icon, WhatsAppIcon } from '../Icon';
import { Drawer } from './Drawer';
import { SubmitButton } from '../forms';

type Line = { itemName: string; unitCost: number; quantity: number };
interface SaleInfo {
  id: string;
  paid: boolean;
  email: string;
  phone: string;
  editable: boolean;
  customerName: string;
  items: Line[];
  paymentMethod: string;
  bankDetails: { bankName: string; bankAccountName: string; accountNumber: string } | null;
  additionalComments: string;
}

export function SaleActions({ sale, shareUrl, businessName, canManage, total }: { sale: SaleInfo; shareUrl: string; businessName: string; canManage: boolean; total: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [emailState, emailAction] = useFormState<ActionResult, FormData>(emailReceiptAction, {});
  const phone = sale.phone.replace(/\D/g, '').replace(/^0/, '234');
  const waText = `Hello ${sale.customerName || ''}, here is your ${sale.paid ? 'receipt' : 'invoice'} from ${businessName} (${total}): ${shareUrl}`;

  return (
    <section className="card space-y-3 p-5">
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{msg.error || msg.ok}</p>}
      {!sale.paid && canManage && (
        <button
          disabled={pending}
          onClick={() => start(async () => { const r = await markPaidAction(sale.id); setMsg(r); router.refresh(); })}
          className="btn btn-brand w-full"
        >
          <Icon name="check" size={16} strokeWidth={2.25} /> Mark as paid
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href={`/dashboard/sales/${sale.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-outline"><Icon name="receipt" size={16} /> View PDF</a>
        <a href={`/dashboard/sales/${sale.id}/pdf?download=1`} className="btn btn-outline">Download</a>
      </div>
      <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer" className="btn w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]">
        <WhatsAppIcon size={16} /> Send on WhatsApp
      </a>
      <form action={emailAction} className="space-y-2">
        <input type="hidden" name="id" value={sale.id} />
        <div className="flex gap-2">
          <input name="email" type="email" required defaultValue={sale.email} placeholder="Email address" aria-label="Email address" className="input py-2 text-sm" />
          <SubmitButton fullWidth={false} className="min-h-[44px] shrink-0 px-4 text-sm" pendingText="…">Email</SubmitButton>
        </div>
        {emailState.ok && <p className="text-xs text-success">{emailState.ok}</p>}
        {emailState.error && <p className="text-xs text-danger">{emailState.error}</p>}
      </form>
      {sale.editable && canManage && (
        <button onClick={() => setEditOpen(true)} className="btn btn-ghost w-full"><Icon name="pen" size={16} /> Edit invoice details</button>
      )}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit invoice">
        <EditInvoice sale={sale} onDone={(r) => { setMsg(r); if (r.ok) { setEditOpen(false); router.refresh(); } }} />
      </Drawer>
    </section>
  );
}

function EditInvoice({ sale, onDone }: { sale: SaleInfo; onDone: (r: ActionResult) => void }) {
  const [lines, setLines] = useState<Line[]>(sale.items.length ? sale.items : [{ itemName: '', unitCost: 0, quantity: 1 }]);
  const [f, setF] = useState({ customerName: sale.customerName, phoneNumber: sale.phone, email: sale.email, paymentMethod: sale.paymentMethod, additionalComments: sale.additionalComments, ...(sale.bankDetails || { bankName: '', bankAccountName: '', accountNumber: '' }) });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = () =>
    start(async () => {
      const r = await updateInvoiceAction(sale.id, {
        customerName: f.customerName,
        phoneNumber: f.phoneNumber,
        email: f.email,
        paymentMethod: f.paymentMethod,
        additionalComments: f.additionalComments,
        bankDetails: { bankName: f.bankName, bankAccountName: f.bankAccountName, accountNumber: f.accountNumber },
        lines,
      });
      if (r.error) setError(r.error);
      else onDone(r);
    });
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-dark">Editing marks this as a revised invoice. Stock levels are not changed.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <label className="block text-sm font-medium">Customer name<input className="input mt-1.5" value={f.customerName} onChange={set('customerName')} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Phone<input className="input mt-1.5" value={f.phoneNumber} onChange={set('phoneNumber')} /></label>
        <label className="block text-sm font-medium">Email<input className="input mt-1.5" type="email" value={f.email} onChange={set('email')} /></label>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Items</p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_60px_auto] gap-2">
              <input aria-label="Item" className="input py-2 text-sm" value={l.itemName} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemName: e.target.value } : x)))} />
              <input aria-label="Price" className="input py-2 text-sm" type="number" min={0} value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: Number(e.target.value) } : x)))} />
              <input aria-label="Qty" className="input py-2 text-sm" type="number" min={1} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
              <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="px-2 text-subtle hover:text-danger disabled:opacity-30"><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines([...lines, { itemName: '', unitCost: 0, quantity: 1 }])} className="mt-2 text-sm font-semibold hover:underline">+ Add line</button>
      </div>
      <label className="block text-sm font-medium">Payment method
        <select className="input mt-1.5" value={f.paymentMethod} onChange={set('paymentMethod')}>
          {['Cash', 'Bank Transfer', 'POS', 'Mobile Payment'].map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      {f.paymentMethod === 'Bank Transfer' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input text-sm" placeholder="Bank" value={f.bankName} onChange={set('bankName')} />
          <input className="input text-sm" placeholder="Account name" value={f.bankAccountName} onChange={set('bankAccountName')} />
          <input className="input text-sm" placeholder="Account number" value={f.accountNumber} onChange={set('accountNumber')} />
        </div>
      )}
      <label className="block text-sm font-medium">Notes<textarea className="input mt-1.5 min-h-[80px]" value={f.additionalComments} onChange={set('additionalComments')} /></label>
      <button onClick={submit} disabled={pending} className="btn btn-dark btn-lg w-full">{pending ? 'Saving…' : 'Save invoice'}</button>
    </div>
  );
}
