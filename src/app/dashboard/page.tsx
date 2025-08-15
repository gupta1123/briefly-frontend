"use client";
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1, Muted } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSettings } from '@/hooks/use-settings';
import Link from 'next/link';
import { UploadCloud, Sparkles, FolderOpenDot, MessageSquare, Eye, FileText, Users, HardDrive, Activity, TrendingUp, Calendar, UserCheck, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAppDateTime, formatBytes } from '@/lib/utils';

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-8">
        <PageHeader
          title="Welcome to Briefly"
          subtitle="Manage your documents, get AI insights, and streamline your workflows."
          sticky
        />
        <div className="px-4 md:px-6">
        <MainSections />
        </div>
      </div>
    </AppLayout>
  );
}

function HeaderCTA() { return null; }

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, { 
    primary: string; 
    secondary: string; 
    cardBg: string; 
    cardBorder: string;
    progressBar: string;
    iconBg: string;
  }> = {
    default: { 
      primary: 'text-blue-600 dark:text-blue-400', 
      secondary: 'text-blue-700 dark:text-blue-300', 
      cardBg: 'bg-blue-50 dark:bg-blue-900/20', 
      cardBorder: 'border-blue-200 dark:border-blue-800',
      progressBar: 'bg-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-800/30'
    },
    red: { 
      primary: 'text-red-600 dark:text-red-400', 
      secondary: 'text-red-700 dark:text-red-300', 
      cardBg: 'bg-red-50 dark:bg-red-900/20', 
      cardBorder: 'border-red-200 dark:border-red-800',
      progressBar: 'bg-red-500',
      iconBg: 'bg-red-100 dark:bg-red-800/30'
    },
    rose: { 
      primary: 'text-rose-600 dark:text-rose-400', 
      secondary: 'text-rose-700 dark:text-rose-300', 
      cardBg: 'bg-rose-50 dark:bg-rose-900/20', 
      cardBorder: 'border-rose-200 dark:border-rose-800',
      progressBar: 'bg-rose-500',
      iconBg: 'bg-rose-100 dark:bg-rose-800/30'
    },
    orange: { 
      primary: 'text-orange-600 dark:text-orange-400', 
      secondary: 'text-orange-700 dark:text-orange-300', 
      cardBg: 'bg-orange-50 dark:bg-orange-900/20', 
      cardBorder: 'border-orange-200 dark:border-orange-800',
      progressBar: 'bg-orange-500',
      iconBg: 'bg-orange-100 dark:bg-orange-800/30'
    },
    amber: { 
      primary: 'text-amber-600 dark:text-amber-400', 
      secondary: 'text-amber-700 dark:text-amber-300', 
      cardBg: 'bg-amber-50 dark:bg-amber-900/20', 
      cardBorder: 'border-amber-200 dark:border-amber-800',
      progressBar: 'bg-amber-500',
      iconBg: 'bg-amber-100 dark:bg-amber-800/30'
    },
    yellow: { 
      primary: 'text-yellow-600 dark:text-yellow-400', 
      secondary: 'text-yellow-700 dark:text-yellow-300', 
      cardBg: 'bg-yellow-50 dark:bg-yellow-900/20', 
      cardBorder: 'border-yellow-200 dark:border-yellow-800',
      progressBar: 'bg-yellow-500',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/30'
    },
    lime: { 
      primary: 'text-lime-600 dark:text-lime-400', 
      secondary: 'text-lime-700 dark:text-lime-300', 
      cardBg: 'bg-lime-50 dark:bg-lime-900/20', 
      cardBorder: 'border-lime-200 dark:border-lime-800',
      progressBar: 'bg-lime-500',
      iconBg: 'bg-lime-100 dark:bg-lime-800/30'
    },
    green: { 
      primary: 'text-green-600 dark:text-green-400', 
      secondary: 'text-green-700 dark:text-green-300', 
      cardBg: 'bg-green-50 dark:bg-green-900/20', 
      cardBorder: 'border-green-200 dark:border-green-800',
      progressBar: 'bg-green-500',
      iconBg: 'bg-green-100 dark:bg-green-800/30'
    },
    emerald: { 
      primary: 'text-emerald-600 dark:text-emerald-400', 
      secondary: 'text-emerald-700 dark:text-emerald-300', 
      cardBg: 'bg-emerald-50 dark:bg-emerald-900/20', 
      cardBorder: 'border-emerald-200 dark:border-emerald-800',
      progressBar: 'bg-emerald-500',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/30'
    },
    teal: { 
      primary: 'text-teal-600 dark:text-teal-400', 
      secondary: 'text-teal-700 dark:text-teal-300', 
      cardBg: 'bg-teal-50 dark:bg-teal-900/20', 
      cardBorder: 'border-teal-200 dark:border-teal-800',
      progressBar: 'bg-teal-500',
      iconBg: 'bg-teal-100 dark:bg-teal-800/30'
    },
    cyan: { 
      primary: 'text-cyan-600 dark:text-cyan-400', 
      secondary: 'text-cyan-700 dark:text-cyan-300', 
      cardBg: 'bg-cyan-50 dark:bg-cyan-900/20', 
      cardBorder: 'border-cyan-200 dark:border-cyan-800',
      progressBar: 'bg-cyan-500',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/30'
    },
    sky: { 
      primary: 'text-sky-600 dark:text-sky-400', 
      secondary: 'text-sky-700 dark:text-sky-300', 
      cardBg: 'bg-sky-50 dark:bg-sky-900/20', 
      cardBorder: 'border-sky-200 dark:border-sky-800',
      progressBar: 'bg-sky-500',
      iconBg: 'bg-sky-100 dark:bg-sky-800/30'
    },
    blue: { 
      primary: 'text-blue-600 dark:text-blue-400', 
      secondary: 'text-blue-700 dark:text-blue-300', 
      cardBg: 'bg-blue-50 dark:bg-blue-900/20', 
      cardBorder: 'border-blue-200 dark:border-blue-800',
      progressBar: 'bg-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-800/30'
    },
    indigo: { 
      primary: 'text-indigo-600 dark:text-indigo-400', 
      secondary: 'text-indigo-700 dark:text-indigo-300', 
      cardBg: 'bg-indigo-50 dark:bg-indigo-900/20', 
      cardBorder: 'border-indigo-200 dark:border-indigo-800',
      progressBar: 'bg-indigo-500',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/30'
    },
    violet: { 
      primary: 'text-violet-600 dark:text-violet-400', 
      secondary: 'text-violet-700 dark:text-violet-300', 
      cardBg: 'bg-violet-50 dark:bg-violet-900/20', 
      cardBorder: 'border-violet-200 dark:border-violet-800',
      progressBar: 'bg-violet-500',
      iconBg: 'bg-violet-100 dark:bg-violet-800/30'
    },
    purple: { 
      primary: 'text-purple-600 dark:text-purple-400', 
      secondary: 'text-purple-700 dark:text-purple-300', 
      cardBg: 'bg-purple-50 dark:bg-purple-900/20', 
      cardBorder: 'border-purple-200 dark:border-purple-800',
      progressBar: 'bg-purple-500',
      iconBg: 'bg-purple-100 dark:bg-purple-800/30'
    },
    fuchsia: { 
      primary: 'text-fuchsia-600 dark:text-fuchsia-400', 
      secondary: 'text-fuchsia-700 dark:text-fuchsia-300', 
      cardBg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', 
      cardBorder: 'border-fuchsia-200 dark:border-fuchsia-800',
      progressBar: 'bg-fuchsia-500',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/30'
    },
    pink: { 
      primary: 'text-pink-600 dark:text-pink-400', 
      secondary: 'text-pink-700 dark:text-pink-300', 
      cardBg: 'bg-pink-50 dark:bg-pink-900/20', 
      cardBorder: 'border-pink-200 dark:border-pink-800',
      progressBar: 'bg-pink-500',
      iconBg: 'bg-pink-100 dark:bg-pink-800/30'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}

function MainSections() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'systemAdmin' || user?.role === 'contentManager';
  
  if (isAdmin) {
    return (
      <div className="space-y-6">
        <AdminStats />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickActions />
        <div className="rounded-2xl border bg-muted/20 p-6 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Document stats available for admins</p>
          </div>
        </div>
      </div>
      <RecentDocuments />
    </div>
  );
}

function QuickActions() {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  
  return (
    <Card className="rounded-xl border bg-background shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-slate-900 dark:text-slate-100">Quick Actions</CardTitle>
        <p className="text-sm text-slate-600 dark:text-slate-400">Your essential shortcuts</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/documents" className={`group flex flex-col items-center justify-center p-6 rounded-xl bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 transition-all border ${themeColors.cardBorder} hover:shadow-md hover:scale-105`}>
            <div className={`p-3 rounded-lg ${themeColors.iconBg} mb-3 group-hover:scale-110 transition-transform`}>
              <FolderOpenDot className={`h-8 w-8 ${themeColors.primary}`} />
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100 text-center text-sm">Browse Documents</span>
            <span className={`text-xs ${themeColors.primary} font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity`}>Open →</span>
          </Link>
          
          <Link href="/chat" className={`group flex flex-col items-center justify-center p-6 rounded-xl bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 transition-all border ${themeColors.cardBorder} hover:shadow-md hover:scale-105`}>
            <div className={`p-3 rounded-lg ${themeColors.iconBg} mb-3 group-hover:scale-110 transition-transform`}>
              <MessageSquare className={`h-8 w-8 ${themeColors.primary}`} />
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100 text-center text-sm">Chat with AI</span>
            <span className={`text-xs ${themeColors.primary} font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity`}>Open →</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentDocuments({ className = '' }: { className?: string }) {
  const { documents } = useDocuments();
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const recent = [...documents].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, 3);

  return (
    <Card className={`rounded-xl border bg-background shadow-sm ${className}`}>
      <CardHeader className="flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-4 w-4 ${themeColors.primary}`} />
          <CardTitle className="text-slate-900 dark:text-slate-100">Recent Documents</CardTitle>
        </div>
        <Link href="/documents" className={`text-sm ${themeColors.primary} hover:underline font-medium`}>View All</Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.length === 0 && (
          <div className="py-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
            <div className="text-sm text-slate-600 dark:text-slate-400">No documents yet. Upload your first one to get started.</div>
          </div>
        )}
        {recent.map((d) => (
          <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center justify-between p-4 rounded-lg bg-white/50 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className={`h-5 w-5 ${themeColors.primary}`} />
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={(d as any).title || (d as any).filename || d.name}>{(d as any).title || (d as any).filename || d.name}</div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <Badge variant="outline" className={`uppercase tracking-wide ${themeColors.cardBorder} ${themeColors.secondary} ${themeColors.cardBg}`}>{d.type}</Badge>
                  <span>•</span>
                  <span>{formatAppDateTime(d.uploadedAt)}</span>
                </div>
              </div>
            </div>
            <Eye className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function AdminStats() {
  const { stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load dashboard statistics
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Documents"
          value={stats.documents.total}
          icon={FileText}
          trend={`+${stats.documents.recentUploads} this week`}
          color="blue"
        />
        <MetricCard
          title="Storage Used"
          value={formatBytes(stats.documents.storageBytes)}
          icon={HardDrive}
          trend="Total storage"
          color="green"
        />
        <MetricCard
          title="Active Users"
          value={stats.users.active}
          icon={Users}
          trend={`${stats.users.total} total members`}
          color="purple"
        />
        <MetricCard
          title="Recent Activity"
          value={stats.activity.recentEvents.length}
          icon={Activity}
          trend="Last 7 days"
          color="orange"
        />
      </div>

            {/* Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickActions />
        <RecentDocuments />
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, color }: {
  title: string;
  value: string | number;
  icon: any;
  trend: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  
  return (
    <Card className={`rounded-xl border-0 bg-gradient-to-br ${themeColors.cardBg} shadow-sm`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-12 h-1 rounded-full ${themeColors.progressBar}`}></div>
              <p className="text-xs text-slate-500 dark:text-slate-500">{trend}</p>
            </div>
          </div>
          <div className={`p-3 rounded-lg ${themeColors.iconBg} backdrop-blur-sm`}>
            <Icon className={`h-6 w-6 ${themeColors.primary}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





