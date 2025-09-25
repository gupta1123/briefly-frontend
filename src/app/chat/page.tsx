'use client';

import { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Sources, SourcesTrigger, SourcesContent, Source } from '@/components/ai-elements/sources';
import { Loader } from '@/components/ai-elements/loader';
import { Task, TaskTrigger, TaskContent, TaskItem } from '@/components/ai-elements/task';
import { apiFetch, getApiContext, ssePost } from '@/lib/api';
import { useSettings } from '@/hooks/use-settings';
import { Bot, Zap } from 'lucide-react';

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, {
    primary: string;
    secondary: string;
    gradient: string;
    iconBg: string;
    buttonBg: string;
    buttonHover: string;
  }> = {
    default: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-purple-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    red: {
      primary: 'text-red-600 dark:text-red-400',
      secondary: 'text-red-700 dark:text-red-300',
      gradient: 'from-red-600 to-pink-600',
      iconBg: 'bg-red-100 dark:bg-red-800/40',
      buttonBg: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
      buttonHover: 'hover:bg-red-50 dark:hover:bg-red-900/20'
    },
    rose: {
      primary: 'text-rose-600 dark:text-rose-400',
      secondary: 'text-rose-700 dark:text-rose-300',
      gradient: 'from-rose-600 to-pink-600',
      iconBg: 'bg-rose-100 dark:bg-rose-800/40',
      buttonBg: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700',
      buttonHover: 'hover:bg-rose-50 dark:hover:bg-rose-900/20'
    },
    orange: {
      primary: 'text-orange-600 dark:text-orange-400',
      secondary: 'text-orange-700 dark:text-orange-300',
      gradient: 'from-orange-600 to-red-600',
      iconBg: 'bg-orange-100 dark:bg-orange-800/40',
      buttonBg: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700',
      buttonHover: 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
    },
    amber: {
      primary: 'text-amber-600 dark:text-amber-400',
      secondary: 'text-amber-700 dark:text-amber-300',
      gradient: 'from-amber-600 to-orange-600',
      iconBg: 'bg-amber-100 dark:bg-amber-800/40',
      buttonBg: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700',
      buttonHover: 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
    },
    yellow: {
      primary: 'text-yellow-600 dark:text-yellow-400',
      secondary: 'text-yellow-700 dark:text-yellow-300',
      gradient: 'from-yellow-600 to-amber-600',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/40',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700',
      buttonHover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    },
    lime: {
      primary: 'text-lime-600 dark:text-lime-400',
      secondary: 'text-lime-700 dark:text-lime-300',
      gradient: 'from-lime-600 to-green-600',
      iconBg: 'bg-lime-100 dark:bg-lime-800/40',
      buttonBg: 'bg-lime-600 hover:bg-lime-700 dark:bg-lime-600 dark:hover:bg-lime-700',
      buttonHover: 'hover:bg-lime-50 dark:hover:bg-lime-900/20'
    },
    green: {
      primary: 'text-green-600 dark:text-green-400',
      secondary: 'text-green-700 dark:text-green-300',
      gradient: 'from-green-600 to-emerald-600',
      iconBg: 'bg-green-100 dark:bg-green-800/40',
      buttonBg: 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700',
      buttonHover: 'hover:bg-green-50 dark:hover:bg-green-900/20'
    },
    emerald: {
      primary: 'text-emerald-600 dark:text-emerald-400',
      secondary: 'text-emerald-700 dark:text-emerald-300',
      gradient: 'from-emerald-600 to-teal-600',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/40',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
      buttonHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
    },
    teal: {
      primary: 'text-teal-600 dark:text-teal-400',
      secondary: 'text-teal-700 dark:text-teal-300',
      gradient: 'from-teal-600 to-cyan-600',
      iconBg: 'bg-teal-100 dark:bg-teal-800/40',
      buttonBg: 'bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700',
      buttonHover: 'hover:bg-teal-50 dark:hover:bg-teal-900/20'
    },
    cyan: {
      primary: 'text-cyan-600 dark:text-cyan-400',
      secondary: 'text-cyan-700 dark:text-cyan-300',
      gradient: 'from-cyan-600 to-blue-600',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/40',
      buttonBg: 'bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-700',
      buttonHover: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/20'
    },
    sky: {
      primary: 'text-sky-600 dark:text-sky-400',
      secondary: 'text-sky-700 dark:text-sky-300',
      gradient: 'from-sky-600 to-blue-600',
      iconBg: 'bg-sky-100 dark:bg-sky-800/40',
      buttonBg: 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-700',
      buttonHover: 'hover:bg-sky-50 dark:hover:bg-sky-900/20'
    },
    blue: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-indigo-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    indigo: {
      primary: 'text-indigo-600 dark:text-indigo-400',
      secondary: 'text-indigo-700 dark:text-indigo-300',
      gradient: 'from-indigo-600 to-purple-600',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/40',
      buttonBg: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700',
      buttonHover: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
    },
    violet: {
      primary: 'text-violet-600 dark:text-violet-400',
      secondary: 'text-violet-700 dark:text-violet-300',
      gradient: 'from-violet-600 to-purple-600',
      iconBg: 'bg-violet-100 dark:bg-violet-800/40',
      buttonBg: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700',
      buttonHover: 'hover:bg-violet-50 dark:hover:bg-violet-900/20'
    },
    purple: {
      primary: 'text-purple-600 dark:text-purple-400',
      secondary: 'text-purple-700 dark:text-purple-300',
      gradient: 'from-purple-600 to-violet-600',
      iconBg: 'bg-purple-100 dark:bg-purple-800/40',
      buttonBg: 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700',
      buttonHover: 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
    },
    fuchsia: {
      primary: 'text-fuchsia-600 dark:text-fuchsia-400',
      secondary: 'text-fuchsia-700 dark:text-fuchsia-300',
      gradient: 'from-fuchsia-600 to-pink-600',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40',
      buttonBg: 'bg-fuchsia-600 hover:bg-fuchsia-700 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-700',
      buttonHover: 'hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20'
    },
    pink: {
      primary: 'text-pink-600 dark:text-pink-400',
      secondary: 'text-pink-700 dark:text-pink-300',
      gradient: 'from-pink-600 to-rose-600',
      iconBg: 'bg-pink-100 dark:bg-pink-800/40',
      buttonBg: 'bg-pink-600 hover:bg-pink-700 dark:bg-pink-600 dark:hover:bg-pink-700',
      buttonHover: 'hover:bg-pink-50 dark:hover:bg-pink-900/20'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ docId: string; docName?: string }>;
  isStreaming?: boolean;
}

export default function TestAgentEnhancedPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial_msg',
      role: 'assistant',
      content: "Hello! I'm your Briefly Agent with enhanced AI-powered capabilities! 🚀"
    }
  ]);
  
  const [currentTaskSteps, setCurrentTaskSteps] = useState<any[]>([]);
  const [currentTools, setCurrentTools] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [lastListDocIds, setLastListDocIds] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleSubmit = async (input: string) => {
    if (!input.trim() || isLoading) return;

    console.log('Submitting message:', input);
    const { orgId } = getApiContext();
    const endpoint = '/chat/stream';
    
    // Add user message
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Add assistant message placeholder
    const assistantId = `assistant_${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    console.log('Added assistant message placeholder');

    try {
      let streamingContent = '';
      
      // Reset task steps and tools for new query
      setCurrentTaskSteps([]);
      setCurrentTools([]);
      
      await ssePost(`/orgs/${orgId}${endpoint}`, {
        question: input,
        conversation: messages.map(m => ({
          role: m.role,
          content: m.content,
          citations: m.citations
        })),
        memory: {
          lastListDocIds: lastListDocIds,
          focusDocIds: [],
          lastCitedDocIds: []
        },
        context: {
          scope: 'org',
          includeSubfolders: true,
          includeLinked: false,
          includeVersions: false
        },
        filters: {},
        strictCitations: false
      }, (event) => {
        if (event.event === 'message' && event.data) {
          try {
            // Ensure we have a proper data object
            let data;
            if (typeof event.data === 'string') {
              // Try to parse as JSON
              try {
                data = JSON.parse(event.data);
              } catch (jsonError) {
                console.warn('Failed to parse JSON data:', event.data);
                return; // Skip this event
              }
            } else if (typeof event.data === 'object' && event.data !== null) {
              data = event.data;
            } else {
              console.warn('Invalid event data type:', typeof event.data, event.data);
              return; // Skip this event
            }

            // Ensure data has a type property
            if (!data || typeof data !== 'object' || !data.type) {
              console.warn('Invalid data object:', data);
              return; // Skip this event
            }

            console.log('Processing streaming data:', data.type, data);
            console.log('Current streamingContent:', streamingContent);
            
            if (data.type === 'task_step') {
              // Update task steps
              setCurrentTaskSteps(prev => {
                const existing = prev.find(step => step.step === data.step);
                if (existing) {
                  return prev.map(step => 
                    step.step === data.step ? { ...step, ...data } : step
                  );
                } else {
                  return [...prev, data];
                }
              });
            } else if (data.type === 'tool_usage') {
              // Update tools used
              setCurrentTools(prev => {
                const existing = prev.find(tool => tool.name === data.name);
                if (existing) {
                  return prev.map(tool => 
                    tool.name === data.name ? { ...tool, ...data } : tool
                  );
                } else {
                  return [...prev, data];
                }
              });
            } else if (data.type === 'content' && data.chunk) {
              streamingContent += data.chunk;
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { ...m, content: streamingContent }
                  : m
              ));
            } else if (data.type === 'tool_call' && data.message) {
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { ...m, content: streamingContent + `\n\n🔍 ${data.message}` }
                  : m
              ));
            } else if (data.type === 'complete') {
              const finalContent = data.full_content || streamingContent;
              const citations = data.citations || [];
              
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { 
                      ...m, 
                      content: finalContent,
                      citations: citations,
                      isStreaming: false,
                      tools: data.tools || currentTools,
                      reasoning: data.reasoning || data.agentInsights?.join('\n'),
                      agent: data.agent || 'Smart Assistant',
                      processingSteps: data.processingSteps || currentTaskSteps
                    }
                  : m
              ));
              
              // Clear current task steps and tools after completion
              setCurrentTaskSteps([]);
              setCurrentTools([]);
              
              // Update lastListDocIds for follow-up questions
              if (citations.length > 0) {
                setLastListDocIds(citations.map((c: any) => c.docId).slice(0, 5));
              }
            } else if (data.type === 'error') {
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { 
                      ...m, 
                      content: streamingContent + `\n\n❌ **Error**: ${data.error}`,
                      isStreaming: false
                    }
                  : m
              ));
              
              // Clear current task steps and tools on error
              setCurrentTaskSteps([]);
              setCurrentTools([]);
            } else {
              // Handle any other data types - don't add to content
              console.log('Unhandled data type:', data.type, data);
            }
          } catch (error) {
            console.error('Error processing streaming data:', error, event.data);
            // Don't add unparsed data to content
          }
        }
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { 
              ...m, 
              content: `❌ **Error**: ${error instanceof Error ? error.message : 'Something went wrong'}`,
              isStreaming: false
            }
          : m
      ));
    } finally {
      setIsLoading(false);
      setInputValue(''); // Clear input after submission
      // Ensure task steps and tools are cleared
      setCurrentTaskSteps([]);
      setCurrentTools([]);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-4xl mx-auto shadow-xl bg-card border-border card-premium">
          <CardHeader className={`bg-gradient-to-r ${themeColors.gradient} text-white rounded-t-lg`}>
            <div className="flex items-center justify-center">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center`}>
                  <Bot className="h-5 w-5" />
                </div>
                Briefly Agent Enhanced
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  AI-Powered
                </Badge>
              </CardTitle>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 bg-background">
            <div className="h-[600px] flex flex-col">
              <ScrollArea className="flex-1 p-4 bg-background" ref={scrollAreaRef}>
                <div className="space-y-4">
                  {messages.map((message) => {
                    console.log('Rendering message:', message);
                    return (
                      <Message
                        key={message.id}
                        from={message.role}
                        className="w-full"
                      >
                        <MessageContent variant="flat">
                          {message.role === 'user' ? (
                            <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                              {message.content}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Agent Processing Steps - Only show if there are document-related steps */}
                              {((message.isStreaming && currentTaskSteps.length > 0) || ((message as any).processingSteps?.length > 0 && (message as any).processingSteps.some((step: any) => step.step === 'search_documents'))) && (
                                <Task className="w-full">
                                  <TaskTrigger title="AI Agent Processing" />
                                  <TaskContent>
                                    {message.isStreaming ? (
                                      currentTaskSteps.map((step, index) => (
                                        <TaskItem key={index} className={step.status === 'completed' ? 'text-green-600' : step.status === 'error' ? 'text-red-600' : ''}>
                                          {step.title} {step.status === 'completed' ? '✅' : step.status === 'error' ? '❌' : '⏳'}
                                        </TaskItem>
                                      ))
                                    ) : (
                                      (message as any).processingSteps?.map((step: any, index: number) => (
                                        <TaskItem key={index} className={step.status === 'completed' ? 'text-green-600' : step.status === 'error' ? 'text-red-600' : ''}>
                                          {step.title} {step.status === 'completed' ? '✅' : step.status === 'error' ? '❌' : '⏳'}
                                        </TaskItem>
                                      ))
                                    )}
                                  </TaskContent>
                                </Task>
                              )}
                              
                              {/* Main Response Content */}
                              {message.content && (
                                <div className="space-y-3">
                                  <Response className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                                    {message.content}
                                  </Response>
                                  
                                </div>
                              )}
                              
                              {/* Loading State - Only show for complex queries with task steps */}
                              {message.isStreaming && !message.content && currentTaskSteps.some(step => step.step === 'search_documents') && (
                                <Loader className={themeColors.primary} />
                              )}
                              
                              {/* Tool Usage - Only show if there are actual tools */}
                              {(((message as any).tools && (message as any).tools.length > 0) || (message.isStreaming && currentTools.length > 0)) && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium text-muted-foreground">Tools Used:</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {(message.isStreaming ? currentTools : (message as any).tools || []).map((tool: any, i: number) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        {tool.name || tool} {tool.status === 'completed' ? '✅' : '⏳'}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Reasoning Process - Only show for complex queries */}
                              {(message as any).reasoning && (message as any).reasoning.length > 50 && (
                                <div className="border rounded-lg p-3 bg-muted/50">
                                  <details className="group">
                                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                                      Show reasoning process
                                    </summary>
                                    <div className="mt-2 prose prose-sm max-w-none text-muted-foreground">
                                      {(message as any).reasoning}
                                    </div>
                                  </details>
                                </div>
                              )}
                              
                              {/* Sources and Citations */}
                              {message.citations && message.citations.length > 0 && (
                                <Sources className="mt-4">
                                  <SourcesTrigger count={message.citations.length} />
                                  <SourcesContent>
                                    <div className="space-y-2">
                                      {message.citations.map((c, index) => (
                                        <Source key={c.docId} href={`/documents/${c.docId}`} title={c.docName || `Document ${c.docId.slice(0, 8)}`}>
                                          <div>
                                            <div className="font-medium text-foreground">{c.docName || `Document ${c.docId.slice(0, 8)}`}</div>
                                            <div className="text-xs text-muted-foreground">ID: {c.docId}</div>
                                            {'snippet' in c && (c as any).snippet && (
                                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {(c as any).snippet}
                                              </div>
                                            )}
                                          </div>
                                        </Source>
                                      ))}
                                    </div>
                                  </SourcesContent>
                                </Sources>
                              )}
                            </div>
                          )}
                        </MessageContent>
                      </Message>
                    );
                  })}
                  
                </div>
              </ScrollArea>
              
              <div className="border-t border-border p-4 bg-background">
                <PromptInput
                  onSubmit={(message, event) => {
                    event.preventDefault();
                    if (message.text) {
                      handleSubmit(message.text);
                    }
                  }}
                  className="w-full"
                >
                  <PromptInputBody>
                    <PromptInputTextarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Ask me about your documents or anything else..."
                      disabled={isLoading}
                      className="w-full"
                    />
                    <PromptInputSubmit disabled={isLoading} />
                  </PromptInputBody>
                </PromptInput>
              </div>
          </div>
          </CardContent>
        </Card>
        
      </div>
    </AppLayout>
  );
}