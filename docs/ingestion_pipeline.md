# Ingestion Pipeline (OCR, Metadata, Chunks, Embeddings)

This project now runs an ingestion pipeline automatically after each upload finalize.

Flow:
- `POST /orgs/:orgId/uploads/finalize` updates the document row, then triggers `ingestDocument(...)` asynchronously.
- Ingestion downloads the file from the `documents` bucket and builds a data URI.
- Gemini (Genkit) extracts:
  - OCR text
  - Summary, subject, sender/receiver (+ options), documentDate, category, keywords, tags, title
- Extraction JSON is stored in `extractions/<orgId>/<docId>.json`.
- Document metadata is lightly backfilled (only when those fields are blank to avoid stomping user edits).
- The OCR text is chunked (~1.2k chars, 200 overlap) and embedded via OpenAI `text-embedding-3-small` (if `OPENAI_API_KEY` is set).
- Chunks are inserted into `doc_chunks` (replacing prior chunks for that document).

Setup:
- Env in `server/.env`:
  - `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) for Gemini extraction (required)
  - `OPENAI_API_KEY` for embeddings (optional but recommended)
- SQL:
  - Ensure `doc_chunks` exists (already in `supabase_schema.sql`)
  - Create the semantic matcher function: run `frontend/docs/semantic_search.sql`
- Storage buckets: `documents`, `extractions` (auto-created if missing)

Notes:
- If `OPENAI_API_KEY` is not set, chunks are still written without embeddings; semantic search will fallback to lexical.
- Frontend chatbot already prefers semantic snippets when available via `/search/semantic`.

