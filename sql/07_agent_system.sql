-- 07_agent_system.sql
-- Multi-Agent RAG System Migration
-- Creates agent_types table for specialized question handling

-- Agent Types Table
create table if not exists agent_types (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, -- 'metadata', 'content', 'financial', 'resume', 'legal'
  name text not null,
  description text,
  prompt_template text,
  model_config jsonb not null default '{}',
  is_active boolean default true,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table agent_types enable row level security;

-- Allow all authenticated users to read agent types (global definitions)
create policy agent_types_read on agent_types
  for select using (auth.role() = 'authenticated');

-- Only org admins can manage agent types
create policy agent_types_admin_write on agent_types
  for all using (
    exists (
      select 1 from organization_users ou
      join organizations o on o.id = ou.org_id
      where ou.user_id = auth.uid()
      and ou.role = 'orgAdmin'
    )
  ) with check (
    exists (
      select 1 from organization_users ou
      join organizations o on o.id = ou.org_id
      where ou.user_id = auth.uid()
      and ou.role = 'orgAdmin'
    )
  );

-- Seed initial agent types
insert into agent_types (key, name, description, prompt_template, model_config) values
('metadata', 'Metadata Agent', 'Handles metadata-only questions about document properties, dates, senders, etc.',
'You are a metadata specialist. Answer questions about document metadata only: dates, senders, receivers, types, categories, filenames, etc. Do not analyze document content.

Question: {{{question}}}

Available document metadata:
{{#each documents}}
- Document: {{{title}}} {{{filename}}}
- Date: {{{documentDate}}}
- Sender: {{{sender}}}
- Receiver: {{{receiver}}}
- Type: {{{documentType}}}
- Category: {{{category}}}
{{/each}}

Answer concisely using only the metadata provided.',
'{"model": "gemini-2.0-flash", "temperature": 0.1}'),

('content', 'Content Agent', 'Handles deep content analysis and question answering from document text',
'You are an expert document analyst. Answer questions by analyzing the actual content of documents.

Guidelines:
- Use the document content and snippets provided
- Cite specific parts of documents that support your answer
- If information is not available in the provided content, say so
- Be concise but comprehensive

Question: {{{question}}}

Document Content:
{{#each documents}}
{{{title}}}:
{{{content}}}
---
{{/each}}

Answer:',
'{"model": "gemini-2.0-flash", "temperature": 0.3}'),

('financial', 'Financial Agent', 'Specializes in financial documents: invoices, bills, budgets, payments, project costs',
'You are a financial document specialist. Analyze financial documents and provide accurate information about amounts, budgets, payments, project costs, and financial terms.

Question: {{{question}}}

Financial Documents:
{{#each documents}}
{{{title}}} ({{{documentType}}})
{{{content}}}
---
{{/each}}

Extract and analyze:
- Project costs (existing, expansion, total)
- Monetary amounts and currencies (rupees, crores, lakhs, dollars)
- Budget allocations and breakdowns
- Cost comparisons (existing vs proposed vs total)
- Financial calculations and totals
- Invoice/bill details and amounts
- Payment terms and due dates

For project cost questions:
- Identify existing project costs
- Find expansion/proposed costs
- Calculate total project costs
- Provide cost breakdowns by category
- Include currency units (₹, crores, lakhs, etc.)

Answer with specific amounts and clear breakdowns:',
'{"model": "gemini-2.0-flash", "temperature": 0.1}'),

('resume', 'Resume Agent', 'Analyzes CVs, resumes, and candidate information',
'You are a resume and candidate analysis specialist. Extract and analyze information from resumes, CVs, and candidate profiles.

Question: {{{question}}}

Resume Documents:
{{#each documents}}
{{{title}}} - {{{sender}}}
{{{content}}}
---
{{/each}}

Extract information about:
- Work experience and job titles
- Education and qualifications
- Skills and competencies
- Contact information
- Career progression

Answer:',
'{"model": "gemini-2.0-flash", "temperature": 0.2}'),

('legal', 'Legal Agent', 'Handles legal documents: contracts, agreements, notices, legal correspondence',
'You are a legal document specialist. Analyze legal documents and provide information about terms, obligations, rights, and legal implications.

Question: {{{question}}}

Legal Documents:
{{#each documents}}
{{{title}}} ({{{documentType}}})
{{{content}}}
---
{{/each}}

Focus on:
- Contract terms and conditions
- Legal obligations and rights
- Important dates and deadlines
- Parties involved
- Legal implications

Answer:',
'{"model": "gemini-2.0-flash", "temperature": 0.1}')

on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  prompt_template = excluded.prompt_template,
  model_config = excluded.model_config;

-- Create indexes
create index if not exists idx_agent_types_key on agent_types(key);
create index if not exists idx_agent_types_active on agent_types(is_active) where is_active = true;

select 'agent system migration completed' as status;
