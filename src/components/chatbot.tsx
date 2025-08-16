"use client";

import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageSquare, Send, Loader, FileText, ExternalLink } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { cn } from '@/lib/utils';
import type { Message, StoredDocument } from '@/lib/types';
import { answerQuestionsAboutDocuments } from '@/ai/flows/answer-questions-about-documents';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Chatbot({ documents, embed = false }: { documents: StoredDocument[]; embed?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const {toast} = useToast();
  const [exportingCsv, setExportingCsv] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [lastFocusDocId, setLastFocusDocId] = useState<string | null>(null);
  const docMap = useMemo(() => {
    const m = new Map<string, StoredDocument>();
    for (const d of documents) m.set(d.id, d);
    return m;
  }, [documents]);

  const scrollToBottom = () => {
    setTimeout(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        }
    }, 100);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();
    
    // Command parsing: /linked filters or /versions <docId>
  const { effectiveDocs, question, exportCsv, exportJson, extractFields, timelineEntity } = parseCommand(input, documents);
    const explicitDocId = identifyExplicitDocMention(input, documents);
    if (explicitDocId) setLastFocusDocId(explicitDocId);

    // Local handler: answer simple "linked docs" queries deterministically when possible
    const maybeLinked = buildLinkedDocsAnswerIfApplicable(input, messages, documents);
    if (maybeLinked) {
      setMessages((prev) => [...prev, maybeLinked]);
      setIsLoading(false);
      scrollToBottom();
      return;
    }

    // Rank top-K docs client-side by simple relevance to the question to reduce noise
    const ranked = rankDocumentsByRelevance(effectiveDocs, question).slice(0, 12);
    // Also materialize linked target docs referenced by ranked docs and by the current focus doc
    const focusIds = inferFocusDocIds(messages, lastFocusDocId || undefined);
    const focusDoc = focusIds.length ? documents.find(d => d.id === focusIds[0]) : undefined;
    const candidateLinkIds = new Set<string>();
    for (const d of ranked) (d.linkedDocumentIds || []).forEach(id => candidateLinkIds.add(id));
    if (focusDoc) (focusDoc.linkedDocumentIds || []).forEach(id => candidateLinkIds.add(id));
    const linkedTargets = Array.from(candidateLinkIds)
      .map(id => documents.find(d => d.id === id))
      .filter(Boolean) as StoredDocument[];
    // Include some extra docs that themselves have links (to improve graph awareness)
    const linkedExtras = effectiveDocs.filter(d => (d.linkedDocumentIds || []).length > 0 && !ranked.some(r => r.id === d.id));
    // Build unique list with cap
    const toSendMap = new Map<string, StoredDocument>();
    for (const d of [...ranked, ...linkedTargets, ...linkedExtras]) if (!toSendMap.has(d.id)) toSendMap.set(d.id, d);
    const toSend = Array.from(toSendMap.values()).slice(0, 24);
    const structuredDocs = toSend.map(d => ({
      id: d.id,
      name: d.name,
      title: d.title,
      sender: d.sender,
      receiver: d.receiver,
      documentDate: d.documentDate,
      documentType: d.documentType || d.type,
      tags: d.tags,
      summary: d.summary,
      content: d.content ?? null,
      relevanceScore: computeRelevanceScore(d, question),
      subject: d.subject,
      aiKeywords: d.aiKeywords,
      linkedDocumentIds: d.linkedDocumentIds,
      isLinkedContextOnly: !ranked.some(r => r.id === d.id),
    }));

    try {
      // If /extract or /timeline, we can produce deterministic content locally
      if (extractFields && extractFields.length > 0) {
        const csv = buildCsvFromDocs(effectiveDocs, extractFields);
        const json = exportJson ? JSON.stringify(projectDocs(effectiveDocs, extractFields), null, 2) : undefined;
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Extracted ${effectiveDocs.length} records.`,
          csv: exportCsv ? csv : undefined,
          citations: undefined,
        };
        if (json) (assistantMessage as any).json = json;
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }
      if (timelineEntity) {
         const lines = effectiveDocs
          .slice()
          .sort((a,b) => new Date(a.documentDate || a.uploadedAt).getTime() - new Date(b.documentDate || b.uploadedAt).getTime())
          .map(d => `- ${d.documentDate || d.uploadedAt.toISOString().slice(0,10)} · ${d.title || d.name} (${d.documentType || d.type})`);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: lines.join('\n') || 'No matching documents.',
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      const response = await answerQuestionsAboutDocuments({
        question,
        documents: structuredDocs,
        conversationHistory: messages.map(m => ({ role: m.role, content: m.content })).slice(-8),
        queryTerms: extractQueryTerms(question),
        focusDocIds: inferFocusDocIds(messages, lastFocusDocId || undefined),
        lastCitedDocIds: extractLastCitedDocIds(messages),
      });
      const citations = (response as any).citations as { docIndex: number; snippet: string }[] | undefined;
      const assistantId = (Date.now() + 1).toString();
      const finalText = sanitizeInlineJson(response.answer);
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        citations: citations?.slice(0, 3).map(c => {
          const doc = structuredDocs[c.docIndex];
          return doc ? {
            docId: doc.id,
            docName: doc.title || doc.name,
            snippet: c.snippet,
          } : null;
        }).filter(Boolean),
        csv: exportCsv ? buildCsvFromDocs(toSend) : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await streamUpdateMessage(setMessages, assistantId, finalText);
      // Update focus doc if not explicitly set this turn
      if (!explicitDocId && assistantMessage.citations && assistantMessage.citations.length > 0) {
        const first = assistantMessage.citations[0].docId;
        if (first) setLastFocusDocId(first);
      }
    } catch (error) {
      console.error("Chatbot AI failed", error);
      toast({
        title: 'Error',
        description: "Sorry, I couldn't get an answer. Please try again.",
        variant: 'destructive',
      });
      const errorMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Sorry, I couldn't get an answer. Please try again." };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };
  
  useEffect(scrollToBottom, [messages]);
  useEffect(() => {
    const enabled = typeof document !== 'undefined' && document.documentElement.getAttribute('data-chat-filters') === '1';
    setShowHints(enabled && input.trim().startsWith('/'));
  }, [input]);


  if (embed) {
    return (
      <div className="flex flex-col h-full rounded-xl border bg-card">
        <header className="p-4 border-b">
          <h3 className="font-semibold text-lg">Briefly Assistant</h3>
          <p className="text-sm text-muted-foreground">Ask anything about your documents.</p>
        </header>
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Try asking: "What was the revenue in Q4 2023?"
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex items-start gap-3',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[min(720px,85%)] w-fit rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <div className="space-y-2">
                        <div>{message.content}</div>
                        {message.role === 'assistant' && renderSourcesAndCitations(message)}
                        {message.role === 'assistant' && message.csv && (
                          <div>
                            <button
                              className="text-xs underline"
                              onClick={() => downloadCsv(message.csv!)}
                            >
                              Download CSV
                            </button>
                          </div>
                        )}
                        {(message as any).json && (
                          <div>
                            <button className="text-xs underline" onClick={() => downloadJson((message as any).json)}>Download JSON</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-3 justify-start">
                        <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
                            <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-xl px-4 py-2 flex items-center">
                            <Loader className="h-4 w-4 animate-spin" />
                        </div>
                    </div>
                )}
          </div>
        </ScrollArea>
        <footer className="p-4 border-t relative">
          {showHints && (
            <SlashHints input={input} docs={documents} onPick={(v) => setInput(v)} />
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="min-h-0 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                }
              }}
            />
            <Button type="submit" size="icon" disabled={isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </footer>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" className="h-14 w-14 rounded-full shadow-lg">
            <MessageSquare className="h-7 w-7" />
            <span className="sr-only">Open Chatbot</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-80 rounded-xl p-0 md:w-96"
        >
          <div className="flex flex-col h-[60vh]">
            <header className="p-4 border-b">
              <h3 className="font-semibold text-lg">Briefly Assistant</h3>
              <p className="text-sm text-muted-foreground">Ask anything about your documents.</p>
            </header>
            <ScrollArea className="flex-1" ref={scrollAreaRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Try asking: "What was the revenue in Q4 2023?"
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex items-start gap-3',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[min(720px,85%)] w-fit rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <div className="space-y-2">
                        <div>{message.content}</div>
                        {message.role === 'assistant' && renderSourcesAndCitations(message)}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-3 justify-start">
                        <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
                            <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-xl px-4 py-2 flex items-center">
                            <Loader className="h-4 w-4 animate-spin" />
                        </div>
                    </div>
                )}
              </div>
            </ScrollArea>
            <footer className="p-4 border-t relative">
              {showHints && (
                <SlashHints input={input} docs={documents} onPick={(v) => setInput(v)} />
              )}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="min-h-0 resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                  }}
                />
                <Button type="submit" size="icon" disabled={isLoading}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </footer>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function parseCommand(raw: string, docs: StoredDocument[]) {
  const text = raw.trim();
  if (!text.startsWith('/')) {
    return { effectiveDocs: docs, question: text, exportCsv: false, exportJson: false };
  }
  const [cmd, ...rest] = text.split(/\s+/);
  const args = rest.join(' ');
  if (cmd === '/folder') {
    // /folder path/to/folder  Then ask a question normally
    const path = rest.join(' ').trim();
    const p = path.split('/').filter(Boolean);
    const filtered = p.length ? docs.filter(d => JSON.stringify(d.folderPath || []) === JSON.stringify(p)) : docs;
    return { effectiveDocs: filtered, question: 'Ask about selected folder', exportCsv: false, exportJson: false };
  }
  if (cmd === '/sender' || cmd === '/receiver') {
    const name = rest.join(' ').trim().toLowerCase();
    const filtered = docs.filter(d => (cmd === '/sender' ? (d.sender || '') : (d.receiver || '')).toLowerCase().includes(name));
    return { effectiveDocs: filtered, question: `Ask about ${cmd === '/sender' ? 'sender' : 'receiver'}: ${name}`, exportCsv: false, exportJson: false };
  }
  if (cmd === '/linked') {
    // Filters: sender:.. receiver:.. type:.. month:YYYY-MM words:"..."
    const sender = extractArg(args, 'sender');
    const receiver = extractArg(args, 'receiver');
    const type = extractArg(args, 'type');
    const month = extractArg(args, 'month'); // YYYY-MM
    const words = extractQuoted(args, 'words');
    let filtered = docs;
    if (sender) filtered = filtered.filter(d => (d.sender || '').toLowerCase().includes(sender));
    if (receiver) filtered = filtered.filter(d => (d.receiver || '').toLowerCase().includes(receiver));
    if (type) filtered = filtered.filter(d => (d.documentType || d.type).toLowerCase().includes(type));
    if (month) filtered = filtered.filter(d => {
      const dateStr = d.documentDate || d.uploadedAt.toISOString();
      return dateStr.startsWith(month);
    });
    if (words) filtered = filtered.filter(d => (d.content || d.summary || '').toLowerCase().includes(words));
    // Remove the command to form the question if user asked something after filters
    const qMatch = args.match(/\]\s*(.*)$/); // support format like [filters] question
    const question = qMatch && qMatch[1] ? qMatch[1] : 'Summarize results with citations';
    const exportCsv = /\bexport:csv\b/i.test(args);
    const exportJson = /\bexport:json\b/i.test(args);
    return { effectiveDocs: filtered, question, exportCsv, exportJson };
  }
  if (cmd === '/extract') {
    // /extract fields:id,name,documentDate,type export:csv
    const fieldsStr = extractArg(rest.join(' '), 'fields');
    const fields = fieldsStr ? fieldsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const exportCsv = /\bexport:csv\b/i.test(args);
    const exportJson = /\bexport:json\b/i.test(args);
    const question = 'Extract fields';
    return { effectiveDocs: docs, question, exportCsv, exportJson, extractFields: fields };
  }
  if (cmd === '/timeline') {
    // /timeline entity:bhagyalaxmi
    const entity = extractArg(args, 'entity');
    const filtered = entity ? docs.filter(d => (d.sender || '').toLowerCase().includes(entity) || (d.receiver || '').toLowerCase().includes(entity) || (d.title || d.name).toLowerCase().includes(entity)) : docs;
    return { effectiveDocs: filtered, question: 'Timeline', exportCsv: false, exportJson: false, timelineEntity: entity };
  }
  return { effectiveDocs: docs, question: text, exportCsv: false, exportJson: false };
}

function renderSourcesAndCitations(message: Message) {
  const hasCitations = !!message.citations && message.citations.length > 0;
  if (!hasCitations) return null;
  // Separate compact inline citations and a distinct Sources panel
  return (
    <div className="mt-3 space-y-2">
      {/* Inline citations list */}
      <div className="text-xs text-muted-foreground space-y-1">
        {message.citations!.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-foreground text-background text-[10px] font-semibold">{i+1}</span>
            <div>
              <span className="font-medium">{c.docName || 'Document'}</span>
              {c.snippet ? <>: {c.snippet}</> : null}
              {c.docId ? (
                <a className="ml-2 underline" href={`/documents/${c.docId}`} onClick={(e) => {
                  // Verify document exists before navigation
                  e.preventDefault();
                  window.location.href = `/documents/${c.docId}`;
                }}>view</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {/* Sources card */}
      <Card className="border-dashed">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-medium tracking-wide uppercase text-muted-foreground">Sources</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {message.citations!.map((c, i) => (
              <a key={i} href={c.docId ? `/documents/${c.docId}` : '#'} 
                className="group block rounded-md border bg-background hover:bg-accent transition-colors"
                onClick={(e) => {
                  if (!c.docId) {
                    e.preventDefault();
                    return;
                  }
                  // Let the navigation proceed normally for valid docIds
                }}>
                <div className="flex items-center gap-2 p-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.docName || 'Document'}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.snippet || 'Referenced in answer'}</div>
                  </div>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function extractArg(args: string, key: string) {
  const re = new RegExp(`${key}:([^\s]+)`, 'i');
  const m = args.match(re);
  return m ? m[1].toLowerCase() : '';
}
function extractQuoted(args: string, key: string) {
  const re = new RegExp(`${key}:"([^"]+)"`, 'i');
  const m = args.match(re);
  return m ? m[1].toLowerCase() : '';
}

function sanitizeInlineJson(text: string): string {
  // Remove accidental inline JSON arrays of citation objects like: [ { "docIndex": 1, ... } ]
  try {
    // Simple regex to strip bracketed JSON-like arrays
    return text.replace(/\[\s*\{[^\]]+\}\s*\]/g, '').replace(/\s{2,}/g, ' ').trim();
  } catch {
    return text;
  }
}

function buildCsvFromDocs(docs: StoredDocument[], fields: string[] = ['id','name','title','sender','receiver','documentDate','documentType','category','tags','summary']): string {
  const headers = fields;
  const rows = docs.map(d => fields.map(f => {
    const v =
      f === 'tags' ? (d.tags || []).join('|') :
      f === 'documentType' ? (d.documentType || d.type) :
      f in d ? (d as any)[f] : '';
    return safe(String(v ?? ''));
  }));
  return [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
}
function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function safe(v: string) { return v.replace(/\s+/g,' ').trim(); }
function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function downloadJson(json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function projectDocs(docs: StoredDocument[], fields: string[]) {
  return docs.map(d => {
    const o: any = {};
    for (const f of fields) {
      if (f === 'documentType') o[f] = d.documentType || d.type; else if (f === 'tags') o[f] = d.tags || []; else o[f] = (d as any)[f];
    }
    return o;
  });
}

function SlashHints({ input, docs, onPick }: { input: string; docs: StoredDocument[]; onPick: (v: string) => void }) {
  const base = input.trim();
  const isFolder = base.startsWith('/folder');
  const isSender = base.startsWith('/sender') || base.startsWith('/receiver');
  // Build context-aware examples from docs in scope
  const recent = docs.slice(0, 5);
  const sampleEntity = recent.find(d => d.sender)?.sender || recent.find(d => d.receiver)?.receiver || 'entity';
  const sampleMonth = (recent.find(d => d.documentDate)?.documentDate || new Date().toISOString().slice(0,7));
  const sampleType = (recent.find(d => d.documentType)?.documentType || recent[0]?.type || 'report').toString().toLowerCase();
  const samplePhrase = (recent.find(d => (d.summary || '').length > 0)?.summary || 'Plot G-8').split(' ').slice(0,2).join(' ');
  // Build folder paths suggestions from docs
  const folderPaths = Array.from(new Set(docs.map(d => (d.folderPath || []).join('/')).filter(Boolean))).slice(0,6);
  const senderList = Array.from(new Set(docs.flatMap(d => [d.sender, d.receiver].filter(Boolean) as string[]))).slice(0,6);
  const items = isFolder
    ? folderPaths.length
      ? folderPaths.map(p => `/folder ${p}`)
      : ['/folder <path>']
    : isSender
    ? senderList.length
      ? senderList.map(s => `${base.startsWith('/receiver') ? '/receiver' : '/sender'} ${s}`)
      : [`${base.startsWith('/receiver') ? '/receiver' : '/sender'} <name>`]
    : [
        '/folder <path>',
        '/sender <name>',
        '/receiver <name>',
      ];
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-10">
      <div className="rounded-md border bg-background shadow p-2 text-xs">
        <div className="text-muted-foreground mb-1">Try:</div>
        <div className="flex flex-col gap-1">
          {items.map((ex, i) => (
            <button key={i} className="text-left hover:underline" onClick={() => onPick(ex)}>{ex}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function rankDocumentsByRelevance(docs: StoredDocument[], query: string): StoredDocument[] {
  const q = query.toLowerCase();
  const score = (d: StoredDocument) => {
    const hay = [
      d.title,
      d.name,
      d.sender,
      d.receiver,
      d.documentType,
      (d.tags || []).join(' '),
      d.summary,
      d.content,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    let s = 0;
    if (!q) return 0;
    // Simple heuristics: term presence, boosts for exact phrase and sender/receiver matches
    const terms = Array.from(new Set(q.split(/\s+/).filter(Boolean)));
    for (const t of terms) {
      if (hay.includes(t)) s += 2;
    }
    if (hay.includes(q)) s += 5;
    if (d.sender && q.includes(d.sender.toLowerCase())) s += 3;
    if (d.receiver && q.includes(d.receiver.toLowerCase())) s += 3;
    // Prefer current versions
    if ((d as any).isCurrentVersion) s += 1;
    return s;
  };
  return docs.slice().sort((a, b) => score(b) - score(a));
}

function computeRelevanceScore(d: StoredDocument, query: string): number {
  const q = query.toLowerCase();
  if (!q) return 0;
  const hay = [
    d.title,
    d.name,
    d.sender,
    d.receiver,
    d.documentType,
    (d.tags || []).join(' '),
    d.summary,
    d.content,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let s = 0;
  const terms = Array.from(new Set(q.split(/\s+/).filter(Boolean)));
  for (const t of terms) {
    if (hay.includes(t)) s += 1;
  }
  if (hay.includes(q)) s += 3;
  if (d.sender && q.includes(d.sender.toLowerCase())) s += 2;
  if (d.receiver && q.includes(d.receiver.toLowerCase())) s += 2;
  if ((d as any).isCurrentVersion) s += 0.5;
  return s;
}

function extractQueryTerms(question: string): string[] {
  const cleaned = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set(['the','a','an','and','or','to','from','for','about','of','in','on','at','with','any','do','we','have','docs','document','documents','letter','letters']);
  return cleaned.split(' ').filter(t => t && !stop.has(t)).slice(0, 10);
}

function buildLinkedDocsAnswerIfApplicable(input: string, history: Message[], docs: StoredDocument[]): Message | null {
  const text = input.toLowerCase();
  const mentionsLinked = /\blinked\b|\brelated\b/.test(text);
  if (!mentionsLinked) return null;

  // Check if this is a general "what linked docs do I have" query
  const isGeneralLinkedQuery = /what.*linked|show.*linked|list.*linked|all.*linked/.test(text) && 
                              !/for|of|in/.test(text); // not asking for specific doc's links

  if (isGeneralLinkedQuery) {
    // Find all documents that have linked documents
    const docsWithLinks = docs.filter(d => (d.linkedDocumentIds || []).length > 0);
    
    if (docsWithLinks.length === 0) {
      return {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `I found ${docs.length} documents in your collection, but none of them currently have linked documents. 

Documents can be linked during upload when they're detected as different versions of the same document, or when they reference each other. You can also manually link documents through the document detail page.

Would you like me to help you find documents that might be related to each other?`
      };
    }

    // Build a comprehensive answer showing all linked document relationships
    const linkPairs: { source: StoredDocument; targets: StoredDocument[] }[] = [];
    
    for (const doc of docsWithLinks) {
      const linkIds = (doc.linkedDocumentIds || []).filter(Boolean);
      const linkedDocs = linkIds
        .map(id => docs.find(d => d.id === id))
        .filter(Boolean) as StoredDocument[];
      
      if (linkedDocs.length > 0) {
        linkPairs.push({ source: doc, targets: linkedDocs });
      }
    }

    if (linkPairs.length === 0) {
      return {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: "I found some documents marked as having links, but couldn't retrieve the linked documents. This might be due to data inconsistency."
      };
    }

    let content = `📎 **Your Linked Documents** (${linkPairs.length} document${linkPairs.length > 1 ? 's' : ''} with links):\n\n`;
    
    for (const { source, targets } of linkPairs) {
      content += `**${source.title || source.name}**\n`;
      if (source.documentType) content += `   *${source.documentType}*\n`;
      content += `   ↳ Linked to:\n`;
      
      for (const target of targets) {
        content += `      • ${target.title || target.name}`;
        if (target.versionNumber) content += ` (v${target.versionNumber})`;
        if (target.documentDate) content += ` · ${target.documentDate}`;
        content += `\n`;
      }
      content += `\n`;
    }

    content += `\n💡 *Tip: Use "/linked" to filter documents, or ask about specific documents to see their relationships.*`;

    return { id: String(Date.now() + 1), role: 'assistant', content };
  }

  // Original behavior for context-specific linked doc queries
  const focusIds = inferFocusDocIds(history);
  const focusId = focusIds[0];
  if (!focusId) return null;
  const focus = docs.find(d => d.id === focusId);
  if (!focus) return null;
  const linkIds = (focus.linkedDocumentIds || []).filter(Boolean);
  if (linkIds.length === 0) return null;
  const linked = linkIds
    .map(id => docs.find(d => d.id === id))
    .filter(Boolean) as StoredDocument[];
  if (linked.length === 0) return null;
  const lines = linked.map(d => `• ${d.title || d.name}${d.documentDate ? ` · ${d.documentDate}` : ''}`);
  const content = `Linked documents for "${focus.title || focus.name}":\n` + lines.join('\n');
  return { id: String(Date.now()+1), role: 'assistant', content };
}

function inferFocusDocIds(history: Message[], docOverride?: string): string[] {
  // Look at the last user message for references like "first", "this", "that", "it"
  const lastUser = [...history].reverse().find(m => m.role === 'user');
  if (!lastUser) return [];
  const txt = lastUser.content.toLowerCase();
  const refs = /(first one|first doc|first document|this|that|it)/.test(txt);
  if (!refs && !docOverride) return [];
  // If the previous assistant message had citations, return their docIds in order
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant' && m.citations && m.citations.length > 0);
  if (docOverride) return [docOverride];
  if (lastAssistant && lastAssistant.citations) {
    return lastAssistant.citations.map(c => c.docId!).filter(Boolean) as string[];
  }
  return [];
}

function extractLastCitedDocIds(history: Message[]): string[] {
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant' && m.citations && m.citations.length > 0);
  if (!lastAssistant || !lastAssistant.citations) return [];
  const ids = lastAssistant.citations.map(c => c.docId!).filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

function identifyExplicitDocMention(input: string, docs: StoredDocument[]): string | null {
  const text = input.toLowerCase();
  // Exact title/name match
  const exact = docs.find(d => (d.title || d.name).toLowerCase() === text.trim());
  if (exact) return exact.id;
  // Title/name without extension
  const normalized = text.replace(/\.[a-z0-9]+$/, '').trim();
  const noExt = docs.find(d => (d.title || d.name).toLowerCase().replace(/\.[a-z0-9]+$/, '') === normalized);
  return noExt ? noExt.id : null;
}

async function streamUpdateMessage(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  id: string,
  text: string
) {
  // Simulated streaming for now: reveal text in chunks
  const chunks = chunkText(text, 60);
  for (const chunk of chunks) {
    await new Promise(r => setTimeout(r, 25));
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: (m.content || '') + chunk } : m)));
  }
}
function chunkText(s: string, size: number) {
  const arr: string[] = [];
  for (let i = 0; i < s.length; i += size) arr.push(s.slice(i, i + size));
  return arr;
}
