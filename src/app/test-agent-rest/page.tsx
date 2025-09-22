"use client";

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertCircle } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { ScopePicker } from '@/components/scope-picker';
import type { ChatContext as PickerContext } from '@/components/scope-picker';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function TestAgentRestPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; type?: string; id?: string }[]>([
    { id: 'initial_msg', role: 'assistant', content: "Hello! I'm the Briefly Agent interface. I'm now connected to the real backend agent using REST instead of SSE." }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [ctx, setCtx] = useState<PickerContext>({ scope: 'org', includeSubfolders: true, includeLinked: false, includeVersions: true });
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastListDocIdsRef = useRef<string[]>([]);

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

      // Use the unified REST endpoint with context scoping
      const endpoint = '/chat/query';
      
      // Add placeholder assistant message
      const assistantId = 'assistant_' + Date.now().toString();
      console.log('Creating assistant message with ID:', assistantId);
      const placeholder = { id: assistantId, role: 'assistant', content: 'Thinking...' };
      setMessages(prev => [...prev, placeholder]);

      // Make REST API call
      const response = await apiFetch(`/orgs/${orgId}${endpoint}`, {
        method: 'POST',
        body: {
          question,
          conversation: messages.filter(m => m.id !== assistantId).slice(-15).map(m => ({ role: m.role, content: m.content, citations: (m as any).citations })),
          memory: { lastListDocIds: lastListDocIdsRef.current },
          context: ctx
        }
      });

      console.log('REST response:', response);

      // Capture considered docIds to support ordinal follow-ups like "first one"
      try {
        const ids = Array.isArray((response as any)?.considered?.docIds) ? (response as any).considered.docIds : [];
        if (ids.length > 0) lastListDocIdsRef.current = ids.filter(Boolean);
      } catch {}

      // Update assistant message with the response
      setMessages(prev => prev.map(m => {
        if (m.id === assistantId) {
          console.log('Updating assistant message:', {
            messageId: assistantId,
            response: response
          });
          return { 
            ...m, 
            content: response.answer || response.content || 'No response received',
            citations: response.citations || []
          };
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
              Briefly Agent Testing
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="mb-4">
              <ScopePicker value={ctx} onChange={setCtx} />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Using REST API:</strong> This interface now uses REST instead of SSE for communication with the Briefly Agent.
                </div>
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
                        <span className="font-semibold text-sm">
                          {msg.role === 'user' ? 'You' : 'Briefly Agent'}
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content || (isLoading && msg.role === 'assistant' && msg.id?.startsWith('assistant_') ? 'Thinking...' : '')}
                          </ReactMarkdown>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {msg.content || (isLoading && msg.role === 'assistant' && msg.id?.startsWith('assistant_') ? 'Thinking...' : '')}
                          </div>
                        )}
                      </div>
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
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
