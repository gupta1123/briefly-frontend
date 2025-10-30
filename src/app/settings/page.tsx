"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Settings as SettingsIcon, Palette, Monitor, Moon, Calendar, Check } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import CategoriesManagement from '@/components/categories-management';
import DepartmentCategoriesManagement from '@/components/department-categories-management';
import PermissionsManagement from '@/components/permissions-management';
import TeamsManagement from '@/components/teams-management-new';
import UsersManagement from '@/components/users-management';
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
  const { user, bootstrapData, isLoading: authLoading, isAuthenticated, refreshPermissions } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const isTeamLead = user?.role === 'teamLead';
  const canManageOrgMembers = bootstrapData?.permissions?.['org.manage_members'] === true;
  const canManageTeamMembers = bootstrapData?.permissions?.['departments.manage_members'] === true;

  const { toast } = useToast();
  
  // Loading states for different sections
  const [organizationLoading, setOrganizationLoading] = React.useState(true);
  const [teamsLoading, setTeamsLoading] = React.useState(true);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [securityLoading, setSecurityLoading] = React.useState(true);
  const [bypassUsers, setBypassUsers] = React.useState<Array<{ userId: string; displayName: string; email?: string | null }>>([]);
  const [bypassGrants, setBypassGrants] = React.useState<any[]>([]);
  const [bypassSelectedUser, setBypassSelectedUser] = React.useState('');
  const [bypassDuration, setBypassDuration] = React.useState<number>(120);
  const [bypassLoading, setBypassLoading] = React.useState(false);
  const [bypassError, setBypassError] = React.useState<string | null>(null);
  const [grantingBypass, setGrantingBypass] = React.useState(false);
  const [revokingGrantId, setRevokingGrantId] = React.useState<string | null>(null);

  const loadBypassData = React.useCallback(async () => {
    if (!isAdmin) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setBypassLoading(true);
    setBypassError(null);
    try {
      const [usersRes, grantsRes] = await Promise.all([
        apiFetch<any[]>(`/orgs/${orgId}/users`),
        apiFetch<any[]>(`/orgs/${orgId}/ip-bypass-grants?active=true`)
      ]);
      const mappedUsers = (usersRes || []).map((u: any) => ({
        userId: u.userId || u.user_id || u.id,
        displayName: u.displayName || u.app_users?.display_name || u.email || 'Unknown User',
        email: u.email || null,
      }));
      setBypassUsers(mappedUsers);
      if (!bypassSelectedUser && mappedUsers.length > 0) {
        setBypassSelectedUser(mappedUsers[0].userId);
      } else if (bypassSelectedUser && !mappedUsers.some(u => u.userId === bypassSelectedUser)) {
        setBypassSelectedUser('');
      }
      setBypassGrants(grantsRes || []);
    } catch (error: any) {
      setBypassError(error?.message || 'Failed to load IP bypass data');
    } finally {
      setBypassLoading(false);
    }
  }, [isAdmin, bypassSelectedUser]);

  const formatRemaining = React.useCallback((expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const mins = minutes % 60;
      return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours ? `${days}d ${remHours}h` : `${days}d`;
  }, []);

  const handleGrantBypass = React.useCallback(async () => {
    if (!bypassSelectedUser || grantingBypass) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) {
      setBypassError('No organization selected');
      return;
    }
    setGrantingBypass(true);
    setBypassError(null);
    try {
      await apiFetch(`/orgs/${orgId}/ip-bypass-grants`, {
        method: 'POST',
        body: {
          userId: bypassSelectedUser,
          durationMinutes: bypassDuration,
        },
      });
      toast({
        title: 'Bypass granted',
        description: 'Temporary IP bypass has been activated.',
      });
      await loadBypassData();
      await refreshPermissions();
    } catch (error: any) {
      setBypassError(error?.message || 'Failed to grant bypass');
    } finally {
      setGrantingBypass(false);
    }
  }, [bypassSelectedUser, grantingBypass, bypassDuration, toast, loadBypassData, refreshPermissions]);

  const handleRevokeGrant = React.useCallback(async (grantId: string) => {
    if (revokingGrantId) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setRevokingGrantId(grantId);
    setBypassError(null);
    try {
      await apiFetch(`/orgs/${orgId}/ip-bypass-grants/${grantId}/revoke`, {
        method: 'POST'
      });
      toast({
        title: 'Bypass revoked',
        description: 'Temporary IP bypass has been removed.',
      });
      await loadBypassData();
      await refreshPermissions();
    } catch (error: any) {
      setBypassError(error?.message || 'Failed to revoke bypass');
    } finally {
      setRevokingGrantId(null);
    }
  }, [revokingGrantId, toast, loadBypassData, refreshPermissions]);


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
  const [summaryPrompt, setSummaryPrompt] = React.useState<string>('');
  const [summaryLoading, setSummaryLoading] = React.useState<boolean>(true);
  
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
  }, [isAuthenticated, isAdmin, isTeamLead, canManageOrgMembers, canManageTeamMembers]);

  React.useEffect(() => {
    if (!isAdmin) return;
    if (securityLoading) return;
    void loadBypassData();
  }, [isAdmin, securityLoading, loadBypassData]);

  // Load org private settings (summary prompt)
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setSummaryLoading(false);
      return;
    }
    (async () => {
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) { setSummaryLoading(false); return; }
        const priv = await apiFetch<any>(`/orgs/${orgId}/private-settings`);
        setSummaryPrompt(priv?.summary_prompt || '');
      } catch {
        // silent
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, [isAuthenticated, isAdmin]);

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6 min-h-0">
        <PageHeader
          title="Settings"
          subtitle="Appearance, chat, and access controls"
          sticky
          icon={<SettingsIcon className="h-5 w-5" />}
        />
        <div className="px-4 md:px-6 min-h-0">
        <Tabs defaultValue="appearance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 overflow-x-auto">
          <TabsTrigger value="appearance" className="text-xs md:text-sm">Personal</TabsTrigger>
          {isAdmin && <TabsTrigger value="general" className="text-xs md:text-sm">Organization</TabsTrigger>}
          {(isAdmin || isTeamLead || canManageTeamMembers) && <TabsTrigger value="teams" className="text-xs md:text-sm">Teams</TabsTrigger>}
          {canManageOrgMembers && <TabsTrigger value="users" className="text-xs md:text-sm">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="permissions" className="text-xs md:text-sm">Permissions</TabsTrigger>}
          {isAdmin && <TabsTrigger value="security" className="text-xs md:text-sm">Security</TabsTrigger>}
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
        <div className="h-4" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">AI Summary Prompt <Badge variant="outline">Admin Only</Badge></CardTitle>
            <p className="text-sm text-muted-foreground">Customize how AI summarizes documents for this organization. Only the summary changes; extracted metadata stays the same.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-32 w-full" />
                <div className="flex justify-end"><Skeleton className="h-9 w-24" /></div>
              </div>
            ) : (
              <>
                <label className="text-sm">Summary prompt</label>
                <textarea
                  className="w-full rounded-md border bg-background p-3 text-sm min-h-[140px]"
                  placeholder="Write a concise summary (<= 300 words) of the document text. Focus on essential facts and outcomes."
                  value={summaryPrompt}
                  onChange={(e) => setSummaryPrompt(e.target.value)}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                    setSummaryPrompt('Write a concise summary (<= 300 words) of the document text. Focus on essential facts and outcomes.');
                  }}>Reset</Button>
                  <Button onClick={async () => {
                    const orgId = getApiContext().orgId || '';
                    if (!orgId) return;
                    try {
                      await apiFetch(`/orgs/${orgId}/private-settings`, { method: 'PUT', body: { summary_prompt: summaryPrompt } });
                      toast({ title: 'Saved', description: 'Summary prompt updated for this org.' });
                    } catch (error: any) {
                      toast({ title: 'Failed to save', description: error?.message || 'Please try again.', variant: 'destructive' });
                    }
                  }}>Save</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </TabsContent>
        )}

        <TabsContent value="appearance">
          <div className="space-y-6">
            {/* Current Settings Overview */}
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Palette className="w-5 h-5" />
                  Current Appearance
                </CardTitle>
                <p className="text-sm text-muted-foreground">Your personalized interface settings</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {personalSettings.ui_scale === 'sm' ? 'Compact' : 'Comfort'}
                    </div>
                    <div className="text-xs text-muted-foreground">Interface Size</div>
                  </div>
                  <div className="text-center">
                    <div
                      className="w-8 h-8 rounded-full mx-auto border-2 border-primary"
                      style={{
                        backgroundColor: personalSettings.accent_color === 'default' ? 'hsl(var(--primary))' : (
                          personalSettings.accent_color === 'red' ? '#ef4444' :
                          personalSettings.accent_color === 'rose' ? '#f43f5e' :
                          personalSettings.accent_color === 'orange' ? '#f97316' :
                          personalSettings.accent_color === 'amber' ? '#f59e0b' :
                          personalSettings.accent_color === 'yellow' ? '#eab308' :
                          personalSettings.accent_color === 'lime' ? '#84cc16' :
                          personalSettings.accent_color === 'green' ? '#22c55e' :
                          personalSettings.accent_color === 'emerald' ? '#10b981' :
                          personalSettings.accent_color === 'teal' ? '#14b8a6' :
                          personalSettings.accent_color === 'cyan' ? '#06b6d4' :
                          personalSettings.accent_color === 'sky' ? '#0ea5e9' :
                          personalSettings.accent_color === 'blue' ? '#3b82f6' :
                          personalSettings.accent_color === 'indigo' ? '#6366f1' :
                          personalSettings.accent_color === 'violet' ? '#8b5cf6' :
                          personalSettings.accent_color === 'purple' ? '#a855f7' :
                          personalSettings.accent_color === 'fuchsia' ? '#d946ef' :
                          personalSettings.accent_color === 'pink' ? '#ec4899' :
                          'hsl(var(--primary))'
                        )
                      }}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      {personalSettings.accent_color === 'default' ? 'Default' : personalSettings.accent_color}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {personalSettings.dark_mode ? 'Dark' : 'Light'}
                    </div>
                    <div className="text-xs text-muted-foreground">Theme</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-mono bg-muted px-2 py-1 rounded text-primary">
                      {personalSettings.date_format === 'd MMM yyyy' ? '12 Jan 2025' :
                       personalSettings.date_format === 'yyyy-MM-dd' ? '2025-01-12' :
                       personalSettings.date_format === 'MM/dd/yyyy' ? '01/12/2025' :
                       personalSettings.date_format === 'd.M.yyyy' ? '12.1.2025' : '12 Jan 2025'}
                    </div>
                    <div className="text-xs text-muted-foreground">Date Format</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Settings Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Interface Size Card */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Monitor className="w-4 h-4" />
                    Interface Size
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Control text size and element spacing</p>
          </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {(['sm','md'] as const).map(s => (
                      <Button
                        key={s}
                        variant={personalSettings.ui_scale === s ? 'default' : 'outline'}
                        size="lg"
                        className={`justify-center h-auto py-3 ${personalSettings.ui_scale === s ? 'bg-primary text-primary-foreground' : ''}`}
                        onClick={async () => {
                            try {
                              await updatePersonalSettings({ ui_scale: s });
                            } catch (error: any) {
                              toast({
                                title: 'Failed to update interface size',
                                description: error?.message || 'Please try again.',
                                variant: 'destructive'
                              });
                            }
                        }}
                      >
                        <div className="text-center">
                          <div className="font-medium text-sm">
                            {s === 'sm' ? 'Compact' : 'Comfort'}
                          </div>
                          <div className="text-xs opacity-80 mt-1">
                            {s === 'sm' ? 'Smaller UI' : 'Standard UI'}
                          </div>
                        </div>
                          </Button>
                        ))}
                      </div>
                </CardContent>
              </Card>

              {/* Accent Color Card */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Palette className="w-4 h-4" />
                    Accent Color
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Primary color for buttons and interactive elements</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-6 gap-3">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => applyColor(c)}
                        className={`relative h-12 w-12 rounded-xl border-2 transition-all hover:scale-105 ${
                          personalSettings.accent_color === c
                            ? 'border-primary shadow-lg ring-2 ring-primary/20'
                            : 'border-muted-foreground/20 hover:border-muted-foreground/40'
                        }`}
                        title={c.charAt(0).toUpperCase() + c.slice(1)}
                      >
                        <div
                          className="w-full h-full rounded-xl"
                          style={{
                            backgroundColor: c === 'default' ? 'hsl(var(--primary))' : (
                              c === 'red' ? '#ef4444' :
                              c === 'rose' ? '#f43f5e' :
                              c === 'orange' ? '#f97316' :
                              c === 'amber' ? '#f59e0b' :
                              c === 'yellow' ? '#eab308' :
                              c === 'lime' ? '#84cc16' :
                              c === 'green' ? '#22c55e' :
                              c === 'emerald' ? '#10b981' :
                              c === 'teal' ? '#14b8a6' :
                              c === 'cyan' ? '#06b6d4' :
                              c === 'sky' ? '#0ea5e9' :
                              c === 'blue' ? '#3b82f6' :
                              c === 'indigo' ? '#6366f1' :
                              c === 'violet' ? '#8b5cf6' :
                              c === 'purple' ? '#a855f7' :
                              c === 'fuchsia' ? '#d946ef' :
                              c === 'pink' ? '#ec4899' :
                              'hsl(var(--primary))'
                            )
                          }}
                        />
                        {personalSettings.accent_color === c && (
                          <Check className="absolute inset-0 w-4 h-4 m-auto text-primary-foreground drop-shadow-sm" />
                        )}
                      </button>
                  ))}
                </div>
                  <div className="text-xs text-muted-foreground">
                    Click any color to apply. Your selection affects buttons, links, and interactive elements throughout the app.
                  </div>
                </CardContent>
              </Card>

              {/* Theme Card */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Moon className="w-4 h-4" />
                    Display Mode
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Choose your preferred viewing experience</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${personalSettings.dark_mode ? 'bg-slate-600' : 'bg-yellow-400'}`} style={{ backgroundColor: personalSettings.dark_mode ? '#475569' : '#fbbf24' }} />
                        <div>
                          <div className="font-medium">Dark Mode</div>
                          <div className="text-xs text-muted-foreground">Easier on the eyes in low-light conditions</div>
                        </div>
                      </div>
                      <Switch
                        checked={!!personalSettings.dark_mode}
                        onCheckedChange={onToggleDarkMode}
                      />
                </div>
              </div>
                </CardContent>
              </Card>

              {/* Date Format Card */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="w-4 h-4" />
                    Date Format
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">How dates appear across the application</p>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <SelectItem value="d MMM yyyy">
                        <div className="flex items-center justify-between w-full">
                          <span>12 Jan 2025</span>
                          <Badge variant="outline" className="text-xs ml-2">Today</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="yyyy-MM-dd">
                        <div className="flex items-center justify-between w-full">
                          <span>2025-01-12</span>
                          <Badge variant="outline" className="text-xs ml-2">ISO</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="MM/dd/yyyy">
                        <div className="flex items-center justify-between w-full">
                          <span>01/12/2025</span>
                          <Badge variant="outline" className="text-xs ml-2">US</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="d.M.yyyy">
                        <div className="flex items-center justify-between w-full">
                          <span>12.1.2025</span>
                          <Badge variant="outline" className="text-xs ml-2">European</Badge>
                        </div>
                      </SelectItem>
                  </SelectContent>
                </Select>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Sample:</div>
                    <div className="font-mono text-sm bg-background px-2 py-1 rounded border">
                      {personalSettings.date_format === 'd MMM yyyy' ? '12 Jan 2025' :
                       personalSettings.date_format === 'yyyy-MM-dd' ? '2025-01-12' :
                       personalSettings.date_format === 'MM/dd/yyyy' ? '01/12/2025' :
                       personalSettings.date_format === 'd.M.yyyy' ? '12.1.2025' : '12 Jan 2025'}
                    </div>
                  </div>
          </CardContent>
        </Card>
            </div>
          </div>
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

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Permissions & Access Control
              </CardTitle>
              <p className="text-sm text-muted-foreground">Manage roles and user-specific permission overrides for your organization.</p>
            </CardHeader>
            <CardContent className="p-0">
              <PermissionsManagement />
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
            <div className="space-y-6">
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
                  <div className="text-xs text-muted-foreground">
                    Enter specific IPs (192.168.1.100) or CIDR ranges (192.168.1.0/24)
                  </div>
                  <div className="space-y-2">
                    <Input id="ipAdd2" placeholder="e.g., 192.168.1.100 or 192.168.1.0/24" className="w-full" />
                    <div className="flex gap-2 flex-wrap">
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
                    <div className="mt-2 space-y-2">
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

              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">Temporary IP Bypass <Badge variant="outline">Timed</Badge></CardTitle>
                    <p className="text-sm text-muted-foreground">Grant short-lived IP bypasses for users who need access away from trusted locations.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadBypassData()} disabled={bypassLoading || grantingBypass || !!revokingGrantId}>
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label className="text-sm font-medium">Select user</label>
                      <Select value={bypassSelectedUser} onValueChange={setBypassSelectedUser}>
                        <SelectTrigger>
                          <SelectValue placeholder={bypassUsers.length ? 'Choose a user' : 'No users available'} />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {bypassUsers.map(u => (
                            <SelectItem key={u.userId} value={u.userId}>
                              {u.displayName}{u.email ? ` · ${u.email}` : ''}
                            </SelectItem>
                          ))}
                          {bypassUsers.length === 0 && <SelectItem value="" disabled>No users found</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Duration</label>
                      <Select value={String(bypassDuration)} onValueChange={(value) => setBypassDuration(Number(value))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="120">2 hours</SelectItem>
                          <SelectItem value="240">4 hours</SelectItem>
                          <SelectItem value="720">12 hours</SelectItem>
                          <SelectItem value="1440">1 day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full" onClick={handleGrantBypass} disabled={!bypassSelectedUser || grantingBypass}>
                        {grantingBypass ? 'Granting...' : 'Grant Bypass'}
                      </Button>
                    </div>
                  </div>
                  {bypassError && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{bypassError}</div>}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Active bypasses</span>
                      <Button variant="ghost" size="sm" onClick={() => loadBypassData()} disabled={bypassLoading}>
                        Reload
                      </Button>
                    </div>
                    {bypassLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map(i => (
                          <div key={i} className="flex items-center justify-between rounded border px-3 py-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-8 w-16" />
                          </div>
                        ))}
                      </div>
                    ) : bypassGrants.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No active bypasses.</p>
                    ) : (
                      <div className="space-y-2">
                        {bypassGrants.map(grant => {
                          const userInfo = bypassUsers.find(u => u.userId === grant.user_id);
                          const remaining = formatRemaining(grant.expires_at);
                          return (
                            <div key={grant.id} className="flex items-center justify-between rounded border px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">{userInfo?.displayName || grant.user_id}</div>
                                <div className="text-xs text-muted-foreground">
                                  Expires {formatAppDateTime(grant.expires_at)} ({remaining})
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{remaining}</Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRevokeGrant(grant.id)}
                                  disabled={revokingGrantId === grant.id}
                                >
                                  {revokingGrantId === grant.id ? 'Revoking...' : 'Revoke'}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        )}

        </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
