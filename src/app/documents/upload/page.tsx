"use client";

import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Check, UploadCloud, X, FileText, User, UserCheck, Calendar, Tag, FolderOpen, MessageSquare, Hash, Bookmark, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
 
import type { Document, StoredDocument } from '@/lib/types';
import type { ExtractDocumentMetadataOutput } from '@/ai/flows/extract-document-metadata';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
// Calls will be proxied via backend: sign upload, finalize, analyze
import { apiFetch, getApiContext } from '@/lib/api';
import { useDocuments } from '@/hooks/use-documents';
import { useDepartments } from '@/hooks/use-departments';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { computeContentHash } from '@/lib/utils';
import { useCategories } from '@/hooks/use-categories';

const toDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

type Extracted = {
  ocrText: string;
  metadata: ExtractDocumentMetadataOutput;
};

function UploadContent() {
  const [files, setFiles] = useState<File[]>([]);
  const [queue, setQueue] = useState<{ file: File; progress: number; status: 'idle' | 'uploading' | 'processing' | 'ready' | 'saving' | 'success' | 'error'; note?: string; hash?: string; extracted?: Extracted; form?: typeof form; locked?: boolean; previewUrl?: string; rotation?: number; linkMode?: 'new' | 'version'; baseId?: string; candidates?: { id: string; label: string }[]; senderOptions?: string[]; receiverOptions?: string[]; storageKey?: string }[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [carouselMode, setCarouselMode] = useState<boolean>(true);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { addDocument, documents, linkAsNewVersion, refresh } = useDocuments();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();
  const router = useRouter();
  const { categories } = useCategories();
  
  const saveAllReady = async () => {
    const readyItems = queue.map((item, index) => ({ item, index })).filter(({ item }) => item.status === 'ready' && !item.locked);
    
    if (readyItems.length === 0) {
      toast({ title: 'No items to save', description: 'All ready items are already saved or being processed.' });
      return;
    }

    // Save all ready items in parallel, but skip navigation for all except the last one
    const savePromises = readyItems.map(({ index }, i) => 
      onDone(index, i < readyItems.length - 1) // Skip navigation for all but the last item
    );
    
    try {
      await Promise.all(savePromises);
    } catch (error) {
      console.error('Error saving all items:', error);
    }
  };
  const [form, setForm] = useState({
    title: '',
    filename: '',
    sender: '',
    receiver: '',
    documentDate: '',
    documentType: 'General Document',
    folder: 'No folder (Root)',
    subject: '',
    description: '',
    category: 'General',
    keywords: '',
    tags: '',
  });
  const [docType, setDocType] = useState<Document['type']>('PDF');
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const { folders, createFolder } = useDocuments();
  const [preferredBaseId, setPreferredBaseId] = useState<string | null>(null);
  const { hasRoleAtLeast } = useAuth();
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const p = searchParams?.get('path');
    const v = searchParams?.get('version');
    if (p && p.trim()) {
      const pathArray = p.split('/').filter(Boolean);
      setFolderPath(pathArray);
      console.log('Upload page initialized with folder path:', pathArray);
    } else {
      setFolderPath([]);
      console.log('Upload page initialized in root folder');
    }
    if (v && v.trim()) {
      setPreferredBaseId(v);
    } else {
      setPreferredBaseId(null);
    }
  }, [searchParams]);

  const onSelect = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    
    // Push to queue with initial state; compute hashes to dedupe
    const entries = await Promise.all(arr.map(async (f) => ({
      file: f,
      progress: 0,
      status: 'idle' as const,
      hash: await computeContentHash(f),
      previewUrl: URL.createObjectURL(f),
      rotation: 0,
      linkMode: 'new' as const,
    })));
    
    // Only dedupe within queue; allow matching existing docs (we will suggest linking as version instead)
    const queueHashes = new Set(queue.map(q => q.hash).filter(Boolean));
    const filtered = entries.filter(e => {
      if (!e.hash) return true;
      if (queueHashes.has(e.hash)) {
        console.log('Skipping duplicate in queue:', e.file.name, 'hash:', e.hash);
        return false;
      }
      return true;
    });
    setQueue(prev => [...prev, ...filtered]);
  };

  const onBrowse = () => {
    // Clear the input value to allow selecting the same file again
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const list = e.dataTransfer.files;
    if (list && list.length) onSelect(list);
  };

  const processItem = async (index: number) => {
    const item = queue[index];
    if (!item || item.locked || item.status === 'processing' || item.status === 'uploading' || item.status === 'success' || item.status === 'ready') return;
    // lock row to avoid duplicate processing
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true } : q));
    setActiveIndex(index);
    // infer type
    const ext = item.file.name.split('.').pop()?.toLowerCase();
    let inferred: Document['type'] = 'PDF';
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) inferred = 'Image';
    else if (['doc', 'docx'].includes(ext || '')) inferred = 'Word';
    setDocType(inferred);

    // simulate upload progress while reading
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'uploading', progress: 10 } : q));
    const timer = setInterval(() => setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: Math.min(q.progress + 8, 90) } : q)), 150);
    try {
      let dataUri: string;
      const isImage = ['png','jpg','jpeg'].includes(ext || '');
      if (isImage && (item.rotation || 0) % 360 !== 0) {
        dataUri = await rotateImageFileToDataUri(item.file, item.rotation || 0);
      } else {
        dataUri = await toDataUri(item.file);
      }
      clearInterval(timer);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: 100, status: 'processing' } : q));

      // 1) Sign upload to Supabase Storage
      const orgId = getApiContext().orgId || '';
      const signResp = await apiFetch<{ url: string; storageKey: string }>(`/orgs/${orgId}/uploads/sign`, {
        method: 'POST',
        body: { filename: item.file.name, mimeType: item.file.type || 'application/octet-stream' },
      });
      await uploadToSignedUrl(signResp.url, item.file);

      // 2) Finalize DB row if already created, else we will create on Save
      // We'll only store file location on Save to avoid orphan rows in case user cancels

      // 3) Ask backend AI to analyze from signed Storage URL
      let analyzeResp: { ocrText: string; metadata: any };
      try {
        analyzeResp = await apiFetch<{ ocrText: string; metadata: any }>(`/orgs/${orgId}/uploads/analyze`, {
          method: 'POST',
          body: { storageKey: signResp.storageKey, mimeType: item.file.type || 'application/octet-stream' },
        });
      } catch (e: any) {
        // Gracefully accept server fallback when AI is unavailable (HTTP 503)
        const status = (e && e.status) || 0;
        const fallback = (e && e.data && e.data.fallback) || null;
        if (status === 503 && fallback && (typeof fallback === 'object')) {
          analyzeResp = fallback as { ocrText: string; metadata: any };
          toast({
            title: 'AI is busy — using fallback',
            description: 'Metadata was prefilled from filename. You can edit before saving; background processing will enhance details later.',
          });
        } else {
          throw e;
        }
      }
      const ocrResult = { extractedText: analyzeResp.ocrText } as any;
      const metadataResult = analyzeResp.metadata as any;

      // Use the original summary without padding extra content
      const summary = (metadataResult.summary || '').trim();

      // Prefill form for the active item
      const updatedForm = {
        title: metadataResult.title || item.file.name,
        filename: metadataResult.filename || item.file.name,
        sender: metadataResult.sender || '',
        receiver: metadataResult.receiver || '',
        documentDate: metadataResult.documentDate || '',
        documentType: metadataResult.documentType || 'General Document',
        folder: 'No folder (Root)',
        subject: metadataResult.subject || '',
        description: metadataResult.description || metadataResult.summary || '',
        category: metadataResult.category || 'General',
        keywords: (metadataResult.keywords || []).join(', '),
        tags: (metadataResult.tags || []).join(', '),
      };

      // Store multiple options for UI selection
      const senderOptions = metadataResult.senderOptions || [];
      const receiverOptions = metadataResult.receiverOptions || [];
      console.log('Extracted sender options:', senderOptions, 'receiver options:', receiverOptions);

      // Find version candidates (same hash or similar name)
      const candidates = findVersionCandidates(item.hash, item.file.name, documents, folderPath)
        .map(d => ({ 
          id: d.id, 
          label: `${d.title || d.name || 'Untitled'} (v${d.versionNumber || d.version || 1})` 
        }));
      
      console.log('Found version candidates:', candidates.length, 'for file:', item.file.name, 'in folder:', folderPath);
      
      console.log(`Setting item ${index} status to 'ready'`);
      setQueue(prev => prev.map((q, i) => i === index ? { 
        ...q, 
        status: 'ready', 
        extracted: { ocrText: ocrResult.extractedText, metadata: metadataResult }, 
        form: updatedForm, 
        locked: false, 
        candidates,
        progress: 100,
        senderOptions,
        receiverOptions,
        linkMode: preferredBaseId ? 'version' : (candidates.length > 0 ? 'version' : 'new'), 
        baseId: preferredBaseId || candidates[0]?.id, 
        storageKey: signResp.storageKey 
      } : q));
      toast({ title: 'Processed', description: `${item.file.name} analyzed by AI.` });
    } catch (e) {
      clearInterval(timer);
      console.error('Upload processing error:', e);
      
      // Provide specific error messages based on the type of failure
      let errorMessage = 'Processing failed';
      if (e instanceof Error) {
        if (e.message.includes('Upload failed')) {
          errorMessage = 'File upload failed. Please try again.';
        } else if (e.message.includes('analyze')) {
          errorMessage = 'AI analysis failed. Please try again.';
        } else if (e.message.includes('sign')) {
          errorMessage = 'Upload preparation failed. Please try again.';
        } else {
          errorMessage = e.message;
        }
      }
      
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: errorMessage, locked: false } : q));
      toast({ 
        title: 'Processing failed', 
        description: `${item.file.name}: ${errorMessage}`, 
        variant: 'destructive' 
      });
    }
  };

  async function rotateImageFileToDataUri(file: File, rotationDeg: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const radians = (rotationDeg % 360) * Math.PI / 180;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(toDataUri(file)); return; }
        const w = img.width;
        const h = img.height;
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));
        canvas.width = Math.floor(w * cos + h * sin);
        canvas.height = Math.floor(w * sin + h * cos);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -w / 2, -h / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function findVersionCandidates(hash: string | undefined, filename: string, all: StoredDocument[], currentPath: string[]): StoredDocument[] {
    const byHash = hash ? all.filter(d => d.contentHash === hash) : [];
    if (byHash.length) return byHash;
    // Fallback heuristic: same base name (strip timestamps) and same folder
    const base = filename.toLowerCase().replace(/\s+/g, ' ').replace(/\d{4}-\d{2}-\d{2}.*/,'').trim();
    return all.filter(d => {
      const docPath = (d.folderPath || []).join('/');
      const currentPathStr = currentPath.join('/');
      const docName = (d.filename || d.name || '').toLowerCase();
      return docPath === currentPathStr && docName.includes(base);
    });
  }

  async function uploadToSignedUrl(signedUrl: string, file: File, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed with status: ${response.status} ${response.statusText}`);
        }
        
        return; // Success
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);
        
        if (attempt === retries) {
          throw new Error(`Upload failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Ensure we have a focused item when entering queue view or when items change
  useEffect(() => {
    if (queue.length > 0 && (activeIndex === null || activeIndex >= queue.length)) {
      setActiveIndex(0);
    }
    if (queue.length === 0) setActiveIndex(null);
  }, [queue.length]);

  const readyCount = useMemo(() => queue.filter(q => q.status === 'ready').length, [queue]);
  const hasSuccess = useMemo(() => queue.some(q => q.status === 'success'), [queue]);
  const hasProcessable = useMemo(() => queue.some(q => q.status === 'idle' || q.status === 'error'), [queue]);
  const hasExistingDocs = useMemo(() => documents.length > 0, [documents.length]);

  const onReset = () => {
    setQueue([]);
    setActiveIndex(null);
    setExtracted(null);
    setForm({
      title: '', filename: '', sender: '', receiver: '', documentDate: '', documentType: 'General Document', folder: 'No folder (Root)', subject: '', description: '', category: 'General', keywords: '', tags: '',
    });
    inputRef.current && (inputRef.current.value = '');
  };

  const onDone = async (index: number, skipNavigation = false) => {
    const item = queue[index];
    if (!item || !item.extracted || !item.form || item.status === 'success' || item.locked) return;
    
    // Immediately lock the item to prevent duplicate saves
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true, status: 'saving' } : q));
    
    try {
    // Use the original summary without padding extra content
    const summary = (item.extracted.metadata.summary || '').trim();
    const keywordsArray = form.keywords
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
    const tagsArray = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const newDoc: StoredDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: (form.title || item.extracted.metadata.title || item.file.name),
      type: docType,
      uploadedAt: new Date(),
      version: 1,
      keywords: (keywordsArray.length ? keywordsArray : (item.extracted.metadata.keywords || [])).filter(Boolean),
      summary: summary,
      content: item.extracted.ocrText,
      title: form.title || item.extracted.metadata.title || item.file.name,
      filename: form.filename || item.file.name,
      sender: form.sender || item.extracted.metadata.sender,
      receiver: form.receiver || item.extracted.metadata.receiver,
      documentDate: form.documentDate || item.extracted.metadata.documentDate,
      documentType: form.documentType || item.extracted.metadata.documentType,
      folder: 'root',
      folderPath,
      subject: form.subject || item.extracted.metadata.subject || (item.extracted.metadata.title || ''),
      description: form.description || item.extracted.metadata.description || summary,
      category: form.category || item.extracted.metadata.category,
      tags: (tagsArray.length ? tagsArray : (item.extracted.metadata.tags || [])).filter(Boolean),
      contentHash: item.hash,
    };
    // Attach department selection for backend creation
    (newDoc as any).departmentId = selectedDepartmentId || undefined;
    
    console.log('Creating document with folderPath:', folderPath, 'Type:', typeof folderPath, 'Is Array:', Array.isArray(folderPath));
    console.log('newDoc.folderPath:', newDoc.folderPath, 'Type:', typeof newDoc.folderPath, 'Is Array:', Array.isArray(newDoc.folderPath));
    
    // Ensure nested folders exist - create each level sequentially
    console.log('🔍 Creating folder structure for path:', folderPath);
    try {
      for (let i = 0; i < folderPath.length; i++) {
        const slice = folderPath.slice(0, i + 1);
        const parentPath = slice.slice(0, -1);
        const folderName = slice[slice.length - 1];
        
        console.log(`🔍 Level ${i + 1}: Creating folder "${folderName}" with parent path:`, parentPath);
        
        // Check if folder already exists before creating
        const existing = folders.find(f => JSON.stringify(f) === JSON.stringify(slice));
        if (!existing) {
          console.log(`🔍 Folder "${folderName}" doesn't exist, creating...`);
          const result = await createFolder(parentPath, folderName);
          console.log(`🔍 Folder creation result:`, result);
        } else {
          console.log(`🔍 Folder "${folderName}" already exists, skipping creation`);
        }
      }
      console.log('✅ Folder structure creation completed successfully');
    } catch (error) {
      console.error('❌ Failed to create folder structure:', error);
      toast({ 
        title: 'Folder creation failed', 
        description: `Could not create folder structure: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        variant: 'destructive' 
      });
      // Continue with document creation even if folder creation fails
    }
    // Link choice
    // Basic required fields enforcement
    if (!newDoc.title) {
      toast({ title: 'Missing required fields', description: 'Title is required. Please fill it before saving.', variant: 'destructive' });
      return;
    }

    // Version linking validation
    if (item.linkMode === 'version' && !item.baseId) {
      toast({ title: 'Version linking error', description: 'Please select a document to link this as a new version, or choose "New Document".', variant: 'destructive' });
      return;
    }

    if (item.linkMode === 'version' && item.baseId) {
      console.log('🔍 Linking as new version to document:', item.baseId);
      const created = await linkAsNewVersion(item.baseId, newDoc as any);
      try {
        const orgId = getApiContext().orgId || '';
        await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
          method: 'POST',
          body: {
            documentId: created.id,
            storageKey: item.storageKey,
            fileSizeBytes: item.file.size,
            mimeType: item.file.type || 'application/octet-stream',
            contentHash: item.hash,
          },
        });
        try {
          await apiFetch(`/orgs/${orgId}/documents/${created.id}/extraction`, {
            method: 'POST',
            body: { ocrText: item.extracted?.ocrText || '', metadata: item.extracted?.metadata || {} },
          });
        } catch {}
      } catch (e) {
        console.error('Finalize failed for version:', e);
        throw e;
      }
    } else {
      console.log('🔍 Creating new document with data:', {
        title: newDoc.title,
        folderPath: newDoc.folderPath,
        type: newDoc.type
      });
      const created = await addDocument(newDoc);
      console.log('✅ Document created successfully:', created);
      
      // Finalize file info for created row
      try {
        const orgId = getApiContext().orgId || '';
        console.log('🔍 Finalizing upload for document:', created.id);
        await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
          method: 'POST',
          body: {
            documentId: created.id,
            storageKey: item.storageKey,
            fileSizeBytes: item.file.size,
            mimeType: item.file.type || 'application/octet-stream',
            contentHash: item.hash,
          },
        });
        // Save extraction JSON for preview fallback (optional)
        try {
          await apiFetch(`/orgs/${orgId}/documents/${created.id}/extraction`, {
            method: 'POST',
            body: { ocrText: item.extracted?.ocrText || '', metadata: item.extracted?.metadata || {} },
          });
        } catch (extractionError) {
          console.warn('Failed to save extraction data (non-critical):', extractionError);
          // This is non-critical, continue with the upload
        }
      } catch (uploadError) {
        console.error('Critical upload error:', uploadError);
        throw uploadError;
      }
    }
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'success', locked: true } : q));
    toast({ title: 'Saved', description: `${item.file.name} stored.` });
    
    // Refresh documents to update sidebar count immediately
    try {
      await refresh();
    } catch (error) {
      console.warn('Failed to refresh documents after save:', error);
    }
    
    // Check if this was the last item being processed, if so navigate to documents
    if (!skipNavigation) {
      const updatedQueue = queue.map((q, i) => i === index ? { ...q, status: 'success', locked: true } : q);
      const hasMoreReady = updatedQueue.some(q => q.status === 'ready');
      
      if (!hasMoreReady) {
        // No more items to process, navigate to documents folder
        const dest = folderPath.length ? `?path=${encodeURIComponent(folderPath.join('/'))}` : '';
        setTimeout(() => {
          router.push(`/documents${dest}`);
        }, 500); // Reduced delay for faster navigation
      }
    }
    } catch (error) {
      console.error('Document save error:', error);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: 'Save failed', locked: false } : q));
      toast({ 
        title: 'Save Failed', 
        description: `Failed to save ${item.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        variant: 'destructive' 
      });
    }
  };

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <div className="px-4 md:px-6 pt-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              const dest = folderPath.length ? `?path=${encodeURIComponent(folderPath.join('/'))}` : '';
              router.push(`/documents${dest}`);
            }}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
        </div>
        <PageHeader
          title={folderPath.length ? `Upload to /${folderPath.join('/')}` : "Upload Documents"}
          subtitle={folderPath.length ? 
            `Add files to the ${folderPath[folderPath.length - 1]} folder. We'll analyze, organize, and prepare smart metadata for you.` :
            "Add files and we'll analyze, organize, and prepare smart metadata for you."
          }
          sticky
        />
        <div className="px-4 md:px-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Add a new document to your collection.</p>
          {hasRoleAtLeast('systemAdmin') && folderPath.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">Department</span>
              <UiSelect value={selectedDepartmentId || undefined as any} onValueChange={(v) => setSelectedDepartmentId(v)}>
                <UiSelectTrigger className="w-[220px]"><UiSelectValue placeholder="Select" /></UiSelectTrigger>
                <UiSelectContent>
                  {departments.map(d => (<UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>))}
                </UiSelectContent>
              </UiSelect>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Department: {folderPath.length > 0 ? 'Inherited from folder' : (departments.find(d => d.id === selectedDepartmentId)?.name || 'Your team')}
            </div>
          )}
        </div>
        {!hasRoleAtLeast('member') && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <div className="font-semibold text-destructive">Uploading is restricted</div>
            <p className="text-sm text-muted-foreground mt-1">Your role does not include upload permissions. Please contact an administrator to request <span className="font-medium">Content Manager</span> access or share files with someone who can upload on your behalf.</p>
          </div>
        )}

        {hasRoleAtLeast('member') && queue.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="py-10">
              <div
                role="button"
                tabIndex={0}
                aria-describedby="upload-help"
                className={`mx-auto max-w-2xl border-2 border-dashed rounded-xl bg-card text-center p-10 transition-colors ${dragOver ? 'border-primary/40 bg-accent/10' : 'hover:bg-accent/10'}`}
                onClick={onBrowse}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onBrowse(); }}
                onDragEnter={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDrop={(e) => { setDragOver(false); onDrop(e); }}
              >
                <UploadCloud className="h-12 w-12 mx-auto text-primary mb-4" />
                <div className="text-lg font-semibold">Drag & drop files here</div>
                <div className="text-sm text-muted-foreground">or click to browse</div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="rounded-full border px-2 py-0.5">PDF</span>
                  <span className="rounded-full border px-2 py-0.5">TXT</span>
                  <span className="rounded-full border px-2 py-0.5">MD</span>
                  <span className="rounded-full border px-2 py-0.5">JPG</span>
                  <span className="rounded-full border px-2 py-0.5">PNG</span>
                </div>
                <div id="upload-help" className="mt-2 text-xs text-muted-foreground">We’ll extract metadata and a summary automatically.</div>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.jpg,.jpeg,.png,application/pdf,text/plain,text/markdown,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => e.target.files && onSelect(e.target.files)}
                  />
                  <Button onClick={(e) => { e.stopPropagation(); onBrowse(); }} className="gap-2"><UploadCloud className="h-4 w-4" /> Browse files</Button>
                </div>
              </div>
              <div className="mx-auto max-w-2xl mt-4 text-xs text-muted-foreground">
                Tips: Keep filenames descriptive. You can link uploads as new versions after processing.
              </div>
            </CardContent>
          </Card>
        )}

        {hasRoleAtLeast('member') && queue.length > 0 && (
          <>
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <CardTitle>Upload Queue</CardTitle>
                    <div className="flex items-center gap-2">
                    {queue.filter(item => item.status === 'ready' && !item.locked).length > 1 && (
                      <Button variant="default" size="sm" onClick={saveAllReady} className="gap-2">
                        <Check className="h-3 w-3" />
                        Save All ({queue.filter(item => item.status === 'ready' && !item.locked).length})
                      </Button>
                    )}
                    {carouselMode && queue.length > 1 && (
                      <>
                      <Button variant="outline" size="sm" onClick={() => setActiveIndex((prev) => {
                        const i = (prev ?? 0) - 1;
                        return i < 0 ? queue.length - 1 : i;
                      })}>Prev</Button>
                      <Button variant="outline" size="sm" onClick={() => setActiveIndex((prev) => {
                        const i = (prev ?? 0) + 1;
                        return i >= queue.length ? 0 : i;
                      })}>Next</Button>
                      </>
                    )}
                    {queue.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setCarouselMode(m => !m)}>{carouselMode ? 'List' : 'Carousel'}</Button>
                    )}
                    </div>
                </div>
                {typeof activeIndex === 'number' && queue[activeIndex] && (
                  <div className="text-xs text-muted-foreground">Viewing {activeIndex + 1} of {queue.length}</div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {carouselMode && typeof activeIndex === 'number' && queue[activeIndex] ? (
                  (() => {
                    const item = queue[activeIndex]!;
                    const i = activeIndex!;
                    return (
                      <div className={`rounded-lg border p-3 ring-1 ring-primary`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={item.file.name}>{item.file.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{item.status}</div>
                          </div>
                          <div className="w-40"><Progress value={item.progress} /></div>
                          <div className="flex items-center gap-2">
                            {item.status === 'idle' && !isProcessingAll && <Button size="sm" onClick={() => processItem(i)} disabled={!!item.locked}>Process</Button>}
                            {item.status === 'ready' && <Button size="sm" onClick={() => onDone(i)} disabled={item.locked}>Save</Button>}
                            {(item.status === 'success' || item.status === 'error') && <Button size="sm" variant="outline" onClick={() => {
                              setQueue(prev => {
                                const next = prev.filter((_, idx) => idx !== i);
                                const newLen = next.length;
                                if (newLen === 0) setActiveIndex(null);
                                else setActiveIndex((prevIdx) => {
                                  if (prevIdx === null) return 0;
                                  const ni = Math.min(i, newLen - 1);
                                  return ni;
                                });
                                return next;
                              });
                            }}>Remove</Button>}
                          </div>
                        </div>
                        {/* Preview with simple rotation controls for images */}
                        {item.previewUrl && (
                          <div className="mt-3">
                            <div className="flex items-center justify-center bg-muted/30 rounded-md overflow-hidden">
                              {item.file.name.toLowerCase().endsWith('.pdf') ? (
                                <embed src={item.previewUrl} type="application/pdf" className="w-full" style={{ height: 320 }} />
                              ) : (
                              <img
                                src={item.previewUrl}
                                alt="preview"
                                style={{ transform: `rotate(${item.rotation || 0}deg)`, maxHeight: 240 }}
                                className="object-contain w-full"
                              />
                              )}
                            </div>
                            {!item.file.name.toLowerCase().endsWith('.pdf') && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, rotation: ((q.rotation || 0) - 90 + 360) % 360 } : q))}>Rotate Left</Button>
                              <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, rotation: ((q.rotation || 0) + 90) % 360 } : q))}>Rotate Right</Button>
                            </div>
                            )}
                          </div>
                        )}
                        {item.status === 'ready' && item.form && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Link as version vs new */}
                            <div className="md:col-span-2">
                              <label className="text-sm">Save mode</label>
                              <div className="mt-2 flex items-center gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="radio" checked={item.linkMode === 'new'} onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'new' } : q))} /> New Document
                                </label>
                                <label className={"flex items-center gap-2 text-sm " + (!hasExistingDocs ? 'opacity-60' : '')}>
                                  <input type="radio" disabled={!hasExistingDocs} checked={item.linkMode === 'version'} onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'version' } : q))} /> Link as New Version
                                </label>
                                {item.linkMode === 'version' && hasExistingDocs && item.candidates && item.candidates.length > 0 && (
                                  <select
                                    className="border rounded-md p-1 text-sm"
                                    value={item.baseId}
                                    onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, baseId: e.target.value } : q))}
                                  >
                                    {item.candidates.map(c => (
                                      <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                  </select>
                                )}
                                {item.linkMode === 'version' && hasExistingDocs && (
                                  <Button size="sm" variant="outline" onClick={() => setPickerOpenIndex(i)}>Choose…</Button>
                                )}
                                {!hasExistingDocs && (
                                  <span className="text-xs text-muted-foreground">No documents yet to link.</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Title
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.title || item.form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Filename
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.filename || item.form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Sender
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.sender || item.form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                Receiver
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.receiver || item.form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Document Date
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.documentDate || item.form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Document Type
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.documentType || item.form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Subject
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.subject || item.form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Description
                              </label>
                              <textarea rows={3} className="mt-1 rounded-md border bg-background p-2 w-full" value={form.description || item.form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Bookmark className="h-3 w-3" />
                                Category
                              </label>
                              <UiSelect value={form.category || item.form?.category || 'General'} onValueChange={(value) => setForm({ ...form, category: value })}>
                                <UiSelectTrigger className="mt-1 w-full">
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
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Hash className="h-3 w-3" />
                                Keywords (comma)
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.keywords || item.form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Tags (comma)
                              </label>
                              <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.tags || item.form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FolderOpen className="h-3 w-3" />
                                Upload Destination
                                {folderPath.length > 0 && (
                                  <span className="ml-2 text-primary font-medium">
                                    /{folderPath.join('/')}
                                  </span>
                                )}
                              </label>
                              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                <UiSelect value={folderPath.length ? folderPath.join('/') : '__root__'} onValueChange={(v) => {
                                  if (v === '__root__') setFolderPath([]); else setFolderPath(v.split('/').filter(Boolean));
                                }}>
                                  <UiSelectTrigger className="w-full">
                                    <UiSelectValue placeholder={folderPath.length ? `/${folderPath.join('/')}` : "Root folder"} />
                                  </UiSelectTrigger>
                                  <UiSelectContent>
                                    <UiSelectItem value="__root__">📁 Root</UiSelectItem>
                                    {folders.map((p, idx) => (
                                      <UiSelectItem key={idx} value={p.join('/')}>📁 {p.join('/')}</UiSelectItem>
                                    ))}
                                  </UiSelectContent>
                                </UiSelect>
                                <input 
                                  className="rounded-md border bg-background p-2" 
                                  placeholder="Custom path e.g., Finance/2025/Q1" 
                                  value={folderPath.join('/')} 
                                  onChange={(e) => setFolderPath(e.target.value.split('/').filter(Boolean))} 
                                />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
                                <br />
                                New folders will be created automatically if they don't exist.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  queue.map((item, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${activeIndex === i ? 'ring-1 ring-primary' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={item.file.name}>{item.file.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{item.status}</div>
                        </div>
                        <div className="w-40"><Progress value={item.progress} /></div>
                        <div className="flex items-center gap-2">
                          {item.status === 'idle' && !isProcessingAll && <Button size="sm" onClick={() => processItem(i)} disabled={!!item.locked}>Process</Button>}
                          {item.status === 'ready' && <Button size="sm" onClick={() => onDone(i)} disabled={item.locked}>Save</Button>}
                          {(item.status === 'success' || item.status === 'error') && <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))}>Remove</Button>}
                        </div>
                      </div>
                      {item.status === 'ready' && item.form && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Title
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.title || item.form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Filename
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.filename || item.form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Sender
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.sender || item.form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <UserCheck className="h-3 w-3" />
                              Receiver
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.receiver || item.form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Document Date
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.documentDate || item.form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              Document Type
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.documentType || item.form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              Subject
                            </label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.subject || item.form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              Description
                            </label>
                            <textarea rows={3} className="mt-1 rounded-md border bg-background p-2 w-full" value={form.description || item.form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Bookmark className="h-3 w-3" />
                              Category
                            </label>
                            <UiSelect value={form.category || item.form?.category || 'General'} onValueChange={(value) => setForm({ ...form, category: value })}>
                              <UiSelectTrigger className="mt-1 w-full">
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
                          <div>
                            <label className="text-xs text-muted-foreground">Keywords (comma)</label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.keywords || item.form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground">Tags (comma)</label>
                            <input className="mt-1 rounded-md border bg-background p-2 w-full" value={form.tags || item.form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                          </div>
                          
                          {/* Linking Options */}
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" />
                              Document Relationship
                            </label>
                            <div className="mt-2 flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm">
                                <input 
                                  type="radio" 
                                  checked={item.linkMode === 'new'} 
                                  onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'new' } : q))} 
                                /> 
                                New Document
                              </label>
                              <label className={`flex items-center gap-2 text-sm ${documents.length === 0 ? 'opacity-50' : ''}`}>
                                <input 
                                  type="radio" 
                                  disabled={documents.length === 0} 
                                  checked={item.linkMode === 'version'} 
                                  onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'version' } : q))} 
                                /> 
                                Link as New Version
                              </label>
                              {item.linkMode === 'version' && documents.length > 0 && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => setPickerOpenIndex(i)}
                                  className="text-xs h-7"
                                >
                                  {item.baseId ? 
                                    `Selected: ${documents.find(d => d.id === item.baseId)?.title || documents.find(d => d.id === item.baseId)?.name || 'Unknown'}` :
                                    'Select Document'
                                  }
                                </Button>
                              )}
                            </div>
                            {item.linkMode === 'version' && !item.baseId && (
                              <div className="mt-1 text-xs text-destructive">
                                Please select a document to link this as a new version.
                              </div>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground">
                              Upload Destination
                              {folderPath.length > 0 && (
                                <span className="ml-2 text-primary font-medium">
                                  /{folderPath.join('/')}
                                </span>
                              )}
                            </label>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
                              <br />
                              Folder path is set from the main form above.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onReset}>Clear</Button>
                    {hasSuccess && <span className="text-xs text-muted-foreground">Saved: {queue.filter(q => q.status === 'success').length}</span>}
                    {readyCount > 0 && <span className="text-xs text-muted-foreground">Ready: {readyCount}</span>}
                  </div>
                  <div className="flex gap-2">
                    {hasProcessable && queue.length > 1 && (
                    <Button onClick={async () => {
                      setIsProcessingAll(true);
                      try {
                        const indicesToProcess = queue.map((q, i) => (q.status === 'idle' || q.status === 'error') ? i : -1).filter(i => i >= 0);
                        for (const i of indicesToProcess) {
                          await processItem(i);
                        }
                      } finally {
                        setIsProcessingAll(false);
                      }
                    }}>Process All</Button>
                    )}
                    {readyCount > 0 && (
                      <Button onClick={saveAllReady}>Save All & Go to Documents</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Version picker dialog */}
        {typeof pickerOpenIndex === 'number' && queue[pickerOpenIndex] && (
          <Dialog open onOpenChange={(open) => setPickerOpenIndex(open ? pickerOpenIndex : null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select document to link as new version</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="Search by name…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                />
                <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                  {documents
                    .filter(d => (d.title || d.name || '').toLowerCase().includes(pickerQuery.toLowerCase()))
                    .slice(0, 50)
                    .map(d => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setQueue(prev => prev.map((q, idx) => idx === pickerOpenIndex ? { ...q, baseId: d.id, linkMode: 'version' } : q));
                          setPickerOpenIndex(null);
                        }}
                        className="w-full text-left rounded-md px-2 py-1 hover:bg-accent text-sm"
                      >
                        {(d.title || d.name || 'Untitled')} <span className="ml-2 text-muted-foreground">v{d.versionNumber || d.version || 1}</span>
                      </button>
                    ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPickerOpenIndex(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <UploadContent />
    </Suspense>
  );
}
