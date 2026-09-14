'use client';

import { useState } from 'react';
import { useApi, apiForm, apiJson } from '@/lib/client-api';
import { formatCurrency } from '@/lib/format';
import { PageHeader, Panel, EmptyState } from '@/components/dashboard/ui';

interface Product {
  _id: string;
  name: string;
  cost: number;
  stock: number;
  commission?: number;
  description?: string;
  images?: string[];
}
interface ProductsResp {
  currency: string;
  products: Product[];
}

export default function ProductsPage() {
  const { data, loading, error, reload } = useApi<ProductsResp>('/api/admin/products');
  const [showAdd, setShowAdd] = useState(false);
  const currency = data?.currency || '₦';

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Manage your inventory, stock levels and pricing."
        action={
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close' : '+ Add product'}
          </button>
        }
      />

      {showAdd && (
        <div className="mb-6">
          <AddProductForm
            onAdded={() => {
              setShowAdd(false);
              reload();
            }}
          />
        </div>
      )}

      <Panel>
        {loading ? (
          <EmptyState>Loading products…</EmptyState>
        ) : error ? (
          <EmptyState>{error}</EmptyState>
        ) : !data || data.products.length === 0 ? (
          <EmptyState>No products yet. Add your first product to get started.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-5 py-3 font-semibold">Stock</th>
                  <th className="px-5 py-3 font-semibold">Cost</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.products.map((p) => (
                  <ProductRow key={p._id} product={p} currency={currency} onChange={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function ProductRow({
  product,
  currency,
  onChange,
}: {
  product: Product;
  currency: string;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [stock, setStock] = useState(String(product.stock));
  const [cost, setCost] = useState(String(product.cost));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiJson(`/api/admin/products/${product._id}`, 'PATCH', {
        stock: Number(stock),
        cost: Number(cost),
      });
      setEditing(false);
      onChange();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${product.name}"?`)) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/products/${product._id}`, 'DELETE');
      onChange();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <tr>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          {product.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0]} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">📦</span>
          )}
          <span className="font-medium">{product.name}</span>
        </div>
      </td>
      <td className="px-5 py-3">
        {editing ? (
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-20 rounded-lg border border-line px-2 py-1"
          />
        ) : (
          <span className={product.stock <= 5 ? 'font-semibold text-amber-600' : ''}>{product.stock}</span>
        )}
      </td>
      <td className="px-5 py-3">
        {editing ? (
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-28 rounded-lg border border-line px-2 py-1"
          />
        ) : (
          formatCurrency(product.cost, currency)
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <button disabled={busy} onClick={save} className="text-sm font-semibold text-primary-hover">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-sm text-subtle">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-sm font-semibold hover:text-primary-hover">
                Edit
              </button>
              <button disabled={busy} onClick={remove} className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function AddProductForm({ onAdded }: { onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiForm('/api/admin/products', new FormData(e.currentTarget));
      onAdded();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel title="Add product">
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field name="name" label="Name" required />
        <Field name="cost" label="Cost" type="number" step="0.01" required />
        <Field name="stock" label="Stock" type="number" required />
        <Field name="commission" label="Commission % (optional)" type="number" step="0.01" />
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">Description</span>
          <textarea
            name="description"
            rows={2}
            className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">Images</span>
          <input name="productImages" type="file" multiple accept="image/*" className="text-sm" />
        </label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button disabled={busy} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
