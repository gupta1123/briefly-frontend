"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
import { formatAppDateTime } from '@/lib/utils';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { useCategories } from '@/hooks/use-categories';

export default function EditDocumentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, updateDocument, removeDocument, createFolder, documents, folders } = useDocuments();
  const { categories } = useCategories();
  const doc = getDocumentById(params.id);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    title: doc?.title || '',
    filename: doc?.filename || doc?.name || '',
    subject: doc?.subject || '',
    sender: doc?.sender || '',
    receiver: doc?.receiver || '',
    documentDate: (doc as any)?.documentDate || '',
    documentType: (doc as any)?.documentType || (doc as any)?.type || '',
    category: (doc as any)?.category || '',
    keywords: ((doc as any)?.keywords || []).join(', '),
    tags: ((doc as any)?.tags || []).join(', '),
    description: (doc as any)?.description || '',
    folderPath: ((doc as any)?.folderPath || []).join('/'),
  });
  const [linkedIds, setLinkedIds] = React.useState<string[]>((doc as any)?.linkedDocumentIds || []);
  const [linkQuery, setLinkQuery] = React.useState('');

  const onSave = async () => {
    setSaving(true);
    // ensure new folders exist
    const newPathArr = form.folderPath.split('/').filter(Boolean);
    for (let i = 0; i < newPathArr.length; i++) {
      const slice = newPathArr.slice(0, i + 1);
      const parent = slice.slice(0, -1);
      const name = slice[slice.length - 1];
      createFolder(parent, name);
    }

    if (!doc) { setSaving(false); return; }
    updateDocument(doc.id, {
      title: form.title,
      filename: form.filename,
      subject: form.subject,
      sender: form.sender,
      receiver: form.receiver,
      documentDate: form.documentDate,
      documentType: form.documentType || (doc as any).documentType,
      category: form.category,
      keywords: form.keywords.split(',').map((s: string) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s: string) => s.trim()).filter(Boolean),
      description: form.description,
      folderPath: newPathArr,
      linkedDocumentIds: linkedIds,
    });
    setSaving(false);
    router.push(`/documents/${doc.id}`);
  };

  const onDelete = () => {
    if (!doc) return;
    removeDocument(doc.id);
    router.push('/documents');
  };

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <PageHeader title="Edit Document" backHref={`/documents/${doc?.id ?? ''}`} backLabel="Back" sticky />
        <div className="px-4 md:px-6">

        {!doc ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">Document not found.</div>
        ) : (
        <>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Title</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Filename</label>
                <Input value={form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Subject</label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Sender</label>
                <Input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Receiver</label>
                <Input value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Document Date</label>
                <Input value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Document Type</label>
                <Input value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Category</label>
                <UiSelect value={form.category || 'General'} onValueChange={(value) => setForm({ ...form, category: value })}>
                  <UiSelectTrigger className="w-full">
                    <UiSelectValue placeholder="Select category..." />
                  </UiSelectTrigger>
                  <UiSelectContent>
                    {categories.map((category) => (
                      <UiSelectItem key={category} value={category}>
                        {category}
                      </UiSelectItem>
                    ))}
                  </UiSelectContent>
                </UiSelect>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm">Description</label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Keywords (comma separated)</label>
                <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Tags (comma separated)</label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm">Folder</label>
                <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <UiSelect value={form.folderPath || ''} onValueChange={(v) => setForm({ ...form, folderPath: v === '__root__' ? '' : v })}>
                    <UiSelectTrigger className="w-full"><UiSelectValue placeholder="Select folder" /></UiSelectTrigger>
                    <UiSelectContent>
                      <UiSelectItem value="__root__">Root</UiSelectItem>
                      {folders.map((p, idx) => (
                        <UiSelectItem key={idx} value={p.join('/')}>{p.join('/')}</UiSelectItem>
                      ))}
                    </UiSelectContent>
                  </UiSelect>
                  <Input value={form.folderPath} onChange={(e) => setForm({ ...form, folderPath: e.target.value })} placeholder="Custom path e.g., Finance/2025/Q1" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Choose existing or type a new nested path. New folders will be created automatically.</p>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm">Linked Documents</label>
                {/* Selected chips */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {linkedIds.map(id => {
                    const ld = documents.find(x => x.id === id);
                    if (!ld) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                        <span className="truncate max-w-[220px]" title={ld.title || ld.name}>{ld.title || ld.name}</span>
                        <button onClick={() => setLinkedIds(prev => prev.filter(x => x !== id))} aria-label="Remove" className="opacity-60 hover:opacity-100">×</button>
                      </span>
                    );
                  })}
                  {linkedIds.length === 0 && (
                    <span className="text-xs text-muted-foreground">No links yet. Search and add below.</span>
                  )}
                </div>
                {/* Search & results */}
                <div className="mt-3">
                  <Input
                    placeholder="Search by name (type to find, then click Add)"
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
                    {documents
                      .filter(d => d.id !== doc.id)
                      .filter(d => ((d.title || d.name || '') as string).toLowerCase().includes(linkQuery.toLowerCase()))
                      .slice(0, 50)
                      .map(d => {
                        const selected = linkedIds.includes(d.id);
                        return (
                          <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent/40">
                            <div className="min-w-0">
                              <div className="truncate font-medium" title={d.title || d.name}>{d.title || d.name}</div>
                              <div className="text-xs text-muted-foreground">{formatAppDateTime(d.uploadedAt)} · {(d.documentType || d.type)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant={selected ? 'outline' : 'default'} onClick={() => {
                                setLinkedIds(prev => selected ? prev.filter(x => x !== d.id) : Array.from(new Set([...prev, d.id])));
                              }}>{selected ? 'Remove' : 'Add'}</Button>
                            </div>
                          </div>
                        );
                      })}
                    {documents.filter(d => d.id !== doc.id).filter(d => ((d.title || d.name || '') as string).toLowerCase().includes(linkQuery.toLowerCase())).length > 50 && (
                      <div className="p-2 text-xs text-muted-foreground">Showing top 50 results. Refine your search to narrow down.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="destructive" onClick={onDelete}>Delete</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>
      </div>
    </AppLayout>
  );
}


