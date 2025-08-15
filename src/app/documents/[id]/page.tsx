"use client";

import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Pencil, Trash2, Copy, FileText as FileTextIcon } from 'lucide-react';
import { useDocuments } from '@/hooks/use-documents';
import { useEffect, useState, useRef } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { formatAppDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, removeDocument, setCurrentVersion, unlinkFromVersionGroup, documents } = useDocuments();
  const { hasRoleAtLeast } = useAuth();
  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(2)} KB`;
    if (bytes < 1024*1024*1024) return `${(bytes/1024/1024).toFixed(2)} MB`;
    return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
  };
  const doc = getDocumentById(params.id);
  const [ocrText, setOcrText] = useState<string>('');
  const [loadingExtraction, setLoadingExtraction] = useState<boolean>(false);
  const loadAttempted = useRef<Set<string>>(new Set());

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
        } catch (error) {
          console.log('No extraction found:', error);
        }
        setLoadingExtraction(false);
      };
      loadExtraction();
    }
  }, [doc?.id]); // Only depend on document ID changing

  if (!doc) return (
    <AppLayout>
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Document not found.</div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          title={doc.title || doc.name}
          backHref="/documents"
          backLabel="Back to Documents"
          meta={doc.versionGroupId ? (
            <span>Version {doc.versionNumber || doc.version}{doc.isCurrentVersion ? ' · Current' : ''}</span>
          ) : null}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadContent(doc)}>
                <Download className="h-4 w-4" /> Download
              </Button>
              {hasRoleAtLeast('contentManager') && (
                <>
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => handleDelete(doc.id, removeDocument, router)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                  <Button asChild size="sm" className="gap-2">
                    <Link href={`/documents/${doc.id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
                  </Button>
                </>
              )}
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href={`/chat?docId=${doc.id}`}>Ask about this</Link>
              </Button>
            </div>
          }
          sticky
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* Left stack */}
          <div className="xl:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
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
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Subject</p>
                    <p className="font-medium">{doc.subject || '—'}</p>
                  </div>
                   <div>
                     <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Keywords</p>
                     <p className="font-medium">{(doc.keywords || []).join(', ') || '—'}</p>
                   </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Sender</p>
                    <p className="font-medium">{doc.sender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Receiver</p>
                    <p className="font-medium">{doc.receiver || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Uploaded</p>
                    <p className="font-medium">{formatAppDateTime(doc.uploadedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metadata & Tags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {doc.description && (
                  <div>
                    <h3 className="font-semibold mb-1">AI Summary</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap">{doc.description}</p>
                  </div>
                )}
                {(doc.aiPurpose || (doc.aiKeyPoints && doc.aiKeyPoints.length) || doc.aiContext || doc.aiOutcome) && (
                  <div className="space-y-2">
                    {doc.aiPurpose && <div><span className="font-semibold">Purpose:</span> {doc.aiPurpose}</div>}
                    {doc.aiKeyPoints && doc.aiKeyPoints.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">Key Points</div>
                        <ul className="list-disc pl-5 space-y-1">
                          {doc.aiKeyPoints.map((p, i) => (<li key={i}>{p}</li>))}
                        </ul>
                      </div>
                    )}
                    {doc.aiContext && <div><span className="font-semibold">Context:</span> {doc.aiContext}</div>}
                    {doc.aiOutcome && <div><span className="font-semibold">Outcome/Action:</span> {doc.aiOutcome}</div>}
                  </div>
                )}

                {(doc.keywords && doc.keywords.length > 0) && (
                  <div>
                    <div className="font-semibold mb-1">Keywords</div>
                    <div className="flex flex-wrap gap-2">
                      {doc.keywords.map(k => (<span key={k} className="rounded-md border px-2 py-1 text-xs">{k}</span>))}
                    </div>
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
              <CardHeader>
                <CardTitle>Linked Documents</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                 {/* Versions panel */}
                 {doc.versionGroupId && (documents.filter(d => (d.versionGroupId || (d as any).version_group_id || d.id) === doc.versionGroupId).length > 1) && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Versions</p>
                    <VersionsPanel docId={doc.id} />
                  </div>
                )}
                <LinkedList docId={doc.id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>File Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {doc.filename && (
                  <div className="md:col-span-2 grid grid-cols-4 items-start gap-3">
                    <span className="text-muted-foreground col-span-1">Filename</span>
                    <span className="font-medium col-span-3 break-words">{doc.filename}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{formatAppDateTime(doc.uploadedAt)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{doc.documentType || doc.type}</span></div>
                {doc.fileSizeBytes !== undefined && (
                  <div className="flex justify-between"><span className="text-muted-foreground">File Size</span><span className="font-medium">{formatSize(doc.fileSizeBytes)}</span></div>
                )}
                {doc.mimeType && (
                  <div className="flex justify-between"><span className="text-muted-foreground">MIME Type</span><span className="font-medium">{doc.mimeType}</span></div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
            <Card className="xl:col-span-1 xl:row-span-6">
            <CardHeader>
              <CardTitle>Content Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {doc.content ? (
                <pre className="whitespace-pre-wrap text-sm bg-zinc-900 text-zinc-100 p-4 rounded-md overflow-auto max-h-[80vh]">{doc.content}</pre>
              ) : loadingExtraction ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-4" />))}
                </div>
              ) : ocrText ? (
                <pre className="whitespace-pre-wrap text-sm bg-zinc-900 text-zinc-100 p-4 rounded-md overflow-auto max-h-[80vh]">{ocrText}</pre>
              ) : (
                <div className="space-y-2">
                  <button className="text-xs underline" onClick={async () => {
                    const { orgId } = getApiContext();
                    try {
                      setLoadingExtraction(true);
                      console.log('Manual load - Fetching extraction from:', `/orgs/${orgId}/documents/${doc.id}/extraction`);
                      const data: any = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/extraction`);
                      console.log('Manual load - Extraction response:', data);
                      setOcrText(String(data.ocrText || ''));
                    } catch (error) {
                      console.log('Manual load - Extraction error:', error);
                    }
                    setLoadingExtraction(false);
                  }}>Load extracted text</button>
                  <div className="text-xs text-muted-foreground">No extracted content found in DB. Try loading from extractions Storage if available.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function downloadContent(doc: any) {
  try {
    const blob = new Blob([doc.content || doc.summary || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (doc.filename || doc.name || 'document') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  } catch {}
}

function handleDelete(id: string, removeDocument: (id: string) => void, router: any) {
  removeDocument(id);
  router.push('/documents');
}

function copySummary(doc: any) {
  try {
    const text = doc.summary || doc.aiPurpose || '';
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

  const moveVersion = async (fromVersion: number, toVersion: number, documentId: string) => {
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${documentId}/move-version`, {
        method: 'POST',
        body: { fromVersion, toVersion }
      });
      // Refresh the documents to get updated version numbers
      window.location.reload(); // Simple refresh for now
    } catch (error) {
      console.error('Failed to move version:', error);
    }
  };

  return (
    <div className="space-y-2">
      {versions.map((v: any, index) => (
        <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
          <div className="text-xs">
            <div className="font-medium">v{v.versionNumber || v.version} {v.isCurrentVersion && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">current</span>}</div>
            <div className="text-muted-foreground">{formatAppDateTime(v.uploadedAt)} · {(v.documentType || v.type)}</div>
          </div>
          <div className="flex items-center gap-1">
            {/* Version reordering buttons */}
            {index > 0 && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => moveVersion(v.versionNumber || v.version || 1, (versions[index-1].versionNumber || versions[index-1].version || 1), v.id)}
                title={`Move to v${(versions[index-1].versionNumber || versions[index-1].version || 1)}`}
              >
                ↑
              </Button>
            )}
            {index < versions.length - 1 && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => moveVersion(v.versionNumber || v.version || 1, (versions[index+1].versionNumber || versions[index+1].version || 1), v.id)}
                title={`Move to v${(versions[index+1].versionNumber || versions[index+1].version || 1)}`}
              >
                ↓
              </Button>
            )}
            {!v.isCurrentVersion && (
              <Button size="sm" variant="outline" onClick={() => setCurrentVersion(v.id)}>Set current</Button>
            )}
            <Button size="sm" asChild>
              <Link href={`/documents/${v.id}`}>View</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkedList({ docId }: { docId: string }) {
  const { getDocumentById, documents } = useDocuments();
  const base = getDocumentById(docId)!;
  const ids = base.linkedDocumentIds || [];
  if (ids.length === 0) return <div className="text-sm text-muted-foreground">No related documents linked.</div>;
  
  // Filter to show only current versions of linked documents
  const linkedDocs = ids.map(id => {
    const d = getDocumentById(id);
    if (!d) return null;
    
    // If this document has versions, find the current version
    if (d.versionGroupId) {
      const currentVersion = documents.find(doc => 
        (doc.versionGroupId || (doc as any).version_group_id) === d.versionGroupId && 
        doc.isCurrentVersion
      );
      return currentVersion || d; // fallback to original if no current version found
    }
    
    return d; // return as-is if no version group
  }).filter(Boolean);
  
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Related</p>
      {linkedDocs.map(d => {
        if (!d) return null;
        return (
          <div key={d.id} className="flex items-center justify-between rounded-md border p-2">
            <div className="min-w-0">
              <div className="truncate font-medium" title={d.title || d.name}>{d.title || d.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatAppDateTime(d.uploadedAt)} · {(d.documentType || d.type)}
                {d.versionGroupId && <span className="ml-1">v{d.versionNumber || d.version || 1}</span>}
              </div>
            </div>
            <Button size="sm" asChild>
              <Link href={`/documents/${d.id}`}>View</Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
