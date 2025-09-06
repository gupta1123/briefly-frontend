"use client";
import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Users, FileText, Wrench } from 'lucide-react';

type OrgRow = { orgId: string; name: string; teams: number; users: number; documents: number; overrides: number };
type Overview = { totals: { orgs: number; documents: number; orgUsers: number }; recentOps: any[]; recentActivity: any[] };

export default function OpsConsolePage() {
  const [whoami, setWhoami] = useState<any>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ov, setOv] = useState<Overview | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const w = await apiFetch('/ops/whoami');
        setWhoami(w);
        const list = await apiFetch<OrgRow[]>('/ops/orgs');
        setOrgs(list || []);
        const overview = await apiFetch<Overview>('/ops/overview');
        setOv(overview || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <AppLayout><PageHeader title="Ops Console" /><div className="p-6">Loading…</div></AppLayout>;
  if (error) return <AppLayout><PageHeader title="Ops Console" /><div className="p-6 text-red-600">{error}</div></AppLayout>;

  if (!whoami?.platformAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Ops Console" backHref="/dashboard" backLabel="Back to Dashboard" />
        <div className="p-6 text-yellow-700">Forbidden: You are not a platform admin.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Ops Dashboard" backHref="/dashboard" backLabel="Back to Dashboard" />
      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /> Organizations</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{ov?.totals.orgs ?? '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Org Users</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{ov?.totals.orgUsers ?? '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{ov?.totals.documents ?? '—'}</CardContent>
          </Card>
        </div>

        {/* Recent Ops */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Recent Ops Actions</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Time</th><th className="p-2">Type</th><th className="p-2">Org</th><th className="p-2">Actor</th><th className="p-2">Note</th></tr></thead>
                  <tbody>
                    {(ov?.recentOps || []).map((e, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2 text-xs">{new Date(e.ts).toLocaleString()}</td>
                        <td className="p-2">{e.type}</td>
                        <td className="p-2 text-xs">{e.org_id || '—'}</td>
                        <td className="p-2 text-xs">{e.actor_user_id || '—'}</td>
                        <td className="p-2 text-xs">{e.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Time</th><th className="p-2">Type</th><th className="p-2">Org</th><th className="p-2">Actor</th><th className="p-2">Note</th></tr></thead>
                  <tbody>
                    {(ov?.recentActivity || []).map((e, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2 text-xs">{new Date(e.ts).toLocaleString()}</td>
                        <td className="p-2">{e.type}</td>
                        <td className="p-2 text-xs">{e.org_id || '—'}</td>
                        <td className="p-2 text-xs">{e.actor_user_id || '—'}</td>
                        <td className="p-2 text-xs">{e.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orgs table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Organizations</span>
              <a className="text-sm text-primary hover:underline" href="/ops/new">+ Create Org</a>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Name</th>
                    <th className="p-2">Teams</th>
                    <th className="p-2">Users</th>
                    <th className="p-2">Docs</th>
                    <th className="p-2">Overrides</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.orgId} className="border-b hover:bg-muted/30">
                      <td className="p-2">{o.name}</td>
                      <td className="p-2">{o.teams}</td>
                      <td className="p-2">{o.users}</td>
                      <td className="p-2">{o.documents}</td>
                      <td className="p-2">{o.overrides}</td>
                      <td className="p-2">
                        <a className="text-primary hover:underline" href={`/ops/orgs/${o.orgId}`}>View</a>
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
