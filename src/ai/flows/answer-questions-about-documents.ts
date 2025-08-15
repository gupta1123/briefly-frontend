'use server';
/**
 * @fileOverview Answers questions about a collection of documents.
 *
 * Upgraded to:
 * - Accept structured document metadata (id, title, sender, receiver, dates, type, tags, summary, content)
 * - Optionally include conversation history for follow-ups and pronoun resolution
 * - Provide clearer instructions to ask for clarification if the question is ambiguous
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']).describe('Message author.'),
  content: z.string().describe('Message text content.'),
});

const DocInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  receiver: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  documentType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
  content: z.string().nullable().optional(),
  relevanceScore: z.number().optional().describe('Client-estimated relevance score for this question.'),
  subject: z.string().nullable().optional(),
  aiKeywords: z.array(z.string()).optional(),
  linkedDocumentIds: z.array(z.string()).optional(),
  isLinkedContextOnly: z.boolean().optional().describe('True if this doc is included only to provide context as a linked item.'),
});

const AnswerQuestionsAboutDocumentsInputSchema = z.object({
  question: z.string().describe('The user question to answer.'),
  documents: z
    .array(DocInputSchema)
    .describe('Documents in scope, including metadata and optional content.'),
  conversationHistory: z
    .array(ChatMessageSchema)
    .optional()
    .describe('Optional prior turns for context and pronoun resolution.'),
  queryTerms: z.array(z.string()).optional().describe('Key terms extracted from the user question for grounding.'),
  focusDocIds: z.array(z.string()).optional().describe('Candidate focus documents referenced implicitly (e.g., "it", "first one").'),
  lastCitedDocIds: z.array(z.string()).optional().describe('Doc IDs cited in the prior assistant message in order.'),
});
export type AnswerQuestionsAboutDocumentsInput = z.infer<
  typeof AnswerQuestionsAboutDocumentsInputSchema
>;

const AnswerQuestionsAboutDocumentsOutputSchema = z.object({
  answer: z.string().describe('The answer to the question.'),
  citations: z
    .array(
      z.object({
        docIndex: z
          .number()
          .describe('Index into the provided Documents list (0-based).'),
        snippet: z
          .string()
          .describe('Short quote or paraphrase that supports the answer.'),
      })
    )
    .optional(),
});
export type AnswerQuestionsAboutDocumentsOutput = z.infer<
  typeof AnswerQuestionsAboutDocumentsOutputSchema
>;

export async function answerQuestionsAboutDocuments(
  input: AnswerQuestionsAboutDocumentsInput
): Promise<AnswerQuestionsAboutDocumentsOutput> {
  return answerQuestionsAboutDocumentsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'answerQuestionsAboutDocumentsPrompt',
  input: {schema: AnswerQuestionsAboutDocumentsInputSchema},
  output: {schema: AnswerQuestionsAboutDocumentsOutputSchema},
  prompt: `You are an expert assistant answering questions about the provided documents.

Guidelines:
- Use both metadata and content. Prefer precise answers grounded in the docs.
- If the question is ambiguous (e.g., pronouns like "it"), use conversation history to resolve; if still unclear, ask a concise clarifying question.
- If the answer is not found, state that and list up to 3 relevant documents that might help.
- If the user references "the first document", interpret that as the most recently discussed document or the first citation in the prior assistant message, if present.
- Provide citations as an array of {docIndex, snippet} where docIndex refers to the index in the Documents list below.
- Use the MINIMUM number of citations needed to justify the answer: prefer 1 citation when a single document suffices; never exceed 3.
- Deduplicate citations by document; if all evidence comes from one document, return exactly one citation.
- Treat any document with relevanceScore >= 2 as a relevant hit; do not claim that nothing was found if at least one such document exists.
- If asked for subject or keywords, prefer document.subject, tags, and aiKeywords from metadata; avoid hallucinating.

LINKED DOCUMENTS INTELLIGENCE:
- Each document has a "linkedDocumentIds" array containing IDs of related documents (versions, references, etc.)
- When asked "what linked docs do I have" or similar broad queries, scan ALL documents and identify which ones have linkedDocumentIds arrays with content
- For linked document questions, look for patterns like: "linked", "related", "connected", "versions", "associated"
- Always check both directions: if Doc A links to Doc B, mention this relationship clearly
- When listing linked documents, include document names/titles, types, and dates when available
- If a user asks about linked documents but none exist, explain what linking means and suggest how documents can become linked
- Documents marked "isLinkedContextOnly: true" are included specifically to provide context for linked relationships

- For time-specific questions (e.g., "where was he working in Dec 2025"), infer by comparing dates/ranges in the documents and clearly justify with a short cited line; if the period spans, state the employer active at that date.
- Use focusDocIds and lastCitedDocIds to resolve references like "it", "this", "that", or "the first one". If the user says "the first one", default to the first ID in lastCitedDocIds if present.

Formatting:
- The 'answer' must be natural prose (optionally bullet lists) with NO JSON, NO code blocks, and NO inline citation objects or doc indices. Do not include strings like '[ { "docIndex": 1, ... } ]' in the answer text. The UI will render citations from the separate 'citations' field.

Question: {{{question}}}

Conversation History (most recent last):
{{#each conversationHistory}}
- {{role}}: {{{content}}}
{{/each}}

Query Terms (for grounding): {{#each queryTerms}}{{this}} {{/each}}

Focus Doc IDs (if any): {{#each focusDocIds}}{{this}} {{/each}}
Last Cited Doc IDs: {{#each lastCitedDocIds}}{{this}} {{/each}}

Documents (indexed):
{{#each documents}}
---
Index: {{@index}}
ID: {{{id}}}
Name: {{{name}}}
Title: {{{title}}}
Sender: {{{sender}}}
Receiver: {{{receiver}}}
Date: {{{documentDate}}}
Type: {{{documentType}}}
Tags: {{#if tags}}{{{tags}}}{{/if}}
Summary: {{{summary}}}
Content: {{{content}}}
---
{{/each}}
`,
});

const answerQuestionsAboutDocumentsFlow = ai.defineFlow(
  {
    name: 'answerQuestionsAboutDocumentsFlow',
    inputSchema: AnswerQuestionsAboutDocumentsInputSchema,
    outputSchema: AnswerQuestionsAboutDocumentsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
