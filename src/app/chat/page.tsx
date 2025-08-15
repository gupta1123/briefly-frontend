"use client";

import AppLayout from '@/components/layout/app-layout';
import Chatbot from '@/components/chatbot';
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
      <div className="p-0 md:p-0 h-[calc(100vh-4rem)] flex flex-col">
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
            containerClassName="max-w-6xl"
          />
        <div className="px-4 md:px-6 flex-1">
          <div className="mx-auto max-w-6xl h-full flex flex-col">
          {docId && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mr-2">Scope:</span>
              <Button size="sm" variant={entityScope ? 'outline' : 'default'} onClick={() => setEntityScope('')}>All</Button>
              {[...new Set(selected.flatMap(d => [d.sender, d.receiver].filter(Boolean) as string[]))].slice(0,6).map(e => (
                <Button key={e} size="sm" variant={entityScope === e ? 'default' : 'outline'} onClick={() => setEntityScope(e)}>{e}</Button>
              ))}
            </div>
          )}
          <div className="flex-1 relative">
            {/* Embed the chatbot full-page */}
            <Chatbot documents={selected} embed />
          </div>
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


