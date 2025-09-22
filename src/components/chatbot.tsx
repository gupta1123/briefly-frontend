"use client";

import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageSquare, Send, FileText, ExternalLink, Copy, Check, Calendar, Hash, Building2 } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { cn } from '@/lib/utils';
import { apiFetch, getApiContext } from '@/lib/api';
import type { Message as ChatMessage, StoredDocument } from '@/lib/types';
import { answerQuestionsAboutDocuments } from '@/ai/flows/answer-questions-about-documents';
// Streaming removed; using REST endpoint only
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit
} from '@/components/ai-elements/prompt-input';
import {
  Message,
  MessageContent,
  MessageAvatar,
} from '@/components/ai-elements/message';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem
} from '@/components/ai-elements/task';
import { Tool } from '@/components/ai-elements/tool';
import { LinkedDocuments, convertToLinkedDocumentItem } from '@/components/ai-elements/linked-documents';
import { MetaList } from '@/components/ai-elements/meta-list';
import { Preview } from '@/components/ai-elements/preview';
import { Badge } from '@/components/ui/badge';

export type ChatContext = {
  scope: 'org' | 'folder' | 'doc';
  docId?: string;
  folderPath?: string[];
  includeSubfolders?: boolean;
  includeLinked?: boolean;
  includeVersions?: boolean;
};

export default function Chatbot({
  documents,
  embed = false,
  context,
}: {
  documents: StoredDocument[];
  embed?: boolean;
  context?: ChatContext;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [processingTasks, setProcessingTasks] = useState<{id: string, title: string, items: string[]}[]>([]);
  const [strictMode, setStrictMode] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const {toast} = useToast();
  const [exportingCsv, setExportingCsv] = useState(false);
  const [showHints, setShowHints] = useState(false);
  // Per-message agent info helper
  type AgentInfo = { mode?: string; stages: string[] };
  const upsertAgentInfo = (assistantId: string, updater: (prev: AgentInfo) => AgentInfo) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== assistantId) return m;
      const agent = (m as any).agent as AgentInfo | undefined;
      const next = updater(agent || { stages: [] });
      return { ...(m as any), agent: next } as any;
    }));
  };

  const copyToClipboard = (text: string, messageId: string) => {
    try {
      navigator.clipboard.writeText(text || '');
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text || '';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const runAbort = useRef<AbortController | null>(null);
  const cancelRequested = useRef<boolean>(false);
  const [lastFocusDocId, setLastFocusDocId] = useState<string | null>(null);
  const lastListDocIdsRef = useRef<string[]>([]);
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

  const renderSourcesAndCitations = (message: ChatMessage) => {
    const hasCitations = !!message.citations && message.citations.length > 0;
    if (!hasCitations) return null;
    
    return (
      <div className="mt-4 space-y-3">
        {message.citations!.map((c, i) => {
          // Find the document to get metadata
          const doc = documents.find(d => d.id === c.docId);
          
          return (
            <Card key={i} className="border border-border/70 bg-card shadow-sm">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={c.docId ? `/documents/${c.docId}` : '#'}
                      className="line-clamp-2 break-words text-base font-semibold hover:underline hover:decoration-foreground hover:underline-offset-[3px] text-foreground"
                      onClick={(e) => {
                        if (!c.docId) {
                          e.preventDefault();
                          return;
                        }
                      }}
                    >
                      {c.docName || 'Document'}
                    </a>
                    {c.snippet && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c.page ? <span className="mr-2 font-medium">Page {c.page}:</span> : null}
                        {c.snippet}
                      </p>
                    )}
                    
                    {/* Metadata tags */}
                    {doc && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {doc.sender && (
                          <Badge variant="secondary" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            {doc.sender}
                          </Badge>
                        )}
                        {doc.documentDate && (
                          <Badge variant="secondary" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            {doc.documentDate}
                          </Badge>
                        )}
                        {doc.documentType && (
                          <Badge variant="secondary" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {doc.documentType}
                          </Badge>
                        )}
                        {doc.type && (
                          <Badge variant="secondary" className="text-xs">
                            {doc.type}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Action icon */}
                  <button
                    title="Open"
                    onClick={() => c.docId && window.open(`/documents/${c.docId}`, '_blank')}
                    className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">Open</span>
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    cancelRequested.current = false;
    try { runAbort.current?.abort(); } catch {}
    runAbort.current = new AbortController();
    scrollToBottom();
    // Command parsing: /linked filters or /versions <docId>
    const { effectiveDocs, question, exportCsv, exportJson, extractFields, timelineEntity } = parseCommand(input, documents);
    const explicitDocId = identifyExplicitDocMention(input, documents);
    if (explicitDocId) setLastFocusDocId(explicitDocId);

    // Unified REST call (streaming removed)
    try {
      const { orgId } = getApiContext();
      if (!orgId) throw new Error('No organization');
      const assistantId = (Date.now() + 1).toString();
      const placeholder: ChatMessage = { id: assistantId, role: 'assistant', content: '' };
      setMessages((prev) => [...prev, placeholder]);
      const conv = messages.slice(-15).map(m => ({ role: m.role, content: m.content, citations: m.citations }));
      const memory = {
        focusDocIds: inferFocusDocIds(messages, lastFocusDocId || undefined),
        lastCitedDocIds: extractLastCitedDocIds(messages),
        lastListDocIds: lastListDocIdsRef.current,
      };
      const body: any = { question, conversation: conv, memory, strictCitations: strictMode };
      if (context) body.context = context;
      const res = await apiFetch<any>(`/orgs/${orgId}/chat/query`, { method: 'POST', body, signal: runAbort.current?.signal });
      const answerText = String(res?.answer || '').trim();
      const citations = Array.isArray(res?.citations) ? res.citations : [];
      try {
        const ids = Array.isArray((res as any)?.considered?.docIds) ? (res as any).considered.docIds : [];
        if (ids.length > 0) lastListDocIdsRef.current = ids.filter(Boolean);
      } catch {}
      setIsLoading(false);
      await streamUpdateMessage(setMessages, assistantId, answerText || '');
      // attach metrics if present
      setMessages(prev => prev.map(m => m.id === assistantId ? ({ ...m, coverage: res?.coverage, confidence: res?.confidence }) as any : m));
      if (citations.length > 0) {
        setMessages(prev => prev.map(m => m.id === assistantId ? ({ ...m, citations }) as any : m));
      }
      if (!explicitDocId && citations.length > 0) {
        const first = citations[0]?.docId;
        if (first) setLastFocusDocId(first);
      }
      return;
    } catch (err) {
      console.error('REST chat failed', err);
      setIsLoading(false);
      const errorMessage: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Sorry, I couldn't get an answer. Please try again." };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Rank top-K docs client-side by simple relevance to the question to reduce noise (fallback)
    const semanticSnippets = new Map<string, string[]>();
    const semanticDocs: StoredDocument[] = [];
    const rankedFallback = rankDocumentsByRelevance(effectiveDocs, question).slice(0, 12);
    // Also materialize linked target docs referenced by ranked docs and by the current focus doc
    const focusIds = inferFocusDocIds(messages, lastFocusDocId || undefined);
    const focusDoc = focusIds.length ? documents.find(d => d.id === focusIds[0]) : undefined;
    const baseList = semanticDocs.length ? semanticDocs : rankedFallback;
    const candidateLinkIds = new Set<string>();
    for (const d of baseList) (d.linkedDocumentIds || []).forEach(id => candidateLinkIds.add(id));
    if (focusDoc) (focusDoc.linkedDocumentIds || []).forEach(id => candidateLinkIds.add(id));
    const linkedTargets = Array.from(candidateLinkIds)
      .map(id => documents.find(d => d.id === id))
      .filter(Boolean) as StoredDocument[];
    // Include some extra docs that themselves have links (to improve graph awareness)
    const linkedExtras = effectiveDocs.filter(d => (d.linkedDocumentIds || []).length > 0 && !baseList.some(r => r.id === d.id));
    // Build unique list with cap
    const toSendMap = new Map<string, StoredDocument>();
    for (const d of [...baseList, ...linkedTargets, ...linkedExtras]) if (!toSendMap.has(d.id)) toSendMap.set(d.id, d);
    const toSend = Array.from(toSendMap.values()).slice(0, 24);

    // If user asks for the exact line/quote, fetch full OCR text for the primary focus doc to increase recall
    const wantsExact = /\b(exact line|exact sentence|exact quote|verbatim|quote this|give exact)\b/i.test(question);
    let extractionDocId: string | null = null;
    let extractionText: string | null = null;
    if (wantsExact) {
      try {
        const { orgId } = getApiContext();
        const focusIds = inferFocusDocIds(messages, lastFocusDocId || undefined);
        const preferredId = explicitDocId || focusIds[0] || (baseList[0]?.id || null);
        if (orgId && preferredId) {
          extractionDocId = preferredId;
        const res = await apiFetch<{ ocrText?: string }>(`/orgs/${orgId}/documents/${preferredId}/extraction`, { signal: runAbort.current?.signal });
        extractionText = (res?.ocrText || '').trim() || null;
      }
    } catch {
        // best-effort; ignore errors
      }
    }
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
      // Prefer semantic snippets; for exact-line requests, provide full OCR text for the focused doc if available
      content: extractionText && extractionDocId === d.id
        ? extractionText
        : (semanticSnippets.get(d.id)?.join('\n---\n') || d.content) ?? null,
      relevanceScore: computeRelevanceScore(d, question),
      subject: d.subject,
      aiKeywords: d.aiKeywords,
      linkedDocumentIds: d.linkedDocumentIds,
      isLinkedContextOnly: !baseList.some(r => r.id === d.id),
    }));

    try {
      // If /extract or /timeline, we can produce deterministic content locally
      if (extractFields && extractFields.length > 0) {
        const csv = buildCsvFromDocs(effectiveDocs, extractFields);
        const json = exportJson ? JSON.stringify(projectDocs(effectiveDocs, extractFields), null, 2) : undefined;
              const assistantMessage: ChatMessage = {
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
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: lines.join('\n') || 'No matching documents.',
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      if (cancelRequested.current) throw new Error('canceled');
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
              const assistantMessage: ChatMessage = {
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
          }).filter((c): c is NonNullable<typeof c> => c !== null),
          csv: exportCsv ? buildCsvFromDocs(toSend) : undefined,
                linkedDocuments: undefined, // Will be set by buildLinkedDocsAnswerIfApplicable if applicable
                metadata: undefined, // Will be set by buildMetadataAnswer if applicable
                preview: undefined, // Will be set by buildPreviewAnswer if applicable
        };
      if (!cancelRequested.current) {
        setMessages((prev) => [...prev, assistantMessage]);
        await streamUpdateMessage(setMessages, assistantId, finalText);
      }
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
      const errorMessage: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Sorry, I couldn't get an answer. Please try again." };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const handleStop = () => {
    cancelRequested.current = true;
    try { runAbort.current?.abort(); } catch {}
    setIsLoading(false);
  };
  
  useEffect(scrollToBottom, [messages]);
  useEffect(() => {
    const enabled = typeof document !== 'undefined' && document.documentElement.getAttribute('data-chat-filters') === '1';
    setShowHints(enabled && input.trim().startsWith('/'));
  }, [input]);


  if (embed) {
    return (
      <div className="relative flex h-full flex-col">
        <Conversation className="w-full">
          <ConversationContent className="space-y-1 px-0 py-4">
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                {message.role === 'assistant' ? (
                  <MessageAvatar src="" name="BF" className="ring-0" />
                ) : null}
                <div className="relative">
                  <MessageContent className="text-[15px] leading-7 break-words overflow-wrap-anywhere">
                    {message.role === 'assistant' ? (
                      <div className="space-y-4">
                        {(message as any).agent && (
                          <div className="text-xs text-muted-foreground">
                            {((message as any).agent?.mode) ? <div>Mode: {(message as any).agent.mode}</div> : null}
                            {((message as any).agentType) ? <div>Agent: {(message as any).agentType} ({(message as any).agentName})</div> : null}
                            {((message as any).agent?.stages || []).map((s: string, i: number) => (<div key={i}>• {s}</div>))}
                          </div>
                        )}
                        {/* Main response content */}
                      <div>
                          {message.content ? <Response>{message.content}</Response> : <Loader>Thinking...</Loader>}
                        </div>
                        
                        {/* Citations and sources */}
                        {renderSourcesAndCitations(message)}
                        
                        {/* Linked Documents */}
                        {message.linkedDocuments && message.linkedDocuments.length > 0 && (
                          <LinkedDocuments 
                            items={message.linkedDocuments.map(doc => convertToLinkedDocumentItem(doc))}
                            moreCount={0}
                          />
                        )}
                        
                        {/* Metadata */}
                        {message.metadata && (
                          <MetaList 
                            subject={message.metadata.subject}
                            name={message.metadata.name}
                            sender={message.metadata.sender}
                            receiver={message.metadata.receiver}
                            date={message.metadata.date}
                            reference={message.metadata.reference}
                            documentType={message.metadata.documentType}
                            category={message.metadata.category}
                            filename={message.metadata.filename}
                          />
                        )}
                        
                        {/* Document Preview */}
                        {message.preview && (
                          <div className="mt-4 p-3 rounded-lg border border-border/30 bg-muted/20">
                            <div className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              Document Preview
                            </div>
                            <div className="mb-2">
                              <a
                                href={message.preview.url || `/documents/${message.preview.docId}`}
                                className="text-sm font-medium text-foreground hover:underline hover:decoration-foreground hover:underline-offset-[3px]"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {message.preview.title || message.preview.docName}
                              </a>
                            </div>
                            <Preview lines={message.preview.lines} maxLines={3} />
                          </div>
                        )}
                        
                        {/* Data export options */}
                        {(message.csv || (message as any).json) && (
                          <div className="pt-2 border-t border-border/20">
                            <div className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70 mb-2">Export Options</div>
                            <div className="flex items-center gap-2">
                        {message.csv && (
                            <button
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-colors"
                              onClick={() => downloadCsv(message.csv!)}
                            >
                                  <FileText className="h-3 w-3" />
                              Download CSV
                            </button>
                        )}
                        {(message as any).json && (
                                <button 
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-colors"
                                  onClick={() => downloadJson((message as any).json)}
                                >
                                  <FileText className="h-3 w-3" />
                                  Download JSON
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-[15px] leading-relaxed prose-p:my-0 prose-p:leading-relaxed break-words overflow-wrap-anywhere">
                        {message.content}
                      </div>
                    )}
                  </MessageContent>
                </div>
                  {message.role === 'assistant' && (
                  <div className="self-start ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 active:scale-95"
                      onClick={() => copyToClipboard(message.content, message.id)}
                      title="Copy message"
                    >
                      {copiedMessageId === message.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                {message.role === 'user' ? (
                  <MessageAvatar src="" name="You" className="ring-0" />
                ) : null}
              </Message>
            ))}
            {processingTasks.map((task) => (
              <Task key={task.id} className="w-full">
                <TaskTrigger title={task.title} />
                <TaskContent>
                  {task.items.map((item, index) => (
                    <TaskItem key={index}>{item}</TaskItem>
                  ))}
                </TaskContent>
              </Task>
            ))}
            {isLoading && (
              <Message from="assistant" className="justify-start">
                <MessageAvatar src="" name="BF" className="ring-0" />
                <MessageContent>
                  <Loader>Thinking...</Loader>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton className="shadow" />
        </Conversation>

        <div className="pointer-events-none sticky bottom-0 z-10 w-full bg-gradient-to-t from-background to-transparent pb-4 pt-8">
          {showHints && (
            <div className="pointer-events-auto px-3 pb-2">
              <SlashHints input={input} docs={documents} onPick={(v) => setInput(v)} />
            </div>
          )}
          <div className="pointer-events-auto px-3">
            <PromptInput onSubmit={handleSubmit} className="rounded-2xl border bg-background shadow-md">
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your documents..."
                minHeight={52}
                maxHeight={160}
              />
              <PromptInputToolbar>
                <PromptInputTools>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={strictMode} onChange={(e)=>setStrictMode(e.target.checked)} />
                      Strict citations
                    </label>
                  </div>
                </PromptInputTools>
                {isLoading ? (
                  <Button variant="outline" size="sm" onClick={handleStop}>
                    Stop
                  </Button>
                ) : (
                  <PromptInputSubmit status={isLoading ? 'submitted' : 'ready'} disabled={!input.trim()} />
                )}
              </PromptInputToolbar>
            </PromptInput>
            <p className="mt-2 px-1 text-center text-xs text-muted-foreground">Briefly can make mistakes. Check important information.</p>
          </div>
        </div>
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
          <div className="flex flex-col max-h-[70vh] h-full min-h-[400px]">
            <header className="p-4 border-b">
              <h3 className="font-semibold text-lg">Briefly Assistant</h3>
              <p className="text-sm text-muted-foreground">Ask anything about your documents.</p>
            </header>
            <ScrollArea className="flex-1 overflow-hidden" ref={scrollAreaRef}>
              <div className="p-4 space-y-1">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Try asking: "What was the revenue in Q4 2023?"
                  </div>
                )}
                {messages.map((message) => (
                  <Message from={message.role} key={message.id}>
                    <MessageContent className="break-words overflow-wrap-anywhere">
                      {message.role === 'assistant' ? (
                        <div className="space-y-4">
                          {(message as any).agent && (
                            <div className="mb-4">
                              <Task className="w-full">
                                <TaskTrigger title={`AI Agent${(message as any).agent?.mode ? ` - ${(message as any).agent.mode}` : ''}`} />
                                <TaskContent>
                                  {(message as any).agent?.stages?.map((stage: string, i: number) => (
                                    <TaskItem key={i}>
                                      {stage}
                                    </TaskItem>
                                  )) || (
                                    <TaskItem>Initializing...</TaskItem>
                                  )}
                                </TaskContent>
                              </Task>
                            </div>
                          )}
                          {/* Main response content */}
                        <div>
                            {message.content ? <Response>{message.content}</Response> : <Loader>Thinking...</Loader>}
                          </div>
                          
                          {/* Citations and sources */}
                          {renderSourcesAndCitations(message)}
                          
                          {/* Linked Documents */}
                          {message.linkedDocuments && message.linkedDocuments.length > 0 && (
                            <LinkedDocuments 
                              items={message.linkedDocuments.map(doc => convertToLinkedDocumentItem(doc))}
                              moreCount={0}
                            />
                          )}
                          
                          {/* Metadata */}
                          {message.metadata && (
                            <MetaList 
                              subject={message.metadata.subject}
                              name={message.metadata.name}
                              sender={message.metadata.sender}
                              receiver={message.metadata.receiver}
                              date={message.metadata.date}
                              reference={message.metadata.reference}
                              documentType={message.metadata.documentType}
                              category={message.metadata.category}
                              filename={message.metadata.filename}
                            />
                          )}
                          
                          {/* Document Preview */}
                          {message.preview && (
                            <div className="mt-4 p-3 rounded-lg border border-border/30 bg-muted/20">
                              <div className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                Document Preview
                              </div>
                              <div className="mb-2">
                                <a
                                  href={message.preview.url || `/documents/${message.preview.docId}`}
                                  className="text-sm font-medium text-foreground hover:underline hover:decoration-foreground hover:underline-offset-[3px]"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {message.preview.title || message.preview.docName}
                                </a>
                              </div>
                              <Preview lines={message.preview.lines} maxLines={3} />
                            </div>
                          )}
                        </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-[15px] leading-relaxed prose-p:my-0 prose-p:leading-relaxed break-words overflow-wrap-anywhere">
                        {message.content}
                        {typeof (message as any).coverage === 'number' || typeof (message as any).confidence === 'number' ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            {typeof (message as any).coverage === 'number' ? (<span className="mr-3">Coverage: {Math.round(((message as any).coverage||0)*100)}%</span>) : null}
                            {typeof (message as any).confidence === 'number' ? (<span>Confidence: {Math.round(((message as any).confidence||0)*100)}%</span>) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                    </MessageContent>
                    {message.role === 'assistant' && (
                      <div className="self-start ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 active:scale-95"
                          onClick={() => copyToClipboard(message.content, message.id)}
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </Message>
                ))}
                {processingTasks.map((task) => (
                  <Task key={task.id} className="w-full">
                    <TaskTrigger title={task.title} />
                    <TaskContent>
                      {task.items.map((item, index) => (
                        <TaskItem key={index}>
                          {item}
                        </TaskItem>
                      ))}
                    </TaskContent>
                  </Task>
                ))}
                {/* No separate loading bubble; placeholder assistant bubble shows loader */}
              </div>
            </ScrollArea>
            <footer className="border-t relative">
              {showHints && (
                <div className="p-4">
                  <SlashHints input={input} docs={documents} onPick={(v) => setInput(v)} />
                </div>
              )}
              <PromptInput onSubmit={handleSubmit} className="rounded-none border-x-0 border-b-0">
                <PromptInputTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your documents..."
                  minHeight={48}
                  maxHeight={120}
                />
                              <PromptInputToolbar>
                <PromptInputTools>
                  {/* Try a doc button removed */}
                </PromptInputTools>
                <PromptInputSubmit
                  status={isLoading ? 'submitted' : 'ready'}
                  disabled={!input.trim()}
                />
              </PromptInputToolbar>
              </PromptInput>
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
  // Remove accidental inline JSON arrays of citation objects like: [{"docIndex":1,...}]
  try {
    return text
      .replace(/\[\s*\{[^\]]*?docIndex\s*:\s*\d+[^\]]*?\}\s*\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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

async function buildLinkedDocsAnswerIfApplicable(input: string, history: ChatMessage[], docs: StoredDocument[]): Promise<ChatMessage | null> {
  const text = input.toLowerCase();
  const mentionsLinked = /(\blinked\b|\brelated\b|linked\s+(docs?|documents?))/i.test(text);
  if (!mentionsLinked) return null;

  // Check if this is a general "what linked docs do I have" query
  const hasPronounRef = /(to|for|about)?\s*(it|this|that)\b/.test(text);
  const isGeneralLinkedQuery = !hasPronounRef && /(what|show|list|any|all).*linked/.test(text) && 
                              !/for\b|of\b|in\b/.test(text); // not asking for specific doc's links

  if (isGeneralLinkedQuery) {
    // Find explicit links
    const docsWithLinks = docs.filter(d => (d.linkedDocumentIds || []).length > 0);
    // Find version groups
    const groupMap = new Map<string, StoredDocument[]>();
    for (const d of docs) {
      const gid = (d as any).versionGroupId || (d as any).version_group_id || null;
      if (!gid) continue;
      if (!groupMap.has(gid)) groupMap.set(gid, []);
      groupMap.get(gid)!.push(d);
    }
    const versionGroups = Array.from(groupMap.values()).filter(arr => arr.length > 1);

    if (docsWithLinks.length === 0 && versionGroups.length === 0) {
      return {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `I scanned ${docs.length} documents and did not find linked pairs or version groups yet. You can link related docs on their detail pages; versions are linked automatically when uploaded as versions.`
      };
    }

    // Build a comprehensive answer showing linked pairs and version groups
    const linkPairs: { source: StoredDocument; targets: StoredDocument[] }[] = [];
    
    for (const doc of docsWithLinks) {
        const targets = (doc.linkedDocumentIds || []).map(id => docs.find(d => d.id === id)).filter(Boolean) as StoredDocument[];
        if (targets.length > 0) {
          linkPairs.push({ source: doc, targets });
        }
      }

      let content = `I found **${docsWithLinks.length} documents with links** and **${versionGroups.length} version groups**.\n\n`;
      
    if (versionGroups.length > 0) {
        content += `**Version Groups:**\n`;
        for (const group of versionGroups.slice(0, 3)) {
          const names = group.map(d => `${d.title || d.name}${d.isCurrentVersion ? ' (current)' : ''}`);
          content += `• ${names.join(' → ')}\n`;
        }
        if (versionGroups.length > 3) {
          content += `• ... and ${versionGroups.length - 3} more groups\n`;
        }
      }

      // Return a special message structure for linked documents
      return { 
        id: String(Date.now() + 1), 
        role: 'assistant', 
        content,
        linkedDocuments: linkPairs.flatMap(pair => [pair.source, ...pair.targets]).filter((doc, index, arr) => 
          arr.findIndex(d => d.id === doc.id) === index
        ) // Remove duplicates
      };
  }

  // Original behavior for context-specific linked doc queries
  const focusIds = inferFocusDocIds(history);
  const focusId = focusIds[0];
  if (!focusId) return null;
  const focus = docs.find(d => d.id === focusId);
  if (!focus) return null;
  // Try backend relationships API first (includes versions + incoming/outgoing)
  try {
    const { orgId } = getApiContext();
    if (orgId) {
      const rel = await apiFetch<any>(`/orgs/${orgId}/documents/${focus.id}/relationships`);
      const linesApi: string[] = [];
      if (Array.isArray(rel.versions) && rel.versions.length > 0) {
        linesApi.push('🔁 Versions:');
        for (const v of rel.versions) linesApi.push(`• v${v.versionNumber}${v.isCurrentVersion ? '*' : ''} — ${v.title || 'Untitled'}`);
      }
      if (Array.isArray(rel.outgoing) && rel.outgoing.length > 0) {
        linesApi.push('📎 Links from this document:');
        for (const l of rel.outgoing) linesApi.push(`• ${l.title}${l.linkType ? ` (${l.linkType})` : ''}`);
      }
      if (Array.isArray(rel.incoming) && rel.incoming.length > 0) {
        linesApi.push('📎 Links to this document:');
        for (const l of rel.incoming) linesApi.push(`• ${l.title}${l.linkType ? ` (${l.linkType})` : ''}`);
      }
      if (linesApi.length > 0) {
        const content = `Relationships for "${focus.title || focus.name}":\n` + linesApi.join('\n');
        return { id: String(Date.now()+1), role: 'assistant', content };
      }
    }
  } catch {}

  const linkIds = (focus.linkedDocumentIds || []).filter(Boolean);
  const linked = linkIds.map(id => docs.find(d => d.id === id)).filter(Boolean) as StoredDocument[];
  const versions = docs.filter(d => ((d as any).versionGroupId || (d as any).version_group_id) && ((d as any).versionGroupId || (d as any).version_group_id) === ((focus as any).versionGroupId || (focus as any).version_group_id) && d.id !== focus.id);
  if (linked.length === 0 && versions.length === 0) return null;
  const lines: string[] = [];
  if (versions.length > 0) {
    const sorted = versions.slice().sort((a,b) => (a.versionNumber || 0) - (b.versionNumber || 0));
    lines.push('🔁 Versions:');
    for (const v of sorted) lines.push(`• v${v.versionNumber || 1}${v.isCurrentVersion ? '*' : ''} — ${v.title || v.name}`);
  }
  if (linked.length > 0) {
    lines.push('📎 Linked documents:');
    for (const d of linked) lines.push(`• ${d.title || d.name}${d.documentDate ? ` · ${d.documentDate}` : ''}`);
  }
  const content = `Relationships for "${focus.title || focus.name}":\n` + lines.join('\n');
  return { id: String(Date.now()+1), role: 'assistant', content };
}

function inferFocusDocIds(history: ChatMessage[], docOverride?: string): string[] {
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

function extractLastCitedDocIds(history: ChatMessage[]): string[] {
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
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
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

async function buildPreviewAnswer(input: string, history: ChatMessage[], docs: StoredDocument[], semanticSnippets?: Map<string, string[]>): Promise<ChatMessage | null> {
  const text = input.toLowerCase();
  
  // Check if this is a preview query
  const isPreviewQuery = /(first line|first sentence|first paragraph|show content|preview|content|lines|text|quote|exact)/i.test(text);
  if (!isPreviewQuery) return null;

  // Check if user is asking about a specific document
  const focusIds = inferFocusDocIds(history);
  const focusId = focusIds[0];
  
  if (!focusId) {
    // General preview query without specific document
    return {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: 'I can show you document content. Please ask about a specific document or use commands like "/preview <docId>" to see content.',
      preview: undefined
    };
  }

  const focus = docs.find(d => d.id === focusId);
  if (!focus) return null;

  // Check if document has content - try multiple content fields
  let documentContent = focus.content || focus.summary || (focus as any).ocrText || (focus as any).extractedText;
  
  // If no content in document, try to get it from semantic search results
  if (!documentContent) {
    // Try to get content from the current semantic search results
    const currentSemanticSnippets = semanticSnippets?.get(focus.id);
    if (currentSemanticSnippets && currentSemanticSnippets.length > 0) {
      documentContent = currentSemanticSnippets.join('\n');
    }
  }
  
  if (!documentContent) {
    return {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: `I don't have content for "${focus.title || focus.name}". The document may not have been processed for content extraction yet.`,
      preview: undefined
    };
  }

  // Extract content lines
  const contentLines = documentContent
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .slice(0, 10); // Get first 10 non-empty lines

  if (contentLines.length === 0) {
    return {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: `The document "${focus.title || focus.name}" appears to be empty or contains no readable content.`,
      preview: undefined
    };
  }

  return {
    id: String(Date.now() + 1),
    role: 'assistant',
    content: `Here's the content from "${focus.title || focus.name}":`,
    preview: {
      docId: focus.id,
      docName: focus.title || focus.name,
      lines: contentLines,
      title: focus.title || focus.name,
      url: `/documents/${focus.id}`
    }
  };
}

async function buildMetadataAnswer(input: string, history: ChatMessage[], docs: StoredDocument[]): Promise<ChatMessage | null> {
  const text = input.toLowerCase();
  
  // Check if this is a metadata query
  const isMetadataQuery = /(sender|receiver|subject|filename|name|date|reference|type|category|metadata|details|header|info)/i.test(text);
  if (!isMetadataQuery) return null;

  // Check if user is asking about a specific document
  const focusIds = inferFocusDocIds(history);
  const focusId = focusIds[0];
  
  if (!focusId) {
    // General metadata query without specific document
    return {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: 'I can show you metadata for documents. Please ask about a specific document or use commands like "/sender <name>" to filter by sender.',
      metadata: undefined
    };
  }

  const focus = docs.find(d => d.id === focusId);
  if (!focus) return null;

  // Extract available metadata
  const metadata = {
    subject: focus.subject,
    name: focus.name,
    sender: focus.sender,
    receiver: focus.receiver,
    date: focus.documentDate,
    reference: (focus as any).referenceNo,
    documentType: focus.documentType || focus.type,
    category: focus.category,
    filename: focus.filename
  };

  // Check if any metadata exists
  const hasMetadata = Object.values(metadata).some(v => v);
  if (!hasMetadata) {
    return {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: `I don't have detailed metadata for "${focus.title || focus.name}". The document may not have been processed for metadata extraction yet.`,
      metadata: undefined
    };
  }

  return {
    id: String(Date.now() + 1),
    role: 'assistant',
    content: `Here are the document details for "${focus.title || focus.name}":`,
    metadata
  };
}



// suggestions intentionally removed (minimal headerless chat)
