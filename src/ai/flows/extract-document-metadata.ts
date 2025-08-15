'use server';

/**
 * @fileOverview This file defines a Genkit flow for extracting metadata from documents using AI.
 *
 * The flow takes a document (as a data URI) and its type as input, and returns extracted metadata
 * such as keywords, dates, and entities. This metadata can then be used for document search and categorization.
 *
 * @module extract-document-metadata
 * @typicalname extractDocumentMetadata
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractDocumentMetadataInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "The document as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  documentType: z.string().describe('The type of the document (e.g., invoice, government circular, PDF with handwritten text).'),
});
export type ExtractDocumentMetadataInput = z.infer<
  typeof ExtractDocumentMetadataInputSchema
>;

const ExtractDocumentMetadataOutputSchema = z.object({
  // core
  keywords: z.array(z.string()).min(3).describe('Keywords extracted from the document (>=3).'),
  dates: z.array(z.string()).describe('Dates extracted from the document.'),
  entities: z.array(z.string()).describe('Entities (e.g., people, organizations, locations) extracted from the document.'),
  summary: z.string().describe('A short summary of the document.'),
  // extended fields used to pre-fill the upload form (compulsory where indicated)
  title: z.string().min(1).describe('Human-friendly title of the document.'),
  filename: z.string().optional().describe('The original filename if present in the content.'),
  sender: z.string().optional().describe('Primary sender/author/issuer of the document.'),
  receiver: z.string().optional().describe('Primary receiver/recipient of the document.'),
  senderOptions: z.array(z.string()).optional().describe('Multiple potential senders if document contains several candidates.'),
  receiverOptions: z.array(z.string()).optional().describe('Multiple potential receivers if document contains several candidates.'),
  documentDate: z.string().optional().describe('Primary date associated with the document.'),
  documentType: z.string().optional().describe('High-level type/category of the document.'),
  subject: z.string().min(1).describe('Subject or headline.'),
  description: z.string().optional().describe('One-paragraph description suitable for a textarea.'),
  category: z.string().optional().describe('General category.'),
  tags: z.array(z.string()).min(3).describe('Free-form tags (>=3).'),
  // deep insights for detail page
  aiPurpose: z.string().optional().describe('Single line purpose of the document.'),
  aiKeyPoints: z.array(z.string()).optional().describe('List of 3-7 key points.'),
  aiContext: z.string().optional().describe('1-3 sentences of context.'),
  aiOutcome: z.string().optional().describe('Outcome or action summary.'),
  aiKeywords: z.array(z.string()).optional().describe('Extra AI keywords for tagging.'),
});
export type ExtractDocumentMetadataOutput = z.infer<
  typeof ExtractDocumentMetadataOutputSchema
>;

export async function extractDocumentMetadata(
  input: ExtractDocumentMetadataInput
): Promise<ExtractDocumentMetadataOutput> {
  return extractDocumentMetadataFlow(input);
}

const extractDocumentMetadataPrompt = ai.definePrompt({
  name: 'extractDocumentMetadataPrompt',
  input: {schema: ExtractDocumentMetadataInputSchema},
  output: {schema: ExtractDocumentMetadataOutputSchema},
  prompt: `You are an expert AI assistant specialized in extracting metadata from documents.

You will receive a document and its type. Extract fields for the form and detail view. The following are COMPULSORY and must never be empty: Title, Subject, Keywords (>=3), Tags (>=3). If the document does not explicitly provide them, synthesize concise, faithful values from its content.

- Summary: detailed EXACTLY 300 words (±10 words acceptable, aim for 290-310 words) as continuous prose, no bullets.
- Keywords: 5–10 important, deduplicated terms.
- Dates: any dates mentioned.
- Entities: people, orgs, locations.
- Title, Filename (if present), Sender, Receiver, DocumentDate, DocumentType, Subject, Description (short paragraph), Category, Tags (3–8 tags, short phrases).
- Purpose (aiPurpose), Key Points (aiKeyPoints bullet list), Context (aiContext), Outcome/Action (aiOutcome), extra AI Keywords (aiKeywords).

Sender/Receiver Handling:
- For sender: identify the primary author, issuer, or originating entity.
- For receiver: identify the primary recipient or target audience.
- CRITICAL: Scan the document equally for BOTH multiple senders AND multiple receivers. Pay equal attention to both!

Multiple SENDERS - Use senderOptions when you find:
  * Multiple "From:" fields, signatures, letterheads, or authors
  * Joint communications from multiple organizations/departments
  * Multiple officials or department heads mentioned as sources
  * Co-signers or multiple authority figures

Multiple RECEIVERS - Use receiverOptions when you find:
  * Multiple names in "To:" field or addressee lines
  * Document addressed to multiple departments/organizations
  * CC/BCC lists with multiple meaningful recipients
  * Distribution lists or broadcast communications
  * Reports for multiple stakeholders or audiences
  * Letters mentioning multiple concerned parties or addressees

- Always populate the primary sender/receiver fields with the most likely candidate.
- senderOptions/receiverOptions should contain 2+ items only when genuinely found in the document.
- Look just as hard for multiple receivers as you do for multiple senders!

Rules:
- Always output non-empty Title and Subject.
- Always output at least 3 Keywords and 3 Tags; deduplicate and trim.
- Prefer specific, grounded phrasing; avoid speculation.

Document Type: {{{documentType}}}
Document: {{media url=documentDataUri}}

Return strictly in the specified JSON schema.`,
});

const extractDocumentMetadataFlow = ai.defineFlow(
  {
    name: 'extractDocumentMetadataFlow',
    inputSchema: ExtractDocumentMetadataInputSchema,
    outputSchema: ExtractDocumentMetadataOutputSchema,
  },
  async input => {
    const {output} = await extractDocumentMetadataPrompt(input);
    return output!;
  }
);


