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
import { UploadCloud, File, Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Document, StoredDocument } from '@/lib/types';
import { ocrAndDigitalizeDocument } from '@/ai/flows/ocr-and-digitalize-documents';
import { extractDocumentMetadata } from '@/ai/flows/extract-document-metadata';
import { apiFetch, getApiContext } from '@/lib/api';

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      let docType: Document['type'] = 'PDF';
      if (['png', 'jpg', 'jpeg'].includes(extension || '')) docType = 'Image';
      else if (['doc', 'docx'].includes(extension || '')) docType = 'Word';
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
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787'}/orgs/${orgId}/uploads/direct`, {
        method: 'POST',
        headers: { 'X-Org-Id': orgId },
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

      // 3) Create metadata row
      const created = await apiFetch<any>(`/orgs/${orgId}/documents`, {
        method: 'POST',
        body: {
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
        }
      });

      // 4) Finalize with storage key, size, mime
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

  const reset = () => { setFile(null); setFileName(''); setProgress(0); setStatus('idle'); fileInputRef.current && (fileInputRef.current.value = ''); };
  const onOpenChange = (isOpen: boolean) => { if (!isOpen) reset(); setOpen(isOpen); };

  const renderStatus = () => {
    switch (status) {
      case 'uploading': return (<div className="space-y-4 text-center"><p>Uploading {fileName}...</p><Progress value={progress} /></div>);
      case 'processing': return (<div className="space-y-4 text-center flex flex-col items-center"><Loader className="h-10 w-10 animate-spin text-primary" /><p>Processing document with AI...</p><p className="text-sm text-muted-foreground">Extracting metadata and performing OCR.</p></div>);
      case 'success': return (<div className="space-y-4 text-center flex flex-col items-center"><CheckCircle className="h-10 w-10 text-green-500" /><p className='font-semibold'>Upload Successful!</p><p className="text-sm text-muted-foreground">{fileName} has been stored.</p></div>);
      case 'error': return (<div className="space-y-4 text-center flex flex-col items-center"><AlertTriangle className="h-10 w-10 text-destructive" /><p className='font-semibold'>Upload Failed</p><p className="text-sm text-muted-foreground">Could not process {fileName}. Please try again.</p></div>);
      default: return (
        <div className="space-y-4">
          <label htmlFor="file-upload" className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background p-8 text-center hover:bg-accent">
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <span className="font-semibold text-primary">Click to upload</span>
            <span className="text-sm text-muted-foreground">or drag and drop</span>
            <span className="text-xs text-muted-foreground">PDF, PNG, JPG, DOCX</span>
            <input ref={fileInputRef} id="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </label>
          {fileName && (
            <div className="flex items-center justify-center rounded-md border bg-muted/50 p-2 text-sm">
              <File className="mr-2 h-4 w-4" />
              <span className='truncate'>{fileName}</span>
            </div>
          )}
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
          {status === 'idle' || status === 'error' ? (
            <Button onClick={handleUpload} disabled={!fileName || status === 'error'}>{status === 'error' ? 'Try Again' : 'Upload'}</Button>
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
