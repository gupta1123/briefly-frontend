-- Semantic Search: pgvector matching function for doc_chunks
-- Run this in your Supabase SQL editor after enabling the `vector` extension

-- If the function already exists, drop it before redefining with new return columns
drop function if exists match_doc_chunks(uuid, vector, integer, double precision);

-- Function returns top chunk matches within an org, joined with basic document metadata
create or replace function match_doc_chunks(
  p_org_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 20,
  p_similarity_threshold double precision default 0.0
)
returns table (
  doc_id uuid,
  chunk_id uuid,
  chunk_index int,
  content text,
  page int,
  distance double precision,
  similarity double precision,
  title text,
  filename text,
  doc_type text,
  uploaded_at timestamptz
) as $$
  select
    d.id as doc_id,
    c.id as chunk_id,
    c.chunk_index,
    c.content,
    c.page,
    (c.embedding <=> p_query_embedding) as distance,
    greatest(0, 1 - (c.embedding <=> p_query_embedding)) as similarity,
    d.title,
    d.filename,
    d.type as doc_type,
    d.uploaded_at
  from doc_chunks c
  join documents d on d.id = c.doc_id and d.org_id = p_org_id
  where c.org_id = p_org_id
    and c.embedding is not null
    and (p_similarity_threshold <= 0.0 or greatest(0, 1 - (c.embedding <=> p_query_embedding)) >= p_similarity_threshold)
  order by c.embedding <=> p_query_embedding asc
  limit p_match_count
$$ language sql stable;

-- Optional: hybrid lexical + semantic (commented example)
-- You can later union this with a trigram-based lexical query over documents for hybrid search.
