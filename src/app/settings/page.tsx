"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DATE_FORMAT_STORAGE_KEY, formatAppDateTime } from '@/lib/utils';
import { useSettings } from '@/hooks/use-settings';
import { useAuth } from '@/hooks/use-auth';

import { useEffect } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useSecurity } from '@/hooks/use-security';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import CategoriesManagement from '@/components/categories-management';
import DepartmentCategoriesManagement from '@/components/department-categories-management';
import RolesManagement from '@/components/roles-management';
import TeamsManagement from '@/components/teams-management-new';
import UsersManagement from '@/components/users-management';
import OverridesManagement from '@/components/overrides-management';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ACCENT_COLORS = [
  'default','red','rose','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink'
];

export default function SettingsPage() {
  const { user, bootstrapData, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const isTeamLead = user?.role === 'teamLead';
  const canManageOrgMembers = bootstrapData?.permissions?.['org.manage_members'] === true;
  const { isAuthenticated } = useAuth();

  const { toast } = useToast();
  
  // Loading states for different sections
  const [organizationLoading, setOrganizationLoading] = React.useState(true);
  const [teamsLoading, setTeamsLoading] = React.useState(true);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [securityLoading, setSecurityLoading] = React.useState(true);


  // Load organization settings including categories
  useEffect(() => {
    if (!isAuthenticated) {
      setOrganizationLoading(false);
      return;
    }
    if (!isAdmin) {
      setOrganizationLoading(false);
      return;
    }
    (async () => {
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) {
          setOrganizationLoading(false);
          return;
        }
        const orgSettings = await apiFetch<any>(`/orgs/${orgId}/settings`);
        setCategories(orgSettings.categories || []);
      } catch {
        // Handle error silently
      } finally {
        setOrganizationLoading(false);
      }
    })();
  }, [isAuthenticated, isAdmin]);
  const { policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp } = useSecurity();
  const { settings: personalSettings, updateSettings: updatePersonalSettings } = useSettings();
  const [categories, setCategories] = React.useState<string[]>([]);
  
  // Optimistic updates with error handling and rollback
  const applyColor = async (value: string) => {
    const previousColor = personalSettings.accent_color;
    try {
      // Optimistically update UI immediately
      await updatePersonalSettings({ accent_color: value });
    } catch (error: any) {
      // If update fails, show error but don't rollback UI since useSettings handles this
      toast({
        title: 'Failed to update accent color',
        description: error?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  const onToggleDarkMode = async (enabled: boolean) => {
    const previousMode = personalSettings.dark_mode;
    try {
      await updatePersonalSettings({ dark_mode: enabled });
    } catch (error: any) {
      toast({
        title: 'Failed to update theme',
        description: error?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };



  // Track real loading states based on authentication and data availability
  React.useEffect(() => {
    if (!isAuthenticated) {
      setTeamsLoading(false);
      setUsersLoading(false);
      setSecurityLoading(false);
      return;
    }

    // Set initial loading states
    if (isTeamLead || isAdmin) {
      setTeamsLoading(true);
    }
    if (canManageOrgMembers) {
      setUsersLoading(true);
    }
    if (isAdmin) {
      setOrganizationLoading(true);
      setSecurityLoading(true);
    }

    // These will be set to false when the actual components load their data
    // For now, set reasonable timeouts for initial load
    const teamsTimer = (isTeamLead || isAdmin) ? setTimeout(() => setTeamsLoading(false), 1000) : null;
    const usersTimer = canManageOrgMembers ? setTimeout(() => setUsersLoading(false), 1200) : null;
    const organizationTimer = isAdmin ? setTimeout(() => setOrganizationLoading(false), 900) : null;
    const securityTimer = isAdmin ? setTimeout(() => setSecurityLoading(false), 800) : null;

    return () => {
      if (teamsTimer) clearTimeout(teamsTimer);
      if (usersTimer) clearTimeout(usersTimer);
      if (organizationTimer) clearTimeout(organizationTimer);
      if (securityTimer) clearTimeout(securityTimer);
    };
  }, [isAuthenticated, isAdmin, isTeamLead, canManageOrgMembers]);

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Appearance, chat, and access controls"
          sticky
          icon={<SettingsIcon className="h-5 w-5" />}
        />
        <div className="px-4 md:px-6">
        <Tabs defaultValue="appearance" className="space-y-6">
        <TabsList>
          <TabsTrigger value="appearance">Personal</TabsTrigger>
          {isAdmin && <TabsTrigger value="general">Organization</TabsTrigger>}
          {(isAdmin || isTeamLead) && <TabsTrigger value="teams">Teams</TabsTrigger>}
          {canManageOrgMembers && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="roles">Access</TabsTrigger>}
          {isAdmin && <TabsTrigger value="security">Security</TabsTrigger>}
        </TabsList>

                {isAdmin && (
        <TabsContent value="general">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Department Categories <Badge variant="outline">Admin Only</Badge></CardTitle>
            <p className="text-sm text-muted-foreground">Manage document categories for each department. Each team can have their own set of categories.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizationLoading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-8 w-1/2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            ) : (
              <DepartmentCategoriesManagement
                departments={bootstrapData?.departments || []}
              />
            )}
          </CardContent>
        </Card>
        </TabsContent>
        )}

        <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Appearance <Badge variant="outline">Personal</Badge></CardTitle>
            <p className="text-sm text-muted-foreground">Personalize the interface. Changes apply immediately for you only.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm mb-2 block">Interface Size</label>
                      <div className="flex items-center gap-2">
                        {(['sm','md','lg'] as const).map(s => (
                          <Button key={s} variant={personalSettings.ui_scale === s ? 'default' : 'outline'} size="sm" onClick={async () => {
                            try {
                              await updatePersonalSettings({ ui_scale: s });
                            } catch (error: any) {
                              toast({
                                title: 'Failed to update interface size',
                                description: error?.message || 'Please try again.',
                                variant: 'destructive'
                              });
                            }
                          }}>
                            {s === 'sm' ? 'Compact' : s === 'md' ? 'Comfort' : 'Roomy'}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Adjust global text size and control heights.</p>
                    </div>
              <div>
                <label className="text-sm mb-2 block">Accent Color</label>
                <div className="grid grid-cols-8 gap-2">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => applyColor(c)}
                      className={`h-7 w-7 rounded-full border ${personalSettings.accent_color===c? 'ring-2 ring-ring': ''}`}
                      title={c}
                      style={{ background: 'hsl(var(--primary))' }}
                      data-color={c}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Used for highlights, buttons, and interactive elements.</p>
              </div>
              <div>
                <label className="text-sm mb-2 block">Theme</label>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">Dark mode</div>
                    <div className="text-xs text-muted-foreground">Dim the UI and reduce glare for low‑light environments.</div>
                  </div>
                  <Switch checked={!!personalSettings.dark_mode} onCheckedChange={onToggleDarkMode} />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="text-sm mb-2 block">Date Format</label>
                <Select value={personalSettings.date_format} onValueChange={async (v) => {
                  try {
                    await updatePersonalSettings({ date_format: v });
                  } catch (error: any) {
                    toast({
                      title: 'Failed to update date format',
                      description: error?.message || 'Please try again.',
                      variant: 'destructive'
                    });
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="d MMM yyyy">12 Jan 2025</SelectItem>
                    <SelectItem value="yyyy-MM-dd">2025-01-12</SelectItem>
                    <SelectItem value="MM/dd/yyyy">01/12/2025</SelectItem>
                    <SelectItem value="d.M.yyyy">12.1.2025</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">Affects how dates are shown across the app. Sample: <span className="font-mono">{formatAppDateTime(new Date())}</span></p>
              </div>
              {/* Preview section removed per requirement */}
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="teams">
          {teamsLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-9 w-28" />
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <TeamsManagement />
          )}
        </TabsContent>

        {canManageOrgMembers && (
          <TabsContent value="users">
            {usersLoading ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-9 w-40" />
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <UsersManagement />
            )}
          </TabsContent>
        )}

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <p className="text-sm text-muted-foreground">Define granular permissions for your organization.</p>
            </CardHeader>
            <CardContent>
              <RolesManagement />
            </CardContent>
          </Card>
          <div className="mt-4" />
          <Card>
            <CardHeader>
              <CardTitle>Advanced: Per‑user Overrides</CardTitle>
              <p className="text-sm text-muted-foreground">Override permissions for a specific user across the organization or within a team. Use sparingly.</p>
            </CardHeader>
            <CardContent>
              <OverridesManagement />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
        <TabsContent value="security">
          {securityLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="h-9 w-16" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                  <div className="border rounded divide-y">
                    {[1, 2].map(i => (
                      <div key={i} className="flex items-center justify-between p-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">IP Allowlist <Badge variant="outline">Org‑wide</Badge></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="text-sm">
                    <div className="font-medium">Enforce allowlist</div>
                    <div className="text-xs text-muted-foreground">Only listed IPs can access the org endpoints when enabled.</div>
                  </div>
                  <Switch checked={policy.enabled} onCheckedChange={(v) => setEnabled(!!v)} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Allowed IPs</div>
                  <div className="flex gap-2 flex-wrap items-end">
                    <Input id="ipAdd2" placeholder="e.g., 203.0.113.10" className="w-64" />
                    <Button onClick={async () => {
                      const el = document.getElementById('ipAdd2') as HTMLInputElement | null;
                      if (!el) return;
                      const v = el.value.trim();
                      if (!v) return;
                      try {
                        await addIp(v);
                      el.value = '';
                      } catch (error: any) {
                        toast({
                          title: 'Invalid IP Address',
                          description: error.message || 'Please enter a valid IP address.',
                          variant: 'destructive'
                        });
                      }
                    }}>Add</Button>
                    <Button variant="outline" onClick={async () => {
                      try {
                      const ip = await getCurrentIp();
                        if (ip) {
                          await addIp(ip);
                        }
                      } catch (error: any) {
                        toast({
                          title: 'Error Getting IP',
                          description: error.message || 'Could not retrieve your current IP address.',
                          variant: 'destructive'
                        });
                      }
                    }}>Use my IP</Button>
                  </div>
                  <div className="rounded-md border divide-y">
                    {policy.ips.map(ip => (
                      <div key={ip} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-mono">{ip}</span>
                        <Button size="sm" variant="outline" onClick={() => removeIp(ip)}>Remove</Button>
                      </div>
                    ))}
                    {policy.ips.length === 0 && <div className="p-3 text-xs text-muted-foreground">No IPs added.</div>}
                  </div>
                  <div className="pt-2">
                    <label className="text-xs text-muted-foreground">Bulk replace (one per line)</label>
                    <textarea className="mt-1 w-full rounded-md border bg-background p-2 text-sm" rows={4} placeholder="203.0.113.5\n2001:db8::1" id="bulk-ips-settings" />
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="outline" onClick={async ()=>{
                        const ta = document.getElementById('bulk-ips-settings') as HTMLTextAreaElement | null;
                        if (!ta) return;
                        const ips = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
                        try {
                          await replaceIps(ips);
                          ta.value = '';
                        } catch (error: any) {
                          toast({
                            title: 'Invalid IP Addresses',
                            description: error.message || 'One or more IP addresses are invalid.',
                            variant: 'destructive'
                          });
                        }
                      }}>Replace</Button>
                      <p className="text-xs text-muted-foreground">This overwrites the list above.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        
        
        </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
