"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import Chatbot from '@/components/chatbot';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import type { StoredDocument } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Grid2X2, List, Grid3X3, Folder as FolderIcon, FileText, Trash2, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { formatAppDateTime, parseFlexibleDate } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

type ViewMode = 'grid' | 'list' | 'cards';

function getThemeIconColor(accentColor: string) {
  const colorMap: Record<string, string> = {
    default: 'text-blue-600 dark:text-blue-400',
    red: 'text-red-600 dark:text-red-400',
    rose: 'text-rose-600 dark:text-rose-400',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    lime: 'text-lime-600 dark:text-lime-400',
    green: 'text-green-600 dark:text-green-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    teal: 'text-teal-600 dark:text-teal-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    sky: 'text-sky-600 dark:text-sky-400',
    blue: 'text-blue-600 dark:text-blue-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    violet: 'text-violet-600 dark:text-violet-400',
    purple: 'text-purple-600 dark:text-purple-400',
    fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
    pink: 'text-pink-600 dark:text-pink-400',
  };
  return colorMap[accentColor] || colorMap.default;
}

function ThemeIcon({ icon: Icon, className = '' }: { icon: any; className?: string }) {
  const { settings } = useSettings();
  const themeColor = getThemeIconColor(settings.accent_color);
  
  return <Icon className={`${themeColor} ${className}`} />;
}

export default function DocumentsPage() {
  const { documents, folders, listFolders, getDocumentsInPath, createFolder, deleteFolder, removeDocument, updateDocument, moveDocumentsToPath } = useDocuments();
  const { hasRoleAtLeast } = useAuth();
  const isLoading = false; // placeholder; replace with real loading if data is remote in future
  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { toast } = useToast();

  const currentFolders = listFolders(path);
  const currentDocs = getDocumentsInPath(path);
  const [query, setQuery] = useState('');
  const [field, setField] = useState<'all' | 'title' | 'subject' | 'sender' | 'receiver' | 'keywords' | 'doctype'>('all');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePathInput, setMovePathInput] = useState('');
  const [dragOverFolderIdx, setDragOverFolderIdx] = useState<number | null>(null);
  const [showCurrentOnly, setShowCurrentOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const bulkTagInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filteredDocs = useMemo(() => {
    // When searching, search ALL documents across folders, not just current folder
    const allDocs = showCurrentOnly ? documents.filter(d => d.isCurrentVersion !== false) : documents;
    const base = query.trim() ? allDocs : (showCurrentOnly ? currentDocs.filter(d => d.isCurrentVersion !== false) : currentDocs);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter(d => {
      const inArr = (arr?: string[]) => (arr || []).some(v => v.toLowerCase().includes(q));
      switch (field) {
        case 'title':
          return (d.title || d.name).toLowerCase().includes(q);
        case 'subject':
          return (d.subject || '').toLowerCase().includes(q);
        case 'sender':
          return (d.sender || '').toLowerCase().includes(q);
        case 'receiver':
          return (d.receiver || '').toLowerCase().includes(q);
        case 'keywords':
          return inArr(d.keywords) || inArr(d.aiKeywords);
        case 'doctype':
          return (d.documentType || d.type).toLowerCase().includes(q);
        case 'all':
        default:
          return [d.title, d.name, d.subject, d.sender, d.receiver, d.description]
            .filter(Boolean)
            .some(v => (v as string).toLowerCase().includes(q))
            || inArr(d.keywords) || inArr(d.aiKeywords) || inArr(d.tags);
      }
    });
  }, [query, field, currentDocs, showCurrentOnly]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [path]);

  const getExt = (d: StoredDocument) => {
    const source = d.filename || d.name;
    const idx = source.lastIndexOf('.');
    if (idx > -1 && idx < source.length - 1) return source.slice(idx + 1).toLowerCase();
    return (d.type || 'doc').toLowerCase();
  };

  const parseDocDate = (d: StoredDocument): Date | null => parseFlexibleDate(d.documentDate) || d.uploadedAt || null;

  const formatNiceDate = (d: StoredDocument) => {
    const dt = parseDocDate(d);
    if (!dt) return '—';
    return formatAppDateTime(dt);
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(filteredDocs.map(d => d.id)));
      setSelectAll(true);
    }
  };

  const bulkDelete = () => {
    selectedIds.forEach(id => removeDocument(id));
    setSelectedIds(new Set());
    setSelectAll(false);
  };

  const bulkAddTag = () => {
    const tag = bulkTag.trim();
    if (!tag) return;
    selectedIds.forEach(id => updateDocument(id, prev => ({
      ...prev,
      tags: Array.from(new Set([...(prev.tags || []), tag]))
    })));
    setBulkTag('');
  };

  const onBulkMove = () => {
    const dest = movePathInput.split('/').filter(Boolean);
    if (dest.length === 0) { toast({ title: 'Enter destination path', variant: 'destructive' }); return; }
    // ensure folders exist
    for (let i = 0; i < dest.length; i++) {
      const slice = dest.slice(0, i + 1);
      createFolder(slice.slice(0, -1), slice[slice.length - 1]);
    }
    moveDocumentsToPath(Array.from(selectedIds), dest);
    setSelectedIds(new Set());
    setMoveOpen(false);
    setMovePathInput('');
    toast({ title: 'Moved', description: 'Documents moved successfully' });
  };

  const getDraggedIds = (id: string) => (selectedIds.has(id) ? Array.from(selectedIds) : [id]);
  const onDocDragStart: React.DragEventHandler<HTMLElement> = (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (!id) return;
    const ids = getDraggedIds(id);
    e.dataTransfer.setData('application/x-doc-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Inline rename handlers
  const startEdit = (d: StoredDocument) => {
    setEditingId(d.id);
    setEditingTitle(d.title || d.name);
  };
  const commitEdit = (id: string) => {
    const title = editingTitle.trim();
    if (title) updateDocument(id, prev => ({ ...prev, title }));
    setEditingId(null);
    setEditingTitle('');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/input|textarea/i)) return;
      if (e.key.toLowerCase() === 'a') {
        router.push(`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`);
      } else if (e.key.toLowerCase() === 'm') {
        setMoveOpen(true);
      } else if (e.key.toLowerCase() === 't') {
        bulkTagInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path]);
  const onFolderDragOver: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onFolderDrop = (folderPathArr: string[], idx: number): React.DragEventHandler<HTMLElement> => (e) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/x-doc-ids');
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      moveDocumentsToPath(ids, folderPathArr);
      setSelectedIds(new Set());
      toast({ title: 'Moved', description: `${ids.length} document(s) moved` });
    } catch {}
    setDragOverFolderIdx(null);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Navigation Header with Back Button */}
        <div className="flex items-center gap-4">
          {path.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPath(path.slice(0, -1))}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div className="text-sm text-muted-foreground">
            <button className="text-primary hover:underline" onClick={() => setPath([])}>Root</button>
            {path.map((seg, i) => (
              <span key={i} className="ml-2">/ <button className="hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{seg}</button></span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasRoleAtLeast('contentManager') && (
          <Button asChild className="gap-2">
            <Link href={`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`}><Plus className="h-4 w-4" /> Upload Document</Link>
          </Button>
          )}
          <div className="relative max-w-md">
            <Input placeholder="Search documents..." value={query} onChange={(e) => setQuery(e.target.value)} />
            {query.trim() && (
              <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-accent text-accent-foreground text-xs rounded-md">
                🔍 Searching all folders ({filteredDocs.length} results)
              </div>
            )}
          </div>
          <Select value={field} onValueChange={(v) => setField(v as any)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Fields" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fields</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="subject">Subject</SelectItem>
              <SelectItem value="sender">Sender</SelectItem>
              <SelectItem value="receiver">Receiver</SelectItem>
              <SelectItem value="keywords">Keywords</SelectItem>
              <SelectItem value="doctype">Doc Type</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 ml-2">
            <Switch checked={showCurrentOnly} onCheckedChange={setShowCurrentOnly} id="current-only" />
            <label htmlFor="current-only" className="text-sm text-muted-foreground">Current only</label>
          </div>
          {selectedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Input ref={bulkTagInputRef} placeholder={`Add tag to ${selectedIds.size} selected`} value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className="w-56" />
              <Button variant="outline" onClick={bulkAddTag}>Add Tag</Button>
              <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Move…</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Move {selectedIds.size} documents</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Destination path</label>
                    <Input value={movePathInput} onChange={(e) => setMovePathInput(e.target.value)} placeholder="e.g., Finance/2025/Q1" />
                    <p className="text-xs text-muted-foreground">New folders will be created automatically.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
                    <Button onClick={onBulkMove}>Move</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="destructive" onClick={bulkDelete}>Delete</Button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant={view === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setView('grid')}><Grid2X2 className="h-4 w-4" /></Button>
            <Button variant={view === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setView('list')}><List className="h-4 w-4" /></Button>
            <Button variant={view === 'cards' ? 'default' : 'outline'} size="icon" onClick={() => setView('cards')}><Grid3X3 className="h-4 w-4" /></Button>
           {hasRoleAtLeast('contentManager') && (
           <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
              <DialogTrigger asChild>
                <Button className="ml-2">New Folder</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a new folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Folder name</label>
                  <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g., Q3 Reports" />
                  <p className="text-xs text-muted-foreground">It will be created under: /{path.join('/')}</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                  <Button onClick={async () => {
                    const name = newFolderName.trim();
                    if (!name) { toast({ title: 'Please enter a folder name', variant: 'destructive' }); return; }
                    if (name.includes('/')) { toast({ title: 'Folder name cannot contain /', variant: 'destructive' }); return; }
                    if (name.length > 100) { toast({ title: 'Folder name too long (max 100 characters)', variant: 'destructive' }); return; }
                    const exists = listFolders(path).some(p => (p[p.length - 1]).toLowerCase() === name.toLowerCase());
                    if (exists) { toast({ title: 'Folder already exists' }); return; }
                    
                    try {
                      console.log('Creating folder with path:', path, 'Type:', typeof path, 'Is Array:', Array.isArray(path));
                      await createFolder(path, name);
                      setPath([...path, name]);
                      setNewFolderName('');
                      setNewFolderOpen(false);
                      toast({ title: 'Folder created' });
                    } catch (error) {
                      console.error('Failed to create folder:', error);
                      toast({ 
                        title: 'Failed to create folder', 
                        description: error instanceof Error ? error.message : 'Unknown error',
                        variant: 'destructive' 
                      });
                    }
                  }}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
           )}
          </div>
        </div>

        {/* Folders section (cards)*/}
        {view !== 'list' && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Folders</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentFolders.map((p, idx) => (
                <Card
                  key={idx}
                  className={`group hover:shadow-sm cursor-pointer ${dragOverFolderIdx === idx ? 'ring-1 ring-primary' : ''}`}
                  onClick={() => setPath(p)}
                  onDragOver={onFolderDragOver}
                  onDragEnter={() => setDragOverFolderIdx(idx)}
                  onDragLeave={() => setDragOverFolderIdx(null)}
                  onDrop={onFolderDrop(p, idx)}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <ThemeIcon icon={FolderIcon} className="h-8 w-8" />
                    <div className="flex-1">
                      <div className="font-medium">{p[p.length - 1]}</div>
                      <div className="text-xs text-muted-foreground">{getDocumentsInPath(p).length} items</div>
                    </div>
                    {hasRoleAtLeast('contentManager') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete folder "${p[p.length - 1]}" and all its contents?`)) {
                            try {
                              await deleteFolder(p);
                              toast({ title: 'Folder deleted successfully' });
                            } catch (error: any) {
                              console.error('Failed to delete folder:', error);
                              toast({ 
                                title: 'Failed to delete folder', 
                                description: error instanceof Error ? error.message : 'Unknown error',
                                variant: 'destructive' 
                              });
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {currentFolders.length === 0 && (
                <div className="text-sm text-muted-foreground">No folders</div>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Documents</h2>
          {view === 'list' ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={toggleAll} aria-label="Select all" /></th>
                    <th className="text-left p-3">Name</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-left p-3">Sender</th>
                    <th className="text-left p-3">Date</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Folders as table rows */}
                  {currentFolders.map((p, idx) => (
                    <tr
                      key={`folder-${p.join('/')}`}
                      className="border-t hover:bg-accent/40 cursor-pointer"
                      onClick={() => setPath(p)}
                      onDragOver={onFolderDragOver}
                      onDrop={onFolderDrop(p, idx)}
                    >
                      <td className="p-3 text-center">
                        <input type="checkbox" disabled aria-label={`Folder ${p[p.length-1]}`} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <ThemeIcon icon={FolderIcon} className="h-4 w-4" />
                          <span className="font-medium">{p[p.length - 1]}</span>
                        </div>
                      </td>
                      <td className="p-3 lowercase">
                        <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">FOLDER</span>
                      </td>
                      <td className="p-3">—</td>
                      <td className="p-3">{getDocumentsInPath(p).length} items</td>
                      <td className="p-3 text-right">
                        <button className="text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setPath(p); }}>Open</button>
                      </td>
                    </tr>
                  ))}
                  {filteredDocs.map(d => (
                    <tr key={d.id} className="border-t" draggable onDragStart={onDocDragStart} data-id={d.id}>
                      <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleOne(d.id)} aria-label={`Select ${d.title || d.name}`} /></td>
                      <td className="p-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            {editingId === d.id ? (
                              <input
                                className="border rounded px-2 py-1 text-sm w-full"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => commitEdit(d.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(d.id); if (e.key === 'Escape') { setEditingId(null); setEditingTitle(''); } }}
                                autoFocus
                              />
                            ) : (
                              <Link href={`/documents/${d.id}`} className="flex items-center gap-2 hover:underline" onDoubleClick={(e) => { e.preventDefault(); startEdit(d); }}><ThemeIcon icon={FileText} className="h-4 w-4" /> {d.title || d.name}</Link>
                            )}
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-96 p-4">
                            <div className="space-y-2">
                              <div className="font-semibold">{d.title || d.name}</div>
                              <p className="text-xs text-muted-foreground line-clamp-5">{d.summary || d.aiPurpose || d.description}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="p-3 lowercase">
                        <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">{getExt(d)}</span>
                      </td>
                      <td className="p-3">{d.sender || '—'}</td>
                      <td className="p-3">{formatNiceDate(d)}</td>
                      <td className="p-3 text-right flex items-center justify-end gap-3">
                        {d.versionNumber && (
                          <span className="rounded-md border px-2 py-0.5 text-[10px]">v{d.versionNumber}{d.isCurrentVersion ? ' · current' : ''}</span>
                        )}
                        {Array.isArray(d.linkedDocumentIds) && d.linkedDocumentIds.length > 0 && (
                          <Link href={`/documents/${d.id}#linked`} className="text-xs rounded-md border px-2 py-0.5" title={`${d.linkedDocumentIds.length} linked`}>
                            {d.linkedDocumentIds.length} linked
                          </Link>
                        )}
                        <Link href={`/documents/${d.id}`} className="text-primary hover:underline">View</Link>
                        <Link href={`/chat?docId=${d.id}`} className="text-primary hover:underline">Ask</Link>
                      </td>
                    </tr>
                  ))}
                  {currentDocs.length === 0 && (
                    <tr><td className="p-3 text-sm text-muted-foreground" colSpan={6}>No documents</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredDocs.map(d => (
                <Popover key={d.id}>
                  <PopoverTrigger asChild>
                    <Card className="hover:shadow-sm" draggable onDragStart={onDocDragStart} data-id={d.id}>
                      <CardContent className="p-5">
                        <Link href={`/documents/${d.id}`} className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <ThemeIcon icon={FileText} className="h-8 w-8" />
                            <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">{(d.documentType || d.type)}</span>
                          </div>
                          {editingId === d.id ? (
                            <input
                              className="border rounded px-2 py-1 text-sm w-full"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => commitEdit(d.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(d.id); if (e.key === 'Escape') { setEditingId(null); setEditingTitle(''); } }}
                              autoFocus
                            />
                          ) : (
                            <div className="font-medium line-clamp-2" onDoubleClick={(e) => { e.preventDefault(); startEdit(d); }}>{d.title || d.name}</div>
                          )}
                        </Link>
                      </CardContent>
                    </Card>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-4">
                    <div className="space-y-2">
                      <div className="font-semibold">{d.title || d.name}</div>
                      {d.aiPurpose && <p className="text-xs text-muted-foreground line-clamp-4">{d.aiPurpose}</p>}
                      <div className="text-[10px] text-muted-foreground flex gap-3"><span>{formatNiceDate(d)}</span><span>{d.fileSizeBytes ? `${(d.fileSizeBytes/1024).toFixed(2)} KB` : ''}</span></div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDocs.map(d => (
                <Card key={d.id} className="hover:shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center"><span className="text-xs font-bold">{(d.documentType || d.type).slice(0,3).toUpperCase()}</span></div>
                      <div className="flex-1">
                        <div className="font-semibold">{d.title || d.name}</div>
                        {d.aiPurpose && (
                          <p className="text-sm text-muted-foreground line-clamp-2">Purpose: {d.aiPurpose}</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-4">
                      <span>From <span className="text-foreground">{d.sender || '—'}</span> → To <span className="text-foreground">{d.receiver || '—'}</span></span>
                       <span className="ml-auto">{formatNiceDate(d)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{d.fileSizeBytes ? `${(d.fileSizeBytes/1024).toFixed(2)} KB` : ''}</span>
                      <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">{(d.documentType || d.type)}</span>
                    </div>
                    <div className="text-right"><Link href={`/documents/${d.id}`} className="text-primary hover:underline">View</Link></div>
                  </CardContent>
                </Card>
              ))}
              {currentDocs.length === 0 && (
                <div className="text-sm text-muted-foreground">No documents</div>
              )}
            </div>
          )}
        </div>
      </div>
      <Chatbot documents={documents} />
    </AppLayout>
  );
}


