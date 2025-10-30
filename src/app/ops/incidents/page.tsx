"use client";
import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

type OrgSummary = { orgId: string; name: string };
type Incident = { id: string; org_id: string | null; type: string; ts: string; actor_user_id: string | null; note: string | null; doc_id?: string | null };

export default function IncidentsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [type, setType] = useState<string>('all');
  const [since, setSince] = useState<string>('7');
  const [rows, setRows] = useState<Incident[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    try {
      const list = await apiFetch<any[]>('/ops/orgs');
      setOrgs((list || []).map(o => ({ orgId: o.orgId, name: o.name })));
      const url = `/ops/incidents?${new URLSearchParams({ orgId: selectedOrg, type, since }).toString()}`;
      const incs = await apiFetch<Incident[]>(url);
      setRows(incs || []);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load incidents');
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { void load(); }, [selectedOrg, type, since]);

  const retryIngest = async (orgId: string, docId: string) => {
    try {
      await apiFetch(`/ops/incidents/retry-ingest`, { method: 'POST', body: { orgId, docId } });
      alert('Reingest triggered');
    } catch (e: any) {
      alert(e?.message || 'Failed to trigger reingest');
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Incidents" backHref="/ops" backLabel="Back to Ops" />
      <div className="px-4 md:px-6 py-4 space-y-4">
        <Card>
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select className="border rounded px-2 py-1" value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)}>
                <option value="">All Orgs</option>
                {orgs.map(o => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
              </select>
              <select className="border rounded px-2 py-1" value={type} onChange={e => setType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="server.5xx">Server 5xx</option>
                <option value="rls.denied">RLS Denials</option>
                <option value="ingest.error">Ingestion Failures</option>
                <option value="ip.blocked">IP Blocked</option>
              </select>
              <select className="border rounded px-2 py-1" value={since} onChange={e => setSince(e.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {msg && <div className="text-sm text-red-600">{msg}</div>}

        <Card>
          <CardHeader><CardTitle>Incidents</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">Time</th><th className="p-2">Type</th><th className="p-2">Org</th><th className="p-2">Actor</th><th className="p-2">Doc</th><th className="p-2">Note</th><th className="p-2">Action</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 text-xs">{new Date(r.ts).toLocaleString()}</td>
                      <td className="p-2">{r.type}</td>
                      <td className="p-2 text-xs">{r.org_id || '—'}</td>
                      <td className="p-2 text-xs">{r.actor_user_id || '—'}</td>
                      <td className="p-2 text-xs">{r.doc_id || '—'}</td>
                      <td className="p-2 text-xs">{r.note || '—'}</td>
                      <td className="p-2">
                        {r.type === 'ingest.error' && r.org_id && r.doc_id ? (
                          <button className="border px-2 py-1 rounded text-xs" onClick={() => retryIngest(r.org_id!, (r.doc_id as any))}>Retry</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

