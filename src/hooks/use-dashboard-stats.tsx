"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type DashboardStats = {
  documents: {
    total: number;
    storageBytes: number;
    recentUploads: number;
    typeBreakdown: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    temporary: number;
    roleBreakdown: Record<string, number>;
    topUploaders: [string, number][];
  };
  activity: {
    recentEvents: any[];
    chatSessions: number;
  };
  period: {
    sevenDaysAgo: string;
    thirtyDaysAgo: string;
  };
};

type DashboardStatsContextValue = {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

const DashboardStatsContext = createContext<DashboardStatsContextValue | undefined>(undefined);

export function DashboardStatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;
      
      setIsLoading(true);
      setError(null);
      const data = await apiFetch<DashboardStats>(`/orgs/${orgId}/dashboard/stats`);
      setStats(data);
    } catch (e) {
      setError((e as Error).message || 'Failed to load stats');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);
  useEffect(() => onApiContextChange(() => { void fetchStats(); }), [fetchStats]);

  const value = useMemo(() => ({ stats, isLoading, error, refetch: fetchStats }), [stats, isLoading, error, fetchStats]);
  return <DashboardStatsContext.Provider value={value}>{children}</DashboardStatsContext.Provider>;
}

export function useDashboardStats() {
  const ctx = useContext(DashboardStatsContext);
  if (!ctx) throw new Error('useDashboardStats must be used within a DashboardStatsProvider');
  return ctx;
} 