"use client";
import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Users, FileText, Folder } from 'lucide-react';

type Overview = { totals: { orgs: number; documents: number; orgUsers: number }; recentOps: any[]; recentActivity: any[] };

export default function OpsConsolePage() {
  const [whoami, setWhoami] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ov, setOv] = useState<Overview | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const w = await apiFetch('/ops/whoami');
        setWhoami(w);
        const overview = await apiFetch<Overview>('/ops/simple-overview');
        setOv(overview || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SimpleOpsLayout><PageHeader title="Ops Console" /><div className="p-6">Loading…</div></SimpleOpsLayout>;
  if (error) return <SimpleOpsLayout><PageHeader title="Ops Console" /><div className="p-6 text-red-600">{error}</div></SimpleOpsLayout>;

  if (!whoami?.platformAdmin) {
    return (
      <SimpleOpsLayout>
        <PageHeader title="Ops Console" backHref="/dashboard" backLabel="Back to Dashboard" />
        <div className="p-6 text-yellow-700">Forbidden: You are not a platform admin.</div>
      </SimpleOpsLayout>
    );
  }

  return (
    <SimpleOpsLayout>
      <PageHeader title="Ops Dashboard" backHref="/dashboard" backLabel="Back to Dashboard" />
      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Folder className="h-4 w-4" /> Teams</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">—</CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <a 
              href="/ops/orgs" 
              className="border rounded-lg p-4 hover:bg-muted transition-colors flex-1 text-center"
            >
              <Folder className="h-6 w-6 mx-auto mb-2" />
              <div className="font-medium">View Organizations</div>
              <div className="text-sm text-muted-foreground">Detailed org statistics</div>
            </a>
            <a 
              href="/ops/new" 
              className="border rounded-lg p-4 hover:bg-muted transition-colors flex-1 text-center"
            >
              <LayoutDashboard className="h-6 w-6 mx-auto mb-2" />
              <div className="font-medium">Create Organization</div>
              <div className="text-sm text-muted-foreground">Set up a new org</div>
            </a>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Recent Ops Actions</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Time</th><th className="p-2">Type</th><th className="p-2">Org</th><th className="p-2">Actor</th><th className="p-2">Note</th></tr></thead>
                  <tbody>
                    {(ov?.recentOps || []).slice(0, 5).map((e, i) => (
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
                    {(ov?.recentActivity || []).slice(0, 5).map((e, i) => (
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
      </div>
    </SimpleOpsLayout>
  );
}
