"use client";

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { apiFetch, getApiContext } from '@/lib/api';
import { ScopePicker } from '@/components/scope-picker';
import { SimplePicker } from '@/components/pickers/simple-picker';
import type { ChatContext as PickerContext } from '@/components/scope-picker';
import { Response } from '@/components/ai-elements/response';

export default function TestAgentPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; type?: string; id?: string }[]>([
    { id: 'initial_msg', role: 'assistant', content: "Hello! I'm the Briefly Agent interface." }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [ctx, setCtx] = useState<PickerContext>({ scope: 'org', includeSubfolders: true, includeLinked: false, includeVersions: true });
  const [pickerOpen, setPickerOpen] = useState<null | 'folder' | 'doc'>(null);
  const { toast } = useToast();
  // Track last listed document IDs from previous assistant message (for referential follow-ups)
  const lastListDocIdsRef = useRef<string[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    // Add user message to the chat immediately
    const userMessageId = 'user_' + Date.now().toString();
    const userMessage = { id: userMessageId, role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    
    // Clear the input and set loading state
    setQuestion('');
    setIsLoading(true);

    try {
      const { orgId } = getApiContext();
      if (!orgId) throw new Error('No organization selected');

      // REST-only endpoint
      const endpoint = '/chat/query';
        
        // Add placeholder assistant message
        const assistantId = 'assistant_' + Date.now().toString();
        const placeholder = { id: assistantId, role: 'assistant', content: '' };
        setMessages(prev => [...prev, placeholder]);

        // Make REST API call
      const response = await apiFetch(`/orgs/${orgId}${endpoint}`, {
        method: 'POST',
        body: {
          question,
          conversation: messages.filter(m => m.id !== assistantId).slice(-15).map(m => ({ role: m.role, content: m.content, citations: (m as any).citations })),
          memory: {
            lastListDocIds: lastListDocIdsRef.current
          },
          context: ctx
        }
      });

        console.log('Raw REST API response:', response);
        console.log('Response type:', typeof response);
        console.log('Response constructor:', response?.constructor?.name);
        
        // Handle case where response might be a JSON string that wasn't parsed
        let parsedResponse = response;
        if (typeof response === 'string') {
          try {
            parsedResponse = JSON.parse(response);
            console.log('Parsed response:', parsedResponse);
          } catch (e) {
            console.log('Failed to parse response as JSON:', e);
          }
        }
        
        // Update the message with the response (supports tool planner payload)
        setMessages(prev => prev.map(m => {
          if (m.id === assistantId) {
            // Handle the response structure from the backend
            let content = 'No response received';
            let citations: any[] = [];
            let agentLine = '';
            
            // Process the response based on its structure
            const responseData = parsedResponse || response;
            if (responseData) {
              // If response has an answer field (string)
              if (typeof responseData.answer === 'string' && responseData.answer.trim() !== '') {
                content = responseData.answer;
              } 
              // If response has a content field (string)
              else if (typeof responseData.content === 'string' && responseData.content.trim() !== '') {
                content = responseData.content;
              }
              // If response is a string itself and not JSON
              else if (typeof responseData === 'string' && responseData.trim() !== '') {
                content = responseData;
              }
              // If we have citations but no direct answer, generate a brief summary
              else if (Array.isArray(responseData.citations) && responseData.citations.length > 0) {
                const docCount = responseData.citations.length;
                const docNames = responseData.citations.slice(0, 3).map((c: any) => c.docName).join(', ');
                content = `I found ${docCount} relevant document${docCount !== 1 ? 's' : ''}. ${docNames}${docCount > 3 ? ' and more' : ''}.`;
              }
              // If response is an object without answer/content fields
              else if (typeof responseData === 'object') {
                content = 'Response received but no answer content available.';
              }

              // Extract official fields when using tool planner or enhanced routing
              if (typeof responseData === 'object') {
                if (Array.isArray(responseData.citations)) citations = responseData.citations;
                const agent = (responseData as any).agent;
                if (agent && (agent.name || agent.type)) {
                  const conf = typeof agent.confidence === 'number' ? ` • ${(agent.confidence * 100).toFixed(1)}%` : '';
                  agentLine = `\n\n— Agent: ${agent.name || agent.type}${conf}`;
                }
              }
            }
            
            console.log('Processed content:', content);
            console.log('Processed citations:', citations);
            
            const updated = { 
              ...m, 
              content: content + agentLine,
              citations: citations
            } as any;
            // Update lastListDocIds for referential follow-ups (preserve order)
            try {
              // Prefer planner-provided considered.docIds; fallback to citation docIds
              const consideredIds = Array.isArray((responseData as any)?.considered?.docIds) 
                ? (responseData as any).considered.docIds 
                : [];
              const citationIds = Array.isArray((updated as any).citations) 
                ? (updated as any).citations.map((c: any) => c.docId).filter(Boolean) 
                : [];
              const ids = (consideredIds.length ? consideredIds : citationIds).filter(Boolean);
              if (ids.length > 0) lastListDocIdsRef.current = ids;
            } catch {}
            return updated;
          }
          return m;
        }));

        setIsLoading(false);
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to get response from the agent',
        variant: 'destructive',
      });
      const errorMessage = { 
        id: 'error_' + Date.now().toString(),
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.` 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 max-w-4xl h-full flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Briefly Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="mb-4 flex flex-col gap-2">
              <ScopePicker value={ctx} onChange={setCtx} />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={()=>setPickerOpen('folder')}>Select Folder…</Button>
                <Button variant="outline" size="sm" onClick={()=>setPickerOpen('doc')}>Select Document…</Button>
              </div>
            </div>
            
            <ScrollArea className="flex-1 rounded-md border p-4 mb-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <div 
                    key={msg.id || index} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[80%] rounded-lg p-4 ${
                        msg.role === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {msg.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                        <span className="font-semibold text-sm">{msg.role === 'user' ? 'You' : 'Briefly Agent'}</span>
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        {msg.role === 'assistant' ? (
                          <Response>
                            {msg.content || (isLoading && msg.role === 'assistant' && msg.id?.startsWith('assistant_') ? 'Thinking...' : '')}
                          </Response>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {msg.content || (isLoading && msg.role === 'assistant' && msg.id?.startsWith('assistant_') ? 'Thinking...' : '')}
                          </div>
                        )}
                      </div>
                      {/* Citations (compact chips with hover preview) */}
                      {msg.role === 'assistant' && Array.isArray((msg as any).citations) && (msg as any).citations.length > 0 && (
                        <TooltipProvider>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(msg as any).citations.map((c: any, i: number) => (
                              <Tooltip key={i}>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => c.docId && window.open(`/documents/${c.docId}`, '_blank')}
                                    className="max-w-[220px] truncate rounded-full border border-border/70 bg-muted px-3 py-1 text-xs text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    title={c.docName || 'Open document'}
                                  >
                                    {(i + 1) + '. '}{c.docName || 'Document'}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <div className="text-sm font-semibold mb-1 flex items-center justify-between gap-3">
                                    <span className="truncate">{c.docName || 'Document'}</span>
                                    <button
                                      title="Open"
                                      onClick={() => c.docId && window.open(`/documents/${c.docId}`, '_blank')}
                                      className="inline-grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {typeof c.page === 'number' && (
                                    <div className="text-xs text-muted-foreground mb-1">Page {c.page}</div>
                                  )}
                                  {c.snippet && (
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                      {c.snippet}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-4 bg-gray-100 dark:bg-gray-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="h-4 w-4" />
                        <span className="font-semibold text-sm">Briefly Agent</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '600ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about your documents..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading} className="gap-2">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </form>
            <SimplePicker
              open={!!pickerOpen}
              onClose={()=>setPickerOpen(null)}
              mode={pickerOpen === 'folder' ? 'folder' : 'doc'}
              initialPath={ctx.folderPath || []}
              onPick={({ path, doc }) => {
                if (pickerOpen === 'folder' && path) setCtx({ ...ctx, scope: 'folder', folderPath: path });
                if (pickerOpen === 'doc' && doc) setCtx({ ...ctx, scope: 'doc', docId: doc.id });
              }}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
