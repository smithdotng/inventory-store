'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { addProductAction, adjustStockAction, deleteProductAction, updateProductAction, type ActionResult } from '@/lib/actions/seller';
import { cn, formatCurrency, realImage } from '@/lib/format';
import { Icon } from '../Icon';
import { Img } from '../Img';
import { Drawer } from './Drawer';
import { Field, Input, SubmitButton, Textarea } from '../forms';

type Item = { _id: string; name: string; cost: number; stock: number; commission?: number; description?: string; images?: string[]; isVatable?: boolean };

export function InventoryManager({ items, currency, vatEnabled, openNew, storeUrl }: { items: Item[]; currency: string; vatEnabled: boolean; openNew: boolean; storeUrl: string }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(openNew);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m?: string) => {
    if (!m) return;
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setAdding(true)} className="btn btn-dark"><Icon name="plus" size={16} strokeWidth={2.25} /> Add product</button>
      </div>

      {items.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Icon name="box" size={32} className="mx-auto text-subtle" />
          <p className="mt-3 font-semibold">No products here</p>
          <p className="mt-1 text-sm text-subtle">Add your first product — it appears in your point of sale and online store instantly.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <Row key={it._id} item={it} currency={currency} onEdit={() => setEditing(it)} onDone={flash} storeUrl={storeUrl} />
            ))}
          </ul>
        </div>
      )}

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add product">
        <ProductForm mode="add" vatEnabled={vatEnabled} currency={currency} onSaved={(m) => { setAdding(false); flash(m); }} />
      </Drawer>
      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit product">
        {editing && <ProductForm key={editing._id} mode="edit" item={editing} vatEnabled={vatEnabled} currency={currency} onSaved={(m) => { setEditing(null); flash(m); }} />}
      </Drawer>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lift animate-toast-in">
          {toast}
        </div>
      )}
    </>
  );
}

function Row({ item, currency, onEdit, onDone, storeUrl }: { item: Item; currency: string; onEdit: () => void; onDone: (m?: string) => void; storeUrl: string }) {
  const [stock, setStock] = useState(item.stock);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => setStock(item.stock), [item.stock]);
  const dirty = stock !== item.stock;
  const save = () =>
    start(async () => {
      const r = await adjustStockAction(item._id, stock);
      if (r.error) onDone(r.error);
      else onDone('Stock updated.');
      router.refresh();
    });

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line"><Img src={realImage(item.images?.[0])} alt={item.name} /></span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold hover:underline">{item.name}</span>
        <span className="block text-sm text-subtle">
          {formatCurrency(item.cost, currency)}
          {item.commission ? ` · ${item.commission}% commission` : ''}
          {item.isVatable ? ' · VAT' : ''}
        </span>
      </button>
      <div className="flex items-center gap-2">
        <span className={cn('hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline', item.stock <= 0 ? 'bg-danger-soft text-danger' : item.stock <= 5 ? 'bg-brand-soft text-brand-dark' : 'bg-success-soft text-success')}>
          {item.stock <= 0 ? 'Out' : item.stock <= 5 ? 'Low' : 'In stock'}
        </span>
        <div className="flex h-10 items-center rounded-lg border border-line">
          <button type="button" aria-label="Decrease stock" onClick={() => setStock(Math.max(0, stock - 1))} className="flex h-full w-9 items-center justify-center"><Icon name="minus" size={14} /></button>
          <input aria-label={`Stock for ${item.name}`} inputMode="numeric" value={stock} onChange={(e) => setStock(Math.max(0, parseInt(e.target.value || '0', 10) || 0))} className="h-full w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none" />
          <button type="button" aria-label="Increase stock" onClick={() => setStock(stock + 1)} className="flex h-full w-9 items-center justify-center"><Icon name="plus" size={14} /></button>
        </div>
        {dirty ? (
          <button onClick={save} disabled={pending} className="btn btn-brand h-10 min-h-0 px-3 text-sm">{pending ? '…' : 'Save'}</button>
        ) : (
          <details className="relative">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-canvas" aria-label="More actions">
              <span className="text-lg leading-none">⋯</span>
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
              <button onClick={onEdit} className="block w-full px-4 py-2 text-left text-sm hover:bg-canvas">Edit details</button>
              <a href={`${storeUrl}/products/${item._id}`} target="_blank" rel="noreferrer" className="block px-4 py-2 text-sm hover:bg-canvas">View in store</a>
              <button
                onClick={() => {
                  if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
                  start(async () => {
                    const r = await deleteProductAction(item._id);
                    onDone(r.error || r.ok);
                    router.refresh();
                  });
                }}
                className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-canvas"
              >
                Delete
              </button>
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

function ProductForm({ mode, item, vatEnabled, currency, onSaved }: { mode: 'add' | 'edit'; item?: Item; vatEnabled: boolean; currency: string; onSaved: (msg?: string) => void }) {
  const [state, action] = useFormState<ActionResult, FormData>(mode === 'add' ? addProductAction : updateProductAction, {});
  const [previews, setPreviews] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      onSaved(state.ok);
      router.refresh();
    }
  }, [state.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const existing = (item?.images || []).filter((i) => !removed.includes(i));

  return (
    <form action={action} className="space-y-4">
      {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {item && <input type="hidden" name="id" value={item._id} />}
      {removed.map((r) => <input key={r} type="hidden" name="removeImages" value={r} />)}
      <Field label="Product name"><Input name="name" required maxLength={120} defaultValue={item?.name} autoFocus={mode === 'add'} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Price (${currency})`}><Input name="cost" type="number" min={0} step="0.01" required defaultValue={item?.cost} inputMode="decimal" /></Field>
        <Field label="Quantity in stock"><Input name="stock" type="number" min={0} step={1} required defaultValue={item?.stock ?? 1} inputMode="numeric" /></Field>
      </div>
      <Field label="Outlet commission (%)" hint="Optional — paid to outlets that sell this item">
        <Input name="commission" type="number" min={0} max={100} step="0.1" defaultValue={item?.commission ?? ''} />
      </Field>
      <Field label="Description" hint="Shown on your online store (max 400 characters)">
        <Textarea name="description" maxLength={400} defaultValue={item?.description} />
      </Field>
      {vatEnabled && (
        <label className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
          <input type="hidden" name="vatField" value="1" />
          <input type="checkbox" name="isVatable" defaultChecked={item ? !!item.isVatable : true} className="h-4 w-4 accent-ink" /> Charge VAT on this product
        </label>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">Photos <span className="font-normal text-subtle">(up to 4)</span></p>
        <div className="grid grid-cols-4 gap-2">
          {existing.map((src) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-lg border border-line">
              <Img src={src} alt="" />
              <button type="button" onClick={() => setRemoved([...removed, src])} aria-label="Remove photo" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-white"><Icon name="close" size={12} /></button>
            </div>
          ))}
          {previews.map((src) => (
            <div key={src} className="aspect-square overflow-hidden rounded-lg border border-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
          {existing.length + previews.length < 4 && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-xs text-subtle hover:border-ink">
              <Icon name="plus" size={18} /> Add
              <input
                type="file"
                name="images"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="sr-only"
                onChange={(e) => setPreviews(Array.from(e.target.files || []).slice(0, 4 - existing.length).map((f) => URL.createObjectURL(f)))}
              />
            </label>
          )}
        </div>
      </div>
      <SubmitButton pendingText="Saving…">{mode === 'add' ? 'Add product' : 'Save changes'}</SubmitButton>
    </form>
  );
}
