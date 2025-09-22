"use client";

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, RotateCcw } from 'lucide-react';

type BinDoc = {
  id: string;
  name: string;
  title?: string | null;
  filename?: string | null;
  deletedAt?: string | null;
  purgeAfter?: string | null;
  departmentId?: string | null;
};

export default function RecycleBinPage() {
  const { isAuthenticated, hasPermission } = useAuth();
  const [items, setItems] = useState<BinDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      const res = await apiFetch<BinDoc[]>(`/orgs/${orgId}/recycle-bin`);
      setItems(res || []);
    } catch (e) {
      console.error('Failed to load recycle bin', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    const handleUpdate = () => refresh();
    window.addEventListener('documentDeleted', handleUpdate);
    window.addEventListener('documentRestored', handleUpdate);
    window.addEventListener('documentPurged', handleUpdate);
    return () => {
      window.removeEventListener('documentDeleted', handleUpdate);
      window.removeEventListener('documentRestored', handleUpdate);
      window.removeEventListener('documentPurged', handleUpdate);
    };
  }, [refresh]);

  const restore = async (id: string) => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/restore`, { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentRestored', { detail: { id } }));
      }
      await refresh();
    } catch (e) { console.error('restore failed', e); } finally { setLoading(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Permanently delete this document? This cannot be undone.')) return;
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/permanent`, { method: 'DELETE' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentPurged', { detail: { id } }));
      }
      await refresh();
    } catch (e) { console.error('permanent delete failed', e); } finally { setLoading(false); }
  };

  return (
    <AppLayout title="Recycle Bin" subtitle="Documents scheduled for purge in 7 days">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Trashed Documents</h2>
          <Button variant="secondary" onClick={refresh} disabled={loading}>Refresh</Button>
        </div>
        {items.length === 0 && (
          <p className="text-muted-foreground">No trashed documents.</p>
        )}
        <div className="grid gap-3">
          {items.map((d) => (
            <Card key={d.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.title || d.filename || d.name || d.id}</div>
                <div className="text-sm text-muted-foreground">Purge at: {d.purgeAfter || '—'}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => restore(d.id)} disabled={loading}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Restore
                </Button>
                {hasPermission('documents.delete') && (
                  <Button size="sm" variant="destructive" onClick={() => del(d.id)} disabled={loading}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
