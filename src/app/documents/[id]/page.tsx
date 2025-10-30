"use client";

import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Pencil, Trash2, Copy, FileText as FileTextIcon, User, UserCheck, Calendar, Tag, MessageSquare, Hash, Bookmark, FolderOpen, MapPin, Info, FileType, HardDrive, Link as LinkIcon } from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';
import { useDocuments } from '@/hooks/use-documents';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { formatAppDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/use-departments';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import FilePreview from '@/components/file-preview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, removeDocument, setCurrentVersion, unlinkFromVersionGroup, documents, refresh } = useDocuments();
  const { hasRoleAtLeast, hasPermission, isLoading: authLoading, user } = useAuth();
  
  // Check document permissions
  const canReadDocuments = hasPermission('documents.read');
  const canUpdateDocuments = hasPermission('documents.update');
  const canDeleteDocuments = hasPermission('documents.delete');
  const { departments } = useDepartments();
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(2)} KB`;
    if (bytes < 1024*1024*1024) return `${(bytes/1024/1024).toFixed(2)} MB`;
    return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
  };
  
  const doc = getDocumentById(params.id);
  const [ocrText, setOcrText] = useState<string>('');
  const [extractionSummary, setExtractionSummary] = useState<string>('');
  const [loadingExtraction, setLoadingExtraction] = useState<boolean>(false);
  const [referrer, setReferrer] = useState<string | null>(null);
  const loadAttempted = useRef<Set<string>>(new Set());

  // Track when documents are loaded with better logic
  useEffect(() => {
    if (authLoading) return; // Wait for auth to complete
    
    if (documents.length > 0) {
      setDocumentsLoaded(true);
      setInitialLoading(false);
      
      // If we have documents but not this specific one, it might not exist
      if (!doc && !loadAttempted.current.has(params.id)) {
        loadAttempted.current.add(params.id);
        // Try to fetch this specific document directly
        const fetchDoc = async () => {
          try {
            const { orgId } = getApiContext();
            await apiFetch(`/orgs/${orgId}/documents/${params.id}`);
            // If successful, it exists but might not be in our current list
            // Force a refresh to get it
            setTimeout(() => window.location.reload(), 100);
          } catch (error: any) {
            if (error.status === 404) {
              setLoadError('Document not found');
            } else {
              setLoadError('Failed to load document');
            }
            setInitialLoading(false);
          }
        };
        fetchDoc();
      }
    } else if (!authLoading) {
      // Auth is done but no documents loaded yet - wait a bit more
      const timer = setTimeout(() => {
        setInitialLoading(false);
        if (!documentsLoaded) {
          setLoadError('Failed to load documents');
        }
      }, 5000); // 5 second timeout
      
      return () => clearTimeout(timer);
    }
  }, [documents.length, doc, params.id, authLoading, documentsLoaded]);

  // Set referrer on mount for smart back navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReferrer(document.referrer);
    }
  }, []);

  // Auto-load extraction content on page load
  useEffect(() => {
    const { orgId } = getApiContext();
    if (doc && !doc.content && !ocrText && !loadingExtraction && orgId && !loadAttempted.current.has(doc.id)) {
      console.log('Auto-loading extraction for doc:', doc.id, 'orgId:', orgId);
      loadAttempted.current.add(doc.id);
      
      const loadExtraction = async () => {
        try {
          setLoadingExtraction(true);
          console.log('Fetching extraction from:', `/orgs/${orgId}/documents/${doc.id}/extraction`);
          const data: any = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/extraction`);
          console.log('Extraction response:', data);
          setOcrText(String(data.ocrText || ''));
          try {
            const sum = String(data?.metadata?.summary || '').trim();
            if (sum) setExtractionSummary(sum);
          } catch {}
        } catch (error) {
          console.log('No extraction found:', error);
        }
        setLoadingExtraction(false);
      };
      loadExtraction();
    }
  }, [doc?.id]); // Only depend on document ID changing

  // Show loading state if documents haven't loaded yet
  if (!documentsLoaded) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6">
          {/* Header skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-16" />
            </div>
          </div>
          
          {/* Content skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="h-6 w-28" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show loading states and handle errors properly
  if (authLoading || initialLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <div className="text-lg font-medium text-muted-foreground mb-2">
              {authLoading ? 'Authenticating...' : 'Loading document...'}
            </div>
            <div className="text-sm text-muted-foreground">
              Please wait while we fetch your document.
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="text-center py-12">
            <div className="text-lg font-medium text-destructive mb-2">{loadError}</div>
            <div className="text-sm text-muted-foreground mb-4">
              {loadError === 'Document not found' 
                ? 'The document you\'re looking for might have been deleted or moved.'
                : 'There was a problem loading the document. Please try again.'}
            </div>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline">
                <Link href="/documents">Back to Documents</Link>
              </Button>
              {loadError !== 'Document not found' && (
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Final check - if we've loaded documents but still don't have this one
  if (documentsLoaded && !doc) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="text-center py-12">
            <div className="text-lg font-medium text-muted-foreground mb-2">Document not found</div>
            <div className="text-sm text-muted-foreground mb-4">
              The document you're looking for might have been deleted or moved.
            </div>
            <Button asChild>
              <Link href="/documents">Back to Documents</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // At this point, doc should be defined since we've handled all error cases
  if (!doc) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="text-center py-12">
            <div className="text-lg font-medium text-muted-foreground mb-2">Unexpected Error</div>
            <div className="text-sm text-muted-foreground mb-4">
              Document reference lost. Please try refreshing the page.
            </div>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Create proper back navigation based on referrer and document's folder path
  const folderPath = doc.folderPath || (doc as any).folder_path || [];
  
  // Determine back navigation
  let backHref: string;
  let backLabel: string;
  
  if (referrer && typeof window !== 'undefined' && referrer.includes(window.location.origin)) {
    // User came from our app
    const referrerPath = new URL(referrer).pathname;
    
    try {
      if (referrerPath.startsWith('/documents') && referrerPath !== '/documents') {
        // Came from documents page - use folder path if available
        if (folderPath.length > 0) {
          backHref = `/documents?path=${encodeURIComponent(folderPath.join('/'))}`;
          backLabel = `Back to ${folderPath[folderPath.length - 1]}`;
        } else {
          backHref = '/documents';
          backLabel = 'Back to Documents';
        }
      } else if (referrerPath.startsWith('/dashboard')) {
        // Came from dashboard
        backHref = '/dashboard';
        backLabel = 'Back to Dashboard';
      } else if (referrerPath.startsWith('/audit')) {
        // Came from audit page
        backHref = '/audit';
        backLabel = 'Back to Audit';
      } else if (referrerPath.startsWith('/chat')) {
        // Came from chat
        backHref = '/chat';
        backLabel = 'Back to Chat';
      } else {
        // Default fallback
        backHref = '/documents';
        backLabel = 'Back to Documents';
      }
    } catch (error) {
      // If URL parsing fails, fallback to documents
      console.warn('Failed to parse referrer URL:', error);
      backHref = '/documents';
      backLabel = 'Back to Documents';
    }
  } else {
    // No referrer or external - use folder path if available
    if (folderPath.length > 0) {
      backHref = `/documents?path=${encodeURIComponent(folderPath.join('/'))}`;
      backLabel = `Back to ${folderPath[folderPath.length - 1]}`;
    } else {
      backHref = '/documents';
      backLabel = 'Back to Documents';
  }
  }

  // Check if user has permission to read documents
  if (!canReadDocuments) {
    return (
      <AppLayout>
        <ViewAccessDenied />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Button variant="ghost" size="sm" className="gap-2 p-2" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
          <span className="text-muted-foreground">•</span>
          <nav className="flex items-center gap-1">
            <Link href="/documents" className="hover:text-foreground">
              Documents
            </Link>
            {folderPath.map((folder: string, index: number) => (
              <React.Fragment key={index}>
                <span>/</span>
                <Link 
                  href={`/documents?path=${encodeURIComponent(folderPath.slice(0, index + 1).join('/'))}`}
                  className="hover:text-foreground"
                >
                  {folder}
                </Link>
              </React.Fragment>
            ))}
            <span>/</span>
            <span className="text-foreground font-medium">{doc.title || doc.filename}</span>
          </nav>
        </div>

        <PageHeader
          title={doc.title || doc.name}
          meta={doc.versionGroupId ? (
            <span>Version {doc.versionNumber || doc.version}{doc.isCurrentVersion ? ' · Current' : ''}</span>
          ) : null}
          actions={
            <div className="flex items-center gap-2">
              {(() => {
                const myDeptIds = new Set((departments || []).map((d:any) => d.id));
                const docDeptId = (doc as any).departmentId || (doc as any).department_id || null;
                const isAdmin = user?.role === 'systemAdmin';
                const canEdit = hasRoleAtLeast('member') && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && canUpdateDocuments;
                const canDelete = hasRoleAtLeast('member') && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && canDeleteDocuments;
                return (canEdit || canDelete) ? (
                  <>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadContent(doc, extractionSummary)}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                    {canDelete && (
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    )}
                    {canEdit && (
                      <Button asChild size="sm" className="gap-2">
                        <Link href={`/documents/${doc.id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
                      </Button>
                    )}
                  </>
                ) : null;
              })()}
              {/* Removed "Ask about this" button per requirement */}
            </div>
          }
          sticky
        />

        {/* Confirm delete dialog for single document */}
        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete "{doc?.title || doc?.filename || doc?.name}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => { setConfirmDeleteOpen(false); handleDelete(doc!.id, removeDocument, router); }}
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          {/* Left stack - 60% */}
          <div className="xl:col-span-3 space-y-6 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                {doc.folderPath && doc.folderPath.length > 0 ? (
                  <div className="text-sm">
                    <Link href="/documents" className="text-primary hover:underline">Root</Link>
                    {doc.folderPath.map((seg, i) => (
                      <span key={i} className="text-muted-foreground"> {` / `} <span className="text-foreground">{seg}</span></span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm"><Link href="/documents" className="text-primary hover:underline">Root</Link></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1 mb-1">
                      <MessageSquare className="h-3 w-3 flex-shrink-0" />
                      Subject
                    </p>
                    <p className="font-medium break-words">{doc.subject || '—'}</p>
                  </div>
                  
                   <div className="min-w-0">
                     <p className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1 mb-1">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      Uploaded
                     </p>
                    <p className="font-medium">{formatAppDateTime(doc.uploadedAt)}</p>
                   </div>
                  
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1 mb-1">
                      <User className="h-3 w-3 flex-shrink-0" />
                      Sender
                    </p>
                    <p className="font-medium break-words">{doc.sender || 'N/A'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1 mb-1">
                      <UserCheck className="h-3 w-3 flex-shrink-0" />
                      Receiver
                    </p>
                    <p className="font-medium break-words">{doc.receiver || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Metadata & Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {/* Debug: Show what fields are available */}
                <div className="text-xs text-muted-foreground mb-2">
                  Available fields: summary={doc.summary ? 'YES' : 'NO'}, description={doc.description ? 'YES' : 'NO'}
                </div>
                {(() => {
                  const displaySummary = (doc.summary || extractionSummary || doc.description || '').trim();
                  if (!displaySummary) return null;
                  return (
                    <div>
                      <h3 className="font-semibold mb-1">AI Summary</h3>
                      <p id="extraction-summary-tap" className="text-muted-foreground whitespace-pre-wrap break-words">{displaySummary}</p>
                    </div>
                  );
                })()}
                {(doc.aiPurpose || (doc.aiKeyPoints && doc.aiKeyPoints.length) || doc.aiContext || doc.aiOutcome) && (
                  <div className="space-y-2">
                    {doc.aiPurpose && <div><span className="font-semibold">Purpose:</span> <span className="break-words">{doc.aiPurpose}</span></div>}
                    {doc.aiKeyPoints && doc.aiKeyPoints.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">Key Points</div>
                        <ul className="list-disc pl-5 space-y-1">
                          {doc.aiKeyPoints.map((p, i) => (<li key={i} className="break-words">{p}</li>))}
                        </ul>
                      </div>
                    )}
                    {doc.aiContext && <div><span className="font-semibold">Context:</span> <span className="break-words">{doc.aiContext}</span></div>}
                    {doc.aiOutcome && <div><span className="font-semibold">Outcome/Action:</span> <span className="break-words">{doc.aiOutcome}</span></div>}
                  </div>
                )}



                {(doc.aiKeywords && doc.aiKeywords.length > 0) && (
                  <div>
                    <div className="font-semibold mb-1">AI Keywords</div>
                    <div className="flex flex-wrap gap-2">
                      {doc.aiKeywords.map(k => (<span key={k} className="rounded-md border px-2 py-1 text-xs">{k}</span>))}
                    </div>
                  </div>
                )}

                 {(doc.tags && doc.tags.length > 0) && (
                  <div>
                    <div className="font-semibold mb-1">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {doc.tags.map(k => (<span key={k} className="rounded-md border px-2 py-1 text-xs">{k}</span>))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card id="linked">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Linked Documents
                </CardTitle>
                <SuggestLinksButton docId={doc.id} onLinked={() => { /* refresh handled internally */ }} />
              </CardHeader>
              <CardContent className="text-sm">
                <LinkedList docId={doc.id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileTextIcon className="h-5 w-5" />
                  File Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {doc.filename && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <FileTextIcon className="h-3 w-3 flex-shrink-0" />
                      Filename
                    </span>
                    <span className="font-medium md:col-span-3 break-words">{doc.filename}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        Created
                      </span>
                      <span className="font-medium">{formatAppDateTime(doc.uploadedAt)}</span>
                    </div>
                    {doc.fileSizeBytes !== undefined && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-3 w-3 flex-shrink-0" />
                          File Size
                        </span>
                        <span className="font-medium">{formatSize(doc.fileSizeBytes)}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3 flex-shrink-0" />
                        Type
                      </span>
                      <span className="font-medium break-words">{doc.documentType || doc.type}</span>
                    </div>
                    {doc.mimeType && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <FileType className="h-3 w-3 flex-shrink-0" />
                          MIME Type
                        </span>
                        <span className="font-medium break-words">{doc.mimeType}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - File Preview - 40% */}
          <div className="xl:col-span-2">
            <FilePreview 
              documentId={doc.id}
              mimeType={doc.mimeType}
              extractedContent={doc.content || ocrText || undefined}
            />
                </div>
        </div>
      </div>
    </AppLayout>
  );
}

async function downloadContent(doc: any, extractionSummary?: string) {
  try {
    const { orgId } = getApiContext();
    if (!orgId) return;
    
    // Get the file URL from backend
    const response = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/file`);
    if (response.url) {
      // Download the actual file
      const a = document.createElement('a');
      a.href = response.url;
      a.download = response.filename || doc.filename || doc.name || 'document';
      a.target = '_blank'; // Open in new tab to handle CORS issues
      a.click();
    } else {
      // Fallback to text content if no file URL
      const blob = new Blob([doc.content || doc.summary || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc.filename || doc.name || 'document') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Download failed:', error);
    // Fallback to text content
    const blob = new Blob([doc.content || doc.summary || (extractionSummary || '')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (doc.filename || doc.name || 'document') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function handleDelete(id: string, removeDocument: (id: string) => void, router: any) {
  removeDocument(id);
  // Refresh the documents list to ensure UI updates immediately
  if (typeof window !== 'undefined') {
    // Dispatch a custom event to notify other parts of the app
    window.dispatchEvent(new CustomEvent('documentDeleted', { detail: { id } }));
  }
  router.push('/documents');
}

function copySummary(doc: any) {
  try {
    const text = doc.summary || (document.getElementById('extraction-summary-tap') as HTMLDivElement | null)?.innerText || doc.aiPurpose || '';
    if (!text) return;
    navigator.clipboard?.writeText(text);
  } catch {}
}

function exportJson(doc: any) {
  try {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (doc.filename || doc.name || 'document') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch {}
}

function VersionsPanel({ docId }: { docId: string }) {
  const { getDocumentById, setCurrentVersion, unlinkFromVersionGroup, documents } = useDocuments();
  const doc = getDocumentById(docId)!;
  if (!doc.versionGroupId) return null;
  
  const versions = documents.filter(d => (d.versionGroupId || (d as any).version_group_id || d.id) === doc.versionGroupId)
    .sort((a, b) => (a.versionNumber || a.version || 1) - (b.versionNumber || b.version || 1));

  const currentIndex = versions.findIndex(v => v.id === docId);
  const totalVersions = versions.length;

  const moveVersion = async (fromVersion: number, toVersion: number, documentId: string) => {
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${documentId}/move-version`, {
        method: 'POST',
        body: { fromVersion, toVersion }
      });
      window.location.reload();
    } catch (error) {
      console.error('Failed to move version:', error);
    }
  };

  const getVersionAge = (uploadedAt: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - uploadedAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
    return `${Math.ceil(diffDays / 365)} years ago`;
  };

  return (
    <div className="space-y-3">
      {/* Version Timeline Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Version History</div>
        <div className="text-xs text-muted-foreground">
          {totalVersions} version{totalVersions !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Version Timeline */}
      <div className="relative">
        {/* Timeline line */}
        {totalVersions > 1 && (
          <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-border"></div>
        )}
        
        <div className="space-y-3">
          {versions.map((v: any, index) => {
            const isActive = v.id === docId;
            const isCurrent = v.isCurrentVersion;
            const versionNum = v.versionNumber || v.version || 1;
            
            return (
              <div key={v.id} className={`relative flex items-start gap-3 ${isActive ? 'bg-accent/20 p-2 rounded-md' : ''}`}>
                {/* Timeline dot */}
                <div className={`relative z-10 w-3 h-3 rounded-full border-2 flex-shrink-0 mt-2 ${
                  isCurrent 
                    ? 'bg-primary border-primary' 
                    : isActive 
                      ? 'bg-background border-primary'
                      : 'bg-background border-muted-foreground'
                }`}>
                  {isCurrent && (
                    <div className="absolute inset-0 rounded-full bg-primary animate-pulse opacity-50"></div>
                  )}
                </div>

                {/* Version Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Version {versionNum}</span>
                        {isCurrent && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                        {isActive && !isCurrent && (
                          <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                            Viewing
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getVersionAge(new Date(v.uploadedAt))} · {formatAppDateTime(v.uploadedAt)}
                      </div>
                      {v.documentType && (
                        <div className="text-xs text-muted-foreground">
                          {v.documentType}
                        </div>
                      )}
          </div>

                    {/* Action Buttons */}
          <div className="flex items-center gap-1">
                      {/* Reorder buttons - only show if there are multiple versions */}
                      {totalVersions > 1 && (
                        <>
            {index > 0 && (
              <Button 
                size="sm" 
                variant="ghost" 
                              className="h-7 w-7 p-0"
                              onClick={() => moveVersion(versionNum, versions[index-1].versionNumber || versions[index-1].version || 1, v.id)}
                              title="Move up in timeline"
              >
                ↑
              </Button>
            )}
            {index < versions.length - 1 && (
              <Button 
                size="sm" 
                variant="ghost" 
                              className="h-7 w-7 p-0"
                              onClick={() => moveVersion(versionNum, versions[index+1].versionNumber || versions[index+1].version || 1, v.id)}
                              title="Move down in timeline"
              >
                ↓
              </Button>
            )}
                        </>
                      )}
                      
                      {!isCurrent && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 px-2 text-xs"
                          onClick={() => setCurrentVersion(v.id)}
                        >
                          Make Current
                        </Button>
                      )}
                      
                      {!isActive && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
              <Link href={`/documents/${v.id}`}>View</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Version Actions */}
      <div className="pt-2 border-t">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-xs" asChild>
            <Link href={`/documents/upload?path=${encodeURIComponent(doc.folderPath?.join('/') || '')}&version=${doc.id}`}>
              + New Version
            </Link>
          </Button>
          {totalVersions > 1 && (
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs"
              onClick={() => unlinkFromVersionGroup(docId)}
            >
              Unlink from Group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkedList({ docId }: { docId: string }) {
  const { getDocumentById, documents, refresh, unlinkFromVersionGroup } = useDocuments();
  const { toast } = useToast();
  const [relationships, setRelationships] = useState<{
    linked: any[],
    versions: any[],
    incoming: any[],
    outgoing: any[]
  }>({ linked: [], versions: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  
  // Get current document for version actions
  const currentDoc = getDocumentById(docId);
  
  // Load relationships using the new endpoint
  const loadRelationships = useCallback(async () => {
    try {
      setLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${docId}/relationships`);
      setRelationships(data);
    } catch (error) {
      console.error('Failed to load relationships:', error);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  // Fallback to legacy linkedDocumentIds for backwards compatibility
  const base = getDocumentById(docId)!;
  const legacyIds = base.linkedDocumentIds || [];
  const linkedDocs = relationships.linked.length > 0 ? relationships.linked : 
    legacyIds.map(id => getDocumentById(id)).filter(Boolean);



  const addLink = async (targetId: string, linkType: string = 'related') => {
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${docId}/link`, {
        method: 'POST',
        body: { linkedId: targetId, linkType }
      });
      toast({ title: 'Success', description: 'Documents linked successfully' });
      await Promise.all([refresh(), loadRelationships()]); // Refresh both document list and relationships
    } catch (error: any) {
      console.error('Failed to link documents:', error);
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to link documents', 
        variant: 'destructive' 
      });
    }
  };

  const removeLink = async (targetId: string) => {
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${docId}/link/${targetId}`, {
        method: 'DELETE'
      });
      toast({ title: 'Success', description: 'Link removed successfully' });
      await Promise.all([refresh(), loadRelationships()]); // Refresh both document list and relationships
    } catch (error) {
      console.error('Failed to remove link:', error);
      toast({ title: 'Error', description: 'Failed to remove link', variant: 'destructive' });
    }
  };
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="text-sm font-medium">Related Documents</div>

      {loading ? (
    <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          </div>
      ) : (
        <div className="space-y-4">
          {/* Outgoing Links - Documents this document links TO */}
          {relationships.outgoing.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <span>↗️</span> Links to ({relationships.outgoing.length})
              </div>
              <div className="space-y-2">
                {relationships.outgoing.map(rel => (
                  <div key={rel.id} className="flex items-center justify-between rounded-md border p-3 bg-background">
                <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" title={rel.title}>
                        {rel.title}
                  </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{rel.type}</span>
                        {rel.linkType && rel.linkType !== 'related' && <Badge variant="outline" className="text-xs">{rel.linkType}</Badge>}
                        {rel.versionNumber && <span>v{rel.versionNumber}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                        <Link href={`/documents/${rel.id}`}>View</Link>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeLink(rel.id)}
                    title="Remove link"
                  >
                    ×
                  </Button>
                </div>
              </div>
                ))}
        </div>
            </div>
          )}

          {/* Incoming Links - Documents that link TO this document */}
          {relationships.incoming.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <span>↙️</span> Linked from ({relationships.incoming.length})
              </div>
              <div className="space-y-2">
                {relationships.incoming.map(rel => (
                  <div key={rel.id} className="flex items-center justify-between rounded-md border p-3 bg-background border-l-4 border-l-blue-200">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" title={rel.title}>
                        {rel.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{rel.type}</span>
                        {rel.linkType && rel.linkType !== 'related' && <Badge variant="outline" className="text-xs">{rel.linkType}</Badge>}
                        {rel.versionNumber && <span>v{rel.versionNumber}</span>}
                        <span className="text-blue-600">← references this</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                        <Link href={`/documents/${rel.id}`}>View</Link>
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeLink(rel.id)}
                        title="Remove link"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version Management */}
          {(relationships.versions.length > 0 || currentDoc?.versionGroupId) && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <span>📄</span> Version History
              </div>
              
              {/* Current document version info */}
              <div className="mb-3 p-3 rounded-md border bg-background/50 border-l-4 border-l-blue-500">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={currentDoc?.title}>
                    {currentDoc?.title || currentDoc?.filename || 'Untitled'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span>v{currentDoc?.versionNumber || 1}</span>
                    <Badge variant="default" className="text-xs">Current</Badge>
                    <span>📍 You are here</span>
                  </div>
                </div>
              </div>

              {/* Other versions */}
              {relationships.versions.length > 0 && (
                <div className="space-y-2 mb-3">
                  {relationships.versions
                    .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))
                    .map(version => (
                    <div key={version.id} className="flex items-center justify-between rounded-md border p-3 bg-background border-l-4 border-l-green-200">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={version.title}>
                          {version.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <span>v{version.versionNumber || 'Unknown'}</span>
                          {version.isCurrentVersion && <Badge variant="outline" className="text-xs">Current</Badge>}
                          <span>{formatAppDateTime(new Date(version.uploadedAt))}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                          <Link href={`/documents/${version.id}`}>View</Link>
                        </Button>
                        {!version.isCurrentVersion && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={async () => {
                              try {
                                const { orgId } = getApiContext();
                                await apiFetch(`/orgs/${orgId}/documents/${version.id}/set-current`, { method: 'POST' });
                                await loadRelationships();
                              } catch (e) {
                                console.error('Failed to set current version:', e);
                              }
                            }}
                          >
                            Set Current
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Version Actions */}
              <div className="pt-2 border-t">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs" asChild>
                    <Link href={`/documents/upload?path=${encodeURIComponent(currentDoc?.folderPath?.join('/') || '')}&version=${docId}`}>
                      + New Version
                    </Link>
                  </Button>
                  {(relationships.versions.length > 0 || currentDoc?.versionGroupId) && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => {
                        if (unlinkFromVersionGroup) {
                          unlinkFromVersionGroup(docId);
                          loadRelationships(); // Refresh after unlinking
                        }
                      }}
                    >
                      Unlink from Group
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No relationships */}
          {relationships.outgoing.length === 0 && relationships.incoming.length === 0 && relationships.versions.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
              No related documents or versions found
            </div>
          )}
        </div>
      )}


    </div>
  );
}

function SuggestLinksButton({ docId, onLinked }: { docId: string; onLinked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'sender'|'subject'>('sender');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const { refresh } = useDocuments();
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch<{ suggestions: any[] }>(`/orgs/${orgId}/documents/${docId}/suggest-links?by=${mode}`);
      setList(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (e) {
      console.error('Failed to load suggestions:', e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [docId, mode]);
  useEffect(() => { if (open) load(); }, [open, load]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Suggest Links</Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suggest Links</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span>Based on:</span>
          <Button size="sm" variant={mode==='sender'?'default':'outline'} onClick={() => setMode('sender')}>Sender</Button>
          <Button size="sm" variant={mode==='subject'?'default':'outline'} onClick={() => setMode('subject')}>Subject</Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {list.length === 0 && <div className="text-xs text-muted-foreground">No suggestions found.</div>}
          {list.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-3 bg-background">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={s.title}>{s.title || 'Untitled'}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  {s.type && <span>{s.type}</span>}
                  {Array.isArray(s.reasons) && s.reasons.length > 0 && (
                    <span className="truncate">{s.reasons.slice(0,2).join('; ')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={async () => {
                  try {
                    const { orgId } = getApiContext();
                    await apiFetch(`/orgs/${orgId}/documents/${docId}/link`, { method: 'POST', body: { linkedId: s.id, linkType: 'related' } });
                    await refresh();
                    onLinked && onLinked();
                    setOpen(false);
                  } catch (e) {
                    console.error('Failed to link:', e);
                  }
                }}>Link</Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
// (Inline Suggestions component removed in favor of SuggestLinksButton modal)
