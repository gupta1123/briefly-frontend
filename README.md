# Briefly – Next.js + Fastify + Supabase

Production-ready document management with AI. Frontend: Next.js App Router. Backend: Fastify. Database/Auth/Storage: Supabase.

Quick start:
- Frontend: set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `npm i && npm run dev`.
- Backend (`server/`): set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, optional `GEMINI_API_KEY`; `npm i && npm run dev`.
- Database: run `docs/supabase_schema.sql` and `docs/supabase_policies.sql` in Supabase SQL editor. Create buckets: `documents`, `previews`, `extractions`.

Auth: Users sign in with Supabase Auth (email/password). Backend enforces RLS using the end-user JWT.
