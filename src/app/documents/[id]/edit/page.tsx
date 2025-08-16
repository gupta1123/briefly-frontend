"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
                <label className="text-sm font-medium">Document Relationships</label>
                <div className="mt-3 space-y-4">
                  
                  {/* Current Links */}
                  {linkedIds.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Currently Linked ({linkedIds.length})
                      </div>
                      <div className="space-y-2">
                        {linkedIds.map(id => {
                          const d = documents.find(x => x.id === id);
                          if (!d) return null;
                          
                          // Check if this is part of a version group
                          const isVersioned = d.versionGroupId && d.versionGroupId === doc.versionGroupId;
                          const versions = documents.filter(docItem => 
                            (docItem.versionGroupId || (docItem as any).version_group_id) === d.versionGroupId
                          ).sort((a, b) => (a.versionNumber || a.version || 1) - (b.versionNumber || b.version || 1));
                          
                          return (
                            <div key={id} className="flex items-center justify-between rounded-md border p-2 bg-background">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-medium" title={d.title || d.name}>
                                    {d.title || d.name}
                                  </span>
                                  {isVersioned && (
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                      Same Version Group
                                    </span>
                                  )}
                                  {d.versionGroupId && !isVersioned && (
                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                      v{d.versionNumber || d.version || 1}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {formatAppDateTime(d.uploadedAt)} · {(d.documentType || d.type)}
                                  {versions.length > 1 && (
                                    <span className="ml-2">({versions.length} versions)</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" asChild>
                                  <Link href={`/documents/${d.id}`} target="_blank">View</Link>
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => setLinkedIds(prev => prev.filter(x => x !== id))}
                                  className="text-destructive hover:text-destructive"
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Smart Suggestions */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Smart Suggestions
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        // Find documents with similar metadata
                        const suggestions = documents
                          .filter(d => d.id !== doc.id && !linkedIds.includes(d.id))
                          .map(d => {
                            let score = 0;
                            let reasons = [];
                            
                            // Same sender/receiver
                            if (doc.sender && d.sender === doc.sender) {
                              score += 30;
                              reasons.push(`Same sender: ${d.sender}`);
                            }
                            if (doc.receiver && d.receiver === doc.receiver) {
                              score += 30;
                              reasons.push(`Same receiver: ${d.receiver}`);
                            }
                            
                            // Same category
                            if (doc.category && d.category === doc.category) {
                              score += 20;
                              reasons.push(`Same category: ${d.category}`);
                            }
                            
                            // Same document type
                            if (doc.documentType && d.documentType === doc.documentType) {
                              score += 15;
                              reasons.push(`Same type: ${d.documentType}`);
                            }
                            
                            // Version group (different versions of same document)
                            if (d.versionGroupId && d.versionGroupId === doc.versionGroupId) {
                              score += 50;
                              reasons.push(`Same document (v${d.versionNumber || d.version || 1})`);
                            }
                            
                            return { document: d, score, reasons: reasons.slice(0, 2) };
                          })
                          .filter(s => s.score > 15)
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 5);

                        if (suggestions.length === 0) {
                          return (
                            <div className="text-sm text-muted-foreground py-2 text-center border border-dashed rounded-md">
                              No smart suggestions found. Use search below to find documents manually.
                            </div>
                          );
                        }

                        return suggestions.map(({ document: d, score, reasons }) => (
                          <div key={d.id} className="flex items-start justify-between rounded-md border border-dashed p-2 bg-accent/5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-sm" title={d.title || d.name}>
                                  {d.title || d.name}
                                </span>
                                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                  {score}% match
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {reasons.map((reason, idx) => (
                                  <div key={idx}>• {reason}</div>
                                ))}
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setLinkedIds(prev => [...prev, d.id])}
                              className="text-xs h-7"
                            >
                              Link
                            </Button>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Manual Search */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Manual Search
                    </div>
                    <Input
                      placeholder="Search by title, sender, or type..."
                      value={linkQuery}
                      onChange={(e) => setLinkQuery(e.target.value)}
                      className="mb-2"
                    />
                    {linkQuery.trim() && (
                      <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                        {documents
                          .filter(d => d.id !== doc.id && !linkedIds.includes(d.id))
                          .filter(d => {
                            const searchText = linkQuery.toLowerCase();
                            return (
                              (d.title || d.name || '').toLowerCase().includes(searchText) ||
                              (d.sender || '').toLowerCase().includes(searchText) ||
                              (d.receiver || '').toLowerCase().includes(searchText) ||
                              (d.documentType || d.type || '').toLowerCase().includes(searchText)
                            );
                          })
                          .slice(0, 20)
                          .map(d => (
                            <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent/40 border-b last:border-b-0">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium" title={d.title || d.name}>
                                  {d.title || d.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatAppDateTime(d.uploadedAt)} · {(d.documentType || d.type)}
                                  {d.versionGroupId && <span className="ml-1">v{d.versionNumber || d.version || 1}</span>}
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => {
                                  setLinkedIds(prev => [...prev, d.id]);
                                  setLinkQuery(''); // Clear search after adding
                                }}
                                className="text-xs h-7"
                              >
                                Add
                              </Button>
                            </div>
                          ))}
                        {documents.filter(d => d.id !== doc.id && !linkedIds.includes(d.id)).filter(d => {
                          const searchText = linkQuery.toLowerCase();
                          return (
                            (d.title || d.name || '').toLowerCase().includes(searchText) ||
                            (d.sender || '').toLowerCase().includes(searchText) ||
                            (d.receiver || '').toLowerCase().includes(searchText) ||
                            (d.documentType || d.type || '').toLowerCase().includes(searchText)
                          );
                        }).length === 0 && (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No documents found matching "{linkQuery}"
                          </div>
                        )}
                      </div>
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


