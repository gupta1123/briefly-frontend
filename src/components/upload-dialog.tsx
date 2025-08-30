"use client";

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { UploadCloud, File, Loader, CheckCircle, AlertTriangle, FolderOpen } from 'lucide-react';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Document, StoredDocument } from '@/lib/types';
import { ocrAndDigitalizeDocument } from '@/ai/flows/ocr-and-digitalize-documents';
import { extractDocumentMetadata } from '@/ai/flows/extract-document-metadata';
import { apiFetch, getApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useDocuments } from '@/hooks/use-documents';
import { useDepartments } from '@/hooks/use-departments';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';

const toDataUri = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function UploadDialog({ onNewDocument }: { onNewDocument: (doc: StoredDocument) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<Document['type']>('PDF');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Folder and department selection
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const { hasRoleAtLeast } = useAuth();
  const { folders, createFolder } = useDocuments();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      let docType: Document['type'] = 'PDF';
      if (['png', 'jpg', 'jpeg'].includes(extension || '')) docType = 'Image';
      setFileType(docType);
      setStatus('idle');
      setProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!file) { toast({ title: 'No file selected', description: 'Please select a file to upload.', variant: 'destructive' }); return; }

    setStatus('uploading');
    const interval = setInterval(() => setProgress((p) => Math.min(p + 7, 85)), 160);

    try {
      const { orgId } = getApiContext();
      if (!orgId) throw new Error('No organization set');

      // 1) Direct upload to our backend (which writes to Supabase Storage)
      const form = new FormData();
      form.append('file', file);
      // Include Supabase JWT for backend auth
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787'}/orgs/${orgId}/uploads/direct`, {
        method: 'POST',
        headers: { 
          'X-Org-Id': orgId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });
      if (!uploadRes.ok) {
        const msg = await uploadRes.text();
        throw new Error(`Storage upload failed: ${msg}`);
      }
      const uploaded = await uploadRes.json();
      if (!uploaded?.storageKey) throw new Error('No storageKey returned');

      clearInterval(interval);
      setProgress(100);
      setStatus('processing');

      // 2) AI processing from client copy (for demo)
      const dataUri = await toDataUri(file);
      const [ocrResult, metadataResult] = await Promise.all([
        ocrAndDigitalizeDocument({ documentDataUri: dataUri }),
        extractDocumentMetadata({ documentDataUri: dataUri, documentType: fileType })
      ]);

      // 3) Validate department selection for admins
      if (hasRoleAtLeast('systemAdmin') && folderPath.length === 0 && !selectedDepartmentId) {
        toast({
          title: 'Department selection required',
          description: 'Please select a department before uploading documents.',
          variant: 'destructive'
        });
        return;
      }

      // 4) Ensure nested folders exist - create each level sequentially
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
        return;
      }

      // 5) Create metadata row
      const documentData = {
        title: metadataResult.title || file.name,
        filename: file.name,
        type: fileType,
        subject: metadataResult.subject || '',
        description: metadataResult.description || metadataResult.summary || '',
        category: metadataResult.category || 'General',
        tags: metadataResult.tags || [],
        sender: metadataResult.sender || '',
        receiver: metadataResult.receiver || '',
        document_date: metadataResult.documentDate || '',
        folderPath: folderPath,
        departmentId: selectedDepartmentId || undefined,
      };

      console.log('🔍 Creating document with folderPath:', folderPath, 'Type:', typeof folderPath, 'Is Array:', Array.isArray(folderPath));

      const created = await apiFetch<any>(`/orgs/${orgId}/documents`, {
        method: 'POST',
        body: documentData
      });

      // 6) Finalize with storage key, size, mime
      await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
        method: 'POST',
        body: {
          documentId: created.id,
          storageKey: uploaded.storageKey,
          fileSizeBytes: file.size,
          mimeType: file.type,
        }
      });

      const newDoc: StoredDocument = {
        id: created.id,
        name: file.name,
        type: fileType,
        uploadedAt: new Date(created.uploaded_at || Date.now()),
        version: 1,
        keywords: metadataResult.keywords,
        summary: metadataResult.summary,
        content: ocrResult.extractedText,
        folderPath: folderPath,
      };

      onNewDocument(newDoc);
      setStatus('success');
    } catch (e) {
      console.error(e);
      clearInterval(interval);
      setStatus('error');
      toast({ title: 'Upload Failed', description: (e as Error).message || 'There was an error.', variant: 'destructive' });
    }
  };

  const reset = () => {
    setFile(null);
    setFileName('');
    setProgress(0);
    setStatus('idle');
    setFolderPath([]);
    fileInputRef.current && (fileInputRef.current.value = '');
  };
  const onOpenChange = (isOpen: boolean) => { if (!isOpen) reset(); setOpen(isOpen); };

  const renderStatus = () => {
    switch (status) {
      case 'uploading': return (<div className="space-y-4 text-center"><p>Uploading {fileName}...</p><Progress value={progress} /></div>);
      case 'processing': return (<div className="space-y-4 text-center flex flex-col items-center"><Loader className="h-10 w-10 animate-spin text-primary" /><p>Processing document with AI...</p><p className="text-sm text-muted-foreground">Extracting metadata and performing OCR.</p></div>);
      case 'success': return (<div className="space-y-4 text-center flex flex-col items-center"><CheckCircle className="h-10 w-10 text-green-500" /><p className='font-semibold'>Upload Successful!</p><p className="text-sm text-muted-foreground">{fileName} has been stored.</p></div>);
      case 'error': return (<div className="space-y-4 text-center flex flex-col items-center"><AlertTriangle className="h-10 w-10 text-destructive" /><p className='font-semibold'>Upload Failed</p><p className="text-sm text-muted-foreground">Could not process {fileName}. Please try again.</p></div>);
      default: return (
        <div className="space-y-4">
          {/* Folder and Department Selection */}
          <div className="space-y-3">
            {/* Folder Selection */}
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Upload Destination</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <UiSelect value={folderPath.length ? folderPath.join('/') : '__root__'} onValueChange={(v) => {
                if (v === '__root__') setFolderPath([]);
                else setFolderPath(v.split('/').filter(Boolean));
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
                className="rounded-md border bg-background p-2 text-sm"
                placeholder="Custom path e.g., Finance/2025/Q1"
                value={folderPath.join('/')}
                onChange={(e) => setFolderPath(e.target.value.split('/').filter(Boolean))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
              <br />
              New folders will be created automatically if they don't exist.
            </p>

            {/* Department Selection for Admins */}
            {hasRoleAtLeast('systemAdmin') && folderPath.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Department</span>
                  {!selectedDepartmentId && (
                    <span className="text-xs text-red-600 font-medium">Required</span>
                  )}
                </div>
                <UiSelect value={selectedDepartmentId || undefined as any} onValueChange={(v) => setSelectedDepartmentId(v)} required>
                  <UiSelectTrigger className="w-full">
                    <UiSelectValue placeholder="Select department" />
                  </UiSelectTrigger>
                  <UiSelectContent>
                    {departments.map(d => (<UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>))}
                  </UiSelectContent>
                </UiSelect>
              </div>
            )}
          </div>

          {/* File Upload Section */}
          <div className="border-t pt-4">
            <label htmlFor="file-upload" className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background p-8 text-center hover:bg-accent">
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <span className="font-semibold text-primary">Click to upload</span>
              <span className="text-sm text-muted-foreground">or drag and drop</span>
              <span className="text-xs text-muted-foreground">PDF, TXT, MD, JPG, PNG</span>
              <input ref={fileInputRef} id="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.txt,.md,.jpg,.jpeg,.png,application/pdf,text/plain,text/markdown,image/jpeg,image/png" />
            </label>
            {fileName && (
              <div className="flex items-center justify-center rounded-md border bg-muted/50 p-2 text-sm mt-4">
                <File className="mr-2 h-4 w-4" />
                <span className='truncate'>{fileName}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button><UploadCloud className="mr-2 h-4 w-4" />Upload Document</Button></DialogTrigger>
      <DialogContent className={cn("sm:max-w-[425px]", { 'sm:max-w-md': status !== 'idle' })}>
        <DialogHeader><DialogTitle>Upload a new document</DialogTitle><DialogDescription>Your file will be uploaded to storage and scanned by AI.</DialogDescription></DialogHeader>
        <div className="py-4">{renderStatus()}</div>
        <DialogFooter>
          {(status === 'idle' || status === 'error') ? (
            <Button onClick={handleUpload} disabled={!fileName}>{status === 'error' ? 'Try Again' : 'Upload'}</Button>
          ) : status === 'success' ? (
            <DialogClose asChild><Button>Done</Button></DialogClose>
          ) : (
            <Button disabled><Loader className="mr-2 h-4 w-4 animate-spin" />Please wait</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
