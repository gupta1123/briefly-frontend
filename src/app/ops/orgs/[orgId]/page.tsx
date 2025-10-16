"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader as DHeader, DialogTitle as DTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AlertTriangle, Info, CheckCircle2, Wrench } from 'lucide-react';

type Diagnostic = { id: string; severity: 'error'|'warn'|'info'; title: string; details?: any };
type OrgDiag = { orgId: string; summary: { teams: number; users: number; documents: number; overrides: number }; diagnostics: Diagnostic[] };

export default function OrgOpsPage() {
  const params = useParams();
  let orgId = String(params?.orgId || '');
  if (!orgId && typeof window !== 'undefined') {
    const parts = window.location.pathname.split('/');
    const idx = parts.findIndex((p) => p === 'orgs');
    if (idx !== -1 && parts[idx + 1]) orgId = parts[idx + 1];
  }
  const [data, setData] = useState<OrgDiag | null>(null);
  const [roles, setRoles] = useState<any[] | null>(null);
  const [teams, setTeams] = useState<any[] | null>(null);
  const [overrides, setOverrides] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [newAdmin, setNewAdmin] = useState('');
  const [leadInputs, setLeadInputs] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: '', role: 'member', deptId: '', deptRole: 'member', password: '' });
  const [newTeam, setNewTeam] = useState({ name: '', leadEmail: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const d = await apiFetch<OrgDiag>(`/ops/orgs/${orgId}`);
      setData(d);
      const r = await apiFetch<any[]>(`/ops/orgs/${orgId}/roles`);
      setRoles(r || []);
      const t = await apiFetch<any[]>(`/ops/orgs/${orgId}/teams`);
      setTeams(t || []);
      const ov = await apiFetch<any[]>(`/ops/orgs/${orgId}/overrides`);
      setOverrides(ov || []);
      const us = await apiFetch<any[]>(`/ops/orgs/${orgId}/users`);
      setUsers(us || []);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (orgId) void load(); }, [orgId]);

  const fixSeedRoles = async () => {
    try { await apiFetch(`/ops/fix/${orgId}/seed-roles`, { method: 'POST' }); setMsg('Seeded roles.'); await load(); } catch (e:any) { setMsg(e?.message || 'Fix failed'); }
  };
  const fixCoreTeam = async () => {
    try { await apiFetch(`/ops/fix/${orgId}/core-team`, { method: 'POST' }); setMsg('Ensured Core team.'); await load(); } catch (e:any) { setMsg(e?.message || 'Fix failed'); }
  };
  const fixRoleDrift = async () => {
    try { await apiFetch(`/ops/fix/${orgId}/role-drift`, { method: 'POST' }); setMsg('Fixed role drift.'); await load(); } catch (e:any) { setMsg(e?.message || 'Fix failed'); }
  };
  const fixMembership = async () => {
    try { await apiFetch(`/ops/fix/${orgId}/membership`, { method: 'POST' }); setMsg('Fixed membership.'); await load(); } catch (e:any) { setMsg(e?.message || 'Fix failed'); }
  };

  const grouped = useMemo(() => {
    const errors = (data?.diagnostics || []).filter(d => d.severity === 'error');
    const warns = (data?.diagnostics || []).filter(d => d.severity === 'warn');
    const infos = (data?.diagnostics || []).filter(d => d.severity === 'info');
    return { errors, warns, infos };
  }, [data]);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policySQL, setPolicySQL] = useState<string>('');
  const openPolicySQL = async () => {
    try {
      const res = await apiFetch<{ sql: string }>(`/ops/fix/${orgId}/policies/sql`);
      setPolicySQL(res?.sql || '');
      setPolicyOpen(true);
    } catch (e: any) {
      alert(e?.message || 'Failed to load SQL');
    }
  };

  function FixButton({ diagId }: { diagId: string }) {
    const map: Record<string, { label: string; onClick: () => void; disabled?: boolean } | undefined> = {
      missing_roles: { label: 'Seed Roles', onClick: fixSeedRoles },
      role_drift: { label: 'Fix Role Drift', onClick: fixRoleDrift },
      core_missing: { label: 'Ensure Core Team', onClick: fixCoreTeam },
      core_leads: { label: 'Ensure Core Leads', onClick: fixCoreTeam },
      membership_inconsistency: { label: 'Fix Membership', onClick: fixMembership },
      policy_snapshot: { label: 'Align Policies (soon)', onClick: () => {}, disabled: true },
    };
    const cfg = map[diagId];
    if (!cfg) return null;
    return (
      <button
        className={`inline-flex items-center gap-1 border px-2 py-1 rounded text-xs ${cfg.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={cfg.onClick}
        disabled={cfg.disabled}
        title={cfg.disabled ? 'Coming soon' : cfg.label}
      >
        <Wrench className="h-3 w-3" /> {cfg.label}
      </button>
    );
  }

  if (loading) return <AppLayout><PageHeader title="Org Diagnostics" backHref="/ops" backLabel="Back to Ops" /><div className="p-6">Loading…</div></AppLayout>;
  if (msg) return <AppLayout><PageHeader title="Org Diagnostics" backHref="/ops" backLabel="Back to Ops" /><div className="p-6 text-red-600">{msg}</div></AppLayout>;
  if (!data) return <AppLayout><PageHeader title="Org Diagnostics" backHref="/ops" backLabel="Back to Ops" /><div className="p-6">No data (orgId: {orgId || 'unknown'})</div></AppLayout>;

  return (
    <>
    <AppLayout>
      <PageHeader title="Org Diagnostics" backHref="/ops" backLabel="Back to Ops" meta={<span className="text-xs">Org: {data.orgId}</span>} />
      <div className="px-4 md:px-6 py-4 space-y-6">
        {msg && <div className="text-sm text-blue-700">{msg}</div>}

        {/* Status & Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {grouped.errors.length > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : grouped.warns.length > 0 ? (
                  <Info className="h-5 w-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
                <span>
                  Status: {grouped.errors.length > 0 ? 'Needs Attention' : grouped.warns.length > 0 ? 'Minor Issues' : 'Healthy'}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">Errors: {grouped.errors.length} • Warnings: {grouped.warns.length} • Info: {grouped.infos.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <div className="font-semibold">Seed Roles</div>
                <div className="text-xs text-muted-foreground mt-1">Why: Org is missing default roles or matrices are empty.<br/>What: Upserts the core roles (orgAdmin, contentManager, teamLead, member, contentViewer) with sane permissions.<br/>Safe: Idempotent.</div>
                <div className="mt-2"><button className="border px-3 py-1 rounded" onClick={fixSeedRoles}>Run</button></div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold">Ensure Core Team</div>
                <div className="text-xs text-muted-foreground mt-1">Why: Admin-only docs live in Core; orgAdmins should be Core leads.<br/>What: Creates Core department if missing and makes all orgAdmins its leads.<br/>Safe: Idempotent.</div>
                <div className="mt-2"><button className="border px-3 py-1 rounded" onClick={fixCoreTeam}>Run</button></div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold">Fix Role Drift</div>
                <div className="text-xs text-muted-foreground mt-1">Why: teamLead/member lost required document permissions.<br/>What: Ensures documents.* + storage/upload + search/semantic are true (bulk_delete remains false for member).<br/>Safe: Idempotent.</div>
                <div className="mt-2"><button className="border px-3 py-1 rounded" onClick={fixRoleDrift}>Run</button></div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold">Fix Membership</div>
                <div className="text-xs text-muted-foreground mt-1">Why: Users in teams but not in the org cause RLS errors.<br/>What: Adds missing organization_users rows (role=member) for department_users entries.<br/>Safe: Idempotent.</div>
                <div className="mt-2"><button className="border px-3 py-1 rounded" onClick={fixMembership}>Run</button></div>
              </div>
              <div className="border rounded p-3 md:col-span-2">
                <div className="font-semibold">Align Policies (coming soon)</div>
                <div className="text-xs text-muted-foreground mt-1">Why: Ensure documents policies match the chosen model (membership-first + backend overrides).<br/>What: Provides a SQL script to rewrite INSERT/UPDATE/DELETE policies safely.<br/>How: Copy and run in SQL editor (requires elevated DB privileges).</div>
                <div className="mt-2"><button className="border px-3 py-1 rounded" onClick={openPolicySQL}>Preview SQL</button></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm">Teams: {data.summary.teams}</div>
              <div className="text-sm">Users: {data.summary.users}</div>
              <div className="text-sm">Documents: {data.summary.documents}</div>
              <div className="text-sm">Overrides: {data.summary.overrides}</div>
              <div className="mt-3">
                <h3 className="font-semibold">Teams</h3>
                <div className="text-xs text-muted-foreground">Manage leads: paste userId and set lead.</div>
                <div className="mt-2 space-y-2">
                  {(teams || []).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <div className="w-40 truncate" title={t.name}>{t.name}</div>
                      <div className="text-xs text-muted-foreground">Lead: {t.leadUserId || '—'}</div>
                      <input className="border rounded px-2 py-1 text-xs" placeholder="userId" value={leadInputs[t.id] || ''} onChange={e => setLeadInputs({ ...leadInputs, [t.id]: e.target.value })} />
                      <button className="border px-2 py-1 rounded text-xs" onClick={async () => {
                        const uid = (leadInputs[t.id] || '').trim();
                        if (!uid) { alert('Enter userId'); return; }
                        try {
                          await apiFetch(`/ops/orgs/${data.orgId}/teams/${t.id}/leads`, { method: 'POST', body: { userId: uid } });
                          setMsg('Team lead set');
                          await load();
                        } catch (e: any) { alert(e?.message || 'Failed'); }
                      }}>Set Lead</button>
                      <div className="text-xs text-muted-foreground ml-auto">Members: {t.members}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Issues & Checks</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {grouped.errors.length === 0 && grouped.warns.length === 0 && (
                <div className="text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> No issues detected.
                </div>
              )}
              {(['error','warn','info'] as const).map((sev) => {
                const list = sev === 'error' ? grouped.errors : sev === 'warn' ? grouped.warns : grouped.infos;
                if (list.length === 0) return null;
                return (
                  <div key={sev}>
                    <div className="text-sm font-semibold mb-2 capitalize">{sev === 'error' ? 'Errors' : sev === 'warn' ? 'Warnings' : 'Info'}</div>
                    <ul className="space-y-2">
                      {list.map((d) => (
                        <li key={d.id} className="border rounded p-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className={`uppercase text-xs mr-2 ${sev === 'error' ? 'text-red-600' : sev === 'warn' ? 'text-amber-600' : 'text-blue-600'}`}>{d.severity}</span>
                              {d.title}
                            </div>
                            <FixButton diagId={d.id} />
                          </div>
                          {d.details && (
                            <pre className="mt-1 text-xs bg-muted/40 p-2 rounded overflow-x-auto">{JSON.stringify(d.details, null, 2)}</pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Key</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">isSystem</th>
                    <th className="p-2">permissions (editable JSON)</th>
                    <th className="p-2">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {(roles || []).map((r) => (
                    <RoleRow key={r.key} orgId={data.orgId} row={r} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Overrides</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">User</th>
                      <th className="p-2">Dept</th>
                      <th className="p-2">Permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overrides || []).map((o, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{o.user_id}</td>
                        <td className="p-2">{o.department_id || 'org-wide'}</td>
                        <td className="p-2"><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(o.permissions, null, 2)}</pre></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>RLS Simulator</CardTitle></CardHeader>
            <CardContent>
              <RlsSimulator orgId={data.orgId} teams={teams || []} users={users || []} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">Users <span className="text-xs font-normal text-muted-foreground">Invite/Add</span></CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">Invite/Add by Email</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <input className="border rounded px-2 py-1" placeholder="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} />
                  <input className="border rounded px-2 py-1" type="password" placeholder="password (optional)" value={invite.password} onChange={e => setInvite({ ...invite, password: e.target.value })} />
                  <select className="border rounded px-2 py-1" value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}>
                    <option value="member">member</option>
                    <option value="teamLead">teamLead</option>
                    <option value="orgAdmin">orgAdmin</option>
                  </select>
                  <select className="border rounded px-2 py-1" value={invite.deptId} onChange={e => setInvite({ ...invite, deptId: e.target.value })}>
                    <option value="">(no team)</option>
                    {(teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select className="border rounded px-2 py-1" value={invite.deptRole} onChange={e => setInvite({ ...invite, deptRole: e.target.value })}>
                    <option value="member">team member</option>
                    <option value="lead">team lead</option>
                  </select>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {invite.password ? 'User will be created with this password (no email sent)' : 'User will receive an email invitation to set their password'}
                </div>
                <div className="mt-2">
                  <button 
                    className="border px-3 py-1 rounded" 
                    onClick={async () => {
                      if (!invite.email.includes('@')) { 
                        alert('Enter valid email'); 
                        return; 
                      }
                      try {
                        const response: any = await apiFetch(`/ops/orgs/${data.orgId}/users/invite`, { 
                          method: 'POST', 
                          body: { 
                            email: invite.email, 
                            role: invite.role, 
                            departmentId: invite.deptId || undefined, 
                            deptRole: invite.deptRole, 
                            password: invite.password || undefined 
                          } 
                        });
                        if (response.userWasCreated) {
                          setMsg('User created with password - no email sent');
                        } else {
                          setMsg('User invited via email to set password');
                        }
                        setInvite({ email: '', role: 'member', deptId: '', deptRole: 'member', password: '' }); 
                        await load();
                      } catch (e: any) { 
                        alert(e?.message || 'Failed'); 
                      }
                    }}
                  >
                    Invite/Add
                  </button>
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">Create Team</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <input className="border rounded px-2 py-1" placeholder="team name" value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} />
                  <input className="border rounded px-2 py-1" placeholder="lead email (optional)" value={newTeam.leadEmail} onChange={e => setNewTeam({ ...newTeam, leadEmail: e.target.value })} />
                </div>
                <div className="mt-2">
                  <button className="border px-3 py-1 rounded" onClick={async () => {
                    if (newTeam.name.trim().length < 2) { alert('Enter team name'); return; }
                    try {
                      await apiFetch(`/ops/orgs/${data.orgId}/teams`, { method: 'POST', body: { name: newTeam.name, leadEmail: newTeam.leadEmail || undefined } });
                      setMsg('Team created'); setNewTeam({ name: '', leadEmail: '' }); await load();
                    } catch (e: any) { alert(e?.message || 'Failed'); }
                  }}>Create</button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">User</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Teams</th>
                    <th className="p-2">Reset Password</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((u) => (
                    <UserRow key={u.userId} orgId={data.orgId} user={u} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
    <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
      <DialogContent className="max-w-3xl">
        <DHeader>
          <DTitle>Align Policies — SQL Preview</DTitle>
        </DHeader>
        <div className="text-sm text-muted-foreground">Copy and run this in your SQL editor to align the documents policies.</div>
        <pre className="text-xs bg-muted/40 p-2 rounded overflow-x-auto max-h-[60vh]">{policySQL}</pre>
        <div className="text-xs text-muted-foreground">This is idempotent and safe; it recreates or alters policies to the membership-first model with admin bypass.</div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function RoleRow({ orgId, row, onSaved }: { orgId: string; row: any; onSaved: () => void }) {
  const [json, setJson] = useState(JSON.stringify(row.permissions, null, 2));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      let parsed: any;
      try { parsed = JSON.parse(json); } catch { alert('Invalid JSON'); setSaving(false); return; }
      await apiFetch(`/ops/orgs/${orgId}/roles/${row.key}`, { method: 'PUT', body: { permissions: parsed } });
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <tr className="border-b align-top">
      <td className="p-2">{row.key}</td>
      <td className="p-2">{row.name}</td>
      <td className="p-2">{String(row.is_system)}</td>
      <td className="p-2 w-[520px]"><textarea className="w-full h-40 text-xs p-2 border rounded" value={json} onChange={e => setJson(e.target.value)} /></td>
      <td className="p-2"><button className="border px-3 py-1 rounded" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></td>
    </tr>
  );
}

function RlsSimulator({ orgId, teams, users }: { orgId: string; teams: any[]; users: any[] }) {
  const [userId, setUserId] = useState(users[0]?.userId || '');
  const [dept, setDept] = useState(teams[0]?.id || '');
  const [action, setAction] = useState<'create'|'update'|'delete'|'read'>('create');
  const [result, setResult] = useState<any | null>(null);
  const simulate = async () => {
    try {
      const r = await apiFetch(`/ops/orgs/${orgId}/rls-simulate?userId=${encodeURIComponent(userId)}&action=${encodeURIComponent(action)}&departmentId=${encodeURIComponent(dept)}`);
      setResult(r);
    } catch (e: any) {
      alert(e?.message || 'Simulation failed');
    }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select className="border rounded px-2 py-1" value={userId} onChange={e => setUserId(e.target.value)}>
          {(users || []).map(u => <option key={u.userId} value={u.userId}>{u.displayName || u.userId}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={dept} onChange={e => setDept(e.target.value)}>
          {(teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={action} onChange={e => setAction(e.target.value as any)}>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="read">Read</option>
        </select>
        <button className="border px-3 py-1 rounded" onClick={simulate}>Simulate</button>
      </div>
      {result && (
        <div className="text-xs bg-muted/40 p-2 rounded">
          <div>Role: {result.role || 'n/a'}</div>
          <div>Org member: {String(result.isMember)}</div>
          <div>Dept member: {String(result.isDeptMember)}</div>
          <div>Needs: {result.needKey} → Has: {String(result.hasPerm)}</div>
        </div>
      )}
    </div>
  );
}

function UserRow({ orgId, user }: { orgId: string; user: any }) {
  const [pwd, setPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const reset = async () => {
    if (pwd.length < 8) { alert('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await apiFetch(`/ops/users/${user.userId}/password`, { method: 'POST', body: { newPassword: pwd } });
      setPwd('');
      alert('Password updated');
    } catch (e: any) {
      alert(e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <tr className="border-b align-top">
      <td className="p-2">{user.displayName || user.userId}</td>
      <td className="p-2">{user.role}</td>
      <td className="p-2 text-xs">{(user.departments || []).map((d:any) => d.departmentId).join(', ') || '—'}</td>
      <td className="p-2">
        <div className="flex gap-2 items-center">
          <input className="border rounded px-2 py-1 text-xs" type="password" placeholder="New password" value={pwd} onChange={e => setPwd(e.target.value)} />
          <button className="border px-3 py-1 rounded" onClick={reset} disabled={saving}>{saving ? 'Saving…' : 'Set'}</button>
        </div>
      </td>
    </tr>
  );
}
