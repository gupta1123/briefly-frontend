"use client";
import React, { useEffect, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { formatBytes } from '@/lib/utils';

type OrgStats = {
  id: string;
  name: string;
  storageUsed: number;
  teamsCount: number;
  membersCount: number;
  docsUpdated: number;
};

export default function OrgsListPage() {
  const [orgs, setOrgs] = useState<OrgStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const data = await apiFetch<OrgStats[]>('/ops/simple-orgs');
        setOrgs(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgs();
  }, []);

  if (loading) {
    return (
      <SimpleOpsLayout>
        <PageHeader title="Organizations" backHref="/ops" backLabel="Back to Ops" />
        <div className="px-4 md:px-6 py-4">
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading organizations...</div>
            </CardContent>
          </Card>
        </div>
      </SimpleOpsLayout>
    );
  }

  if (error) {
    return (
      <SimpleOpsLayout>
        <PageHeader title="Organizations" backHref="/ops" backLabel="Back to Ops" />
        <div className="px-4 md:px-6 py-4">
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <div className="text-destructive">Error: {error}</div>
            </CardContent>
          </Card>
        </div>
      </SimpleOpsLayout>
    );
  }

  return (
    <SimpleOpsLayout>
      <PageHeader title="Organizations" backHref="/ops" backLabel="Back to Ops" />
      <div className="px-4 md:px-6 py-4">
        <Card>
          <CardHeader>
            <CardTitle>Organization Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Storage Used</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Documents Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>{formatBytes(org.storageUsed)}</TableCell>
                    <TableCell>{org.teamsCount}</TableCell>
                    <TableCell>{org.membersCount}</TableCell>
                    <TableCell>{org.docsUpdated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </SimpleOpsLayout>
  );
}