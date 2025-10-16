"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type AuditEvent = {
  id: string;
  ts: number; // timestamp ms
  actor: string; // username or 'system' (we will map to email if available)
  type: 'login' | 'create' | 'edit' | 'delete' | 'move' | 'link' | 'unlink' | 'versionSet';
  docId?: string;
  title?: string;
  path?: string; // for move
  note?: string; // short note like 'metadata updated'
  actorEmail?: string | null;
  actorRole?: string | null;
};

type AuditContextValue = {
  events: AuditEvent[];
  log: (e: Omit<AuditEvent, 'id' | 'ts'> & { ts?: number }) => void;
  clear: () => void;
  includeSelf: boolean;
  setIncludeSelf: (v: boolean) => void;
};

const STORAGE_KEY = 'documind_audit_v1';
const AuditContext = createContext<AuditContextValue | undefined>(undefined);

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [includeSelf, setIncludeSelf] = useState<boolean>(false);

  const fetchServerAudit = useCallback(async () => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;
      const list = await apiFetch<any[]>(`/orgs/${orgId}/audit?limit=200&coalesce=1&excludeSelf=${includeSelf ? '0' : '1'}`);
      const mapped: AuditEvent[] = (list || []).map((r: any) => ({
        id: r.id,
        ts: Date.parse(r.ts),
        actor: r.actor_email || r.actor_user_id || 'system',
        type: r.type,
        docId: r.doc_id || undefined,
        title: r.title || undefined,
        path: Array.isArray(r.path) ? r.path.join('/') : undefined,
        note: r.note || undefined,
        actorEmail: r.actor_email || null,
        actorRole: r.actor_role || null,
      }));
      setEvents(mapped);
    } catch {
      // ignore
    }
  }, [includeSelf]);

  useEffect(() => { void fetchServerAudit(); }, [fetchServerAudit]);
  useEffect(() => {
    const cleanup = onApiContextChange(() => { void fetchServerAudit(); });
    return () => { cleanup(); };
  }, [fetchServerAudit]);

  // No localStorage persistence; rely on backend audit endpoints

  const log = useCallback((e: Omit<AuditEvent, 'id' | 'ts'> & { ts?: number }) => {
    const full: AuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      ts: e.ts ?? Date.now(),
      actor: e.actor,
      type: e.type,
      docId: e.docId,
      title: e.title,
      path: e.path,
      note: e.note,
    };
    setEvents(prev => [full, ...prev].slice(0, 2000)); // simple cap
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  const value = useMemo(() => ({ events, log, clear, includeSelf, setIncludeSelf }), [events, log, clear, includeSelf]);
  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error('useAudit must be used within an AuditProvider');
  return ctx;
}

