"use client";

import AppLayout from '@/components/layout/app-layout';
import Chatbot, { ChatContext } from '@/components/chatbot';
import { ScopePicker } from '@/components/scope-picker';
import { useDocuments } from '@/hooks/use-documents';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, Suspense } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { MessageSquare } from 'lucide-react';

function ChatContent() {
  const { documents } = useDocuments();
  const searchParams = useSearchParams();
  const docId = searchParams?.get('docId') || '';
  const [includeLinked, setIncludeLinked] = useState(true);
  const [entityScope, setEntityScope] = useState('');
  // Streaming removed: always use REST
  const restMode = true;
  const [ctx, setCtx] = useState<ChatContext>({ scope: docId ? 'doc' : 'org', docId: docId || undefined, includeLinked: true, includeVersions: true, includeSubfolders: true });

  const selected = useMemo(() => {
    if (!docId) return documents;
    const base = documents.find(d => d.id === docId);
    if (!base) return documents;
    if (!includeLinked) return [base];
    const groupId = base.versionGroupId || base.id;
    const versions = documents.filter(d => d.versionGroupId === groupId);
    const relatedIds = new Set<string>((base.linkedDocumentIds || []));
    const related = documents.filter(d => relatedIds.has(d.id));
    const set = new Map<string, typeof base>();
    [base, ...versions, ...related].forEach(d => set.set(d.id, d));
    let arr = Array.from(set.values());
    if (entityScope) {
      const s = entityScope.toLowerCase();
      arr = arr.filter(d => (d.sender || '').toLowerCase().includes(s) || (d.receiver || '').toLowerCase().includes(s) || (d.title || d.name).toLowerCase().includes(s));
    }
    return arr;
  }, [documents, docId, includeLinked, entityScope]);
  return (
    <AppLayout>
      <div className="relative h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-b from-background via-background to-background">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-muted/40 to-transparent" />
        <PageHeader
          title="Ask Briefly"
          subtitle={docId && selected[0] ? `Chat about “${selected[0].title || selected[0].name}” or its related documents.` : 'Chat with your documents for instant insights.'}
          meta={docId ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch id="include-linked" checked={includeLinked} onCheckedChange={setIncludeLinked} />
              <label htmlFor="include-linked">Include linked docs (versions + related)</label>
            </div>
          ) : null}
          sticky
          icon={<MessageSquare className="h-5 w-5" />}
          containerClassName=""
        />
        <div className="flex-1 px-3 md:px-6">
          <div className="h-full">
            {/* Scope picker */}
            <div className="mb-3 space-y-3">
              <ScopePicker initialDocId={docId} value={ctx} onChange={(next) => setCtx(next)} />
            </div>
            {docId && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground mr-2">Scope:</span>
                <Button size="sm" variant={entityScope ? 'outline' : 'default'} onClick={() => setEntityScope('')}>All</Button>
                {[...new Set(selected.flatMap(d => [d.sender, d.receiver].filter(Boolean) as string[]))].slice(0,6).map(e => (
                  <Button key={e} size="sm" variant={entityScope === e ? 'default' : 'outline'} onClick={() => setEntityScope(e)}>{e}</Button>
                ))}
              </div>
            )}
            <Chatbot documents={selected} embed context={ctx} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <ChatContent />
    </Suspense>
  );
}
