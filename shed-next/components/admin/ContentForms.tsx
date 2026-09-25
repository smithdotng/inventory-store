'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveAdA, saveClusterA, savePostA } from '@/lib/actions/admin';
import type { ActionResult } from '@/lib/actions/seller';
import { Drawer } from '../dashboard/Drawer';
import { Field, Input, Select, SubmitButton, Textarea } from '../forms';
import { Flash } from '../dashboard/ui';
import { Icon } from '../Icon';

function useCloseOnOk(st: ActionResult, close: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (st.ok) {
      close();
      router.refresh();
    }
  }, [st.at]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ClusterForm({ categories, cluster }: { categories: string[]; cluster?: any }) {
  const [open, setOpen] = useState(false);
  const [st, action] = useFormState<ActionResult, FormData>(saveClusterA, {});
  useCloseOnOk(st, () => setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)} className={cluster ? 'btn btn-outline h-9 min-h-0 px-3 text-sm' : 'btn btn-dark'}>{cluster ? 'Edit' : <><Icon name="plus" size={16} /> New market</>}</button>
      <Drawer open={open} onClose={() => setOpen(false)} title={cluster ? `Edit ${cluster.name}` : 'New market'}>
        <form action={action} className="space-y-4">
          <Flash error={st.error} />
          {cluster && <input type="hidden" name="id" value={cluster._id} />}
          <Field label="Name" hint={cluster ? 'Changing the name changes the market link.' : undefined}><Input name="name" required defaultValue={cluster?.name} /></Field>
          <Field label="City"><Input name="city" defaultValue={cluster?.city} /></Field>
          <Field label="Description"><Textarea name="description" defaultValue={cluster?.description} /></Field>
          <Field label="Image URL"><Input name="image" defaultValue={cluster?.image} /></Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Main categories</legend>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-2"><input type="checkbox" name="focusCategories" value={c} defaultChecked={cluster?.focusCategories?.includes(c)} className="accent-ink" /> {c}</label>
              ))}
            </div>
          </fieldset>
          <SubmitButton pendingText="Saving…">Save market</SubmitButton>
        </form>
      </Drawer>
    </>
  );
}

export function AdForm() {
  const [open, setOpen] = useState(false);
  const [st, action] = useFormState<ActionResult, FormData>(saveAdA, {});
  useCloseOnOk(st, () => setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-dark"><Icon name="plus" size={16} /> New ad</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New featured ad">
        <form action={action} className="space-y-4">
          <Flash error={st.error} />
          <Field label="Product name"><Input name="productName" required /></Field>
          <Field label="Store / business name"><Input name="businessName" /></Field>
          <Field label="Link" hint="e.g. /store/mamaput/products/… or https://…"><Input name="storeUrl" required /></Field>
          <Field label="Image URL"><Input name="imageUrl" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price"><Input name="price" type="number" min={0} /></Field>
            <Field label="Currency"><Input name="currency" defaultValue="₦" /></Field>
          </div>
          <Field label="Description"><Textarea name="description" /></Field>
          <Field label="Placement">
            <Select name="position" defaultValue="both"><option value="both">Everywhere</option><option value="left">Store pages (left)</option><option value="right">Store pages (right)</option></Select>
          </Field>
          <SubmitButton pendingText="Saving…">Create ad</SubmitButton>
        </form>
      </Drawer>
    </>
  );
}

export function PostEditor({ post }: { post?: any }) {
  const [st, action] = useFormState<ActionResult, FormData>(savePostA, {});
  const [preview, setPreview] = useState(false);
  const [html, setHtml] = useState<string>(post?.content || '');
  return (
    <form action={action} className="space-y-4">
      <Flash error={st.error} />
      {post && <input type="hidden" name="id" value={post._id} />}
      <Field label="Title"><Input name="title" required defaultValue={post?.title} /></Field>
      <Field label="Summary" hint="Shown on the blog list"><Input name="excerpt" defaultValue={post?.excerpt} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tags" hint="Comma separated"><Input name="tags" defaultValue={(post?.tags || []).join(', ')} /></Field>
        <Field label="Cover image"><input type="file" name="coverImage" accept="image/*" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-semibold" /></Field>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium">Content (HTML: &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;blockquote&gt;, &lt;img&gt;…)</span>
          <button type="button" onClick={() => setPreview(!preview)} className="text-sm font-semibold hover:underline">{preview ? 'Edit' : 'Preview'}</button>
        </div>
        <textarea name="content" value={html} onChange={(e) => setHtml(e.target.value)} required className={`input min-h-[360px] font-mono text-sm ${preview ? 'hidden' : ''}`} />
        {preview && <div className="prose-shed card min-h-[360px] p-5" dangerouslySetInnerHTML={{ __html: html.replace(/<script[\s\S]*?<\/script>/gi, '') }} />}
      </div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="published" defaultChecked={post ? !!post.published : true} className="h-4 w-4 accent-ink" /> Published</label>
      <SubmitButton fullWidth={false} className="btn-lg px-8" pendingText="Saving…">Save post</SubmitButton>
    </form>
  );
}
