"use client";
import React, { useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

export default function NewOrgPage() {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      const res = await apiFetch('/ops/orgs', { method: 'POST', body: { name } });
      setMsg('Organization created. Redirecting…');
      setTimeout(() => { window.location.href = `/ops/orgs/${(res as any)?.id}`; }, 800);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to create org');
    } finally {
      setCreating(false);
    }
  };
  return (
    <AppLayout>
      <PageHeader title="Create Organization" backHref="/ops" backLabel="Back to Ops" />
      <div className="px-4 md:px-6 py-4">
        <Card>
          <CardHeader><CardTitle>New Organization</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input className="border rounded px-3 py-2 w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div className="text-xs text-muted-foreground">This will seed default roles and ensure a Core team; you will be added as orgAdmin.</div>
              <div>
                <button className="border px-4 py-2 rounded" disabled={creating || name.trim().length < 2}>{creating ? 'Creating…' : 'Create'}</button>
              </div>
              {msg && <div className="text-sm">{msg}</div>}
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

