"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type NetworkPolicy = {
  enabled: boolean;
  ips: string[]; // exact IPv4/IPv6 strings for demo
};

type SecurityContextValue = {
  policy: NetworkPolicy;
  setEnabled: (v: boolean) => void;
  addIp: (ip: string) => void;
  removeIp: (ip: string) => void;
  replaceIps: (ips: string[]) => void;
  getCurrentIp: () => Promise<string>;
  isIpAllowed: (ip: string, opts?: { bypass?: boolean }) => boolean;
};

const STORAGE_KEY = 'documind_ip_allowlist_v1';
const SecurityContext = createContext<SecurityContextValue | undefined>(undefined);

export function SecurityProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: { orgSettings: { ip_allowlist_enabled: boolean; ip_allowlist_ips: string[] } }
}) {
  const [policy, setPolicy] = useState<NetworkPolicy>({ enabled: false, ips: [] });

  const loadFromServer = useCallback(async () => {
    try {
      // Use bootstrap data if available, otherwise fall back to API call
      if (bootstrapData?.orgSettings) {
        const s = bootstrapData.orgSettings;
        setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      } else {
        const { orgId } = getApiContext();
        if (!orgId) return;
        const s = await apiFetch<any>(`/orgs/${orgId}/settings`);
        setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      }
    } catch {}
  }, [bootstrapData]);

  useEffect(() => { void loadFromServer(); }, [loadFromServer]);
  useEffect(() => {
    const off = onApiContextChange(() => { void loadFromServer(); });
    return () => { off(); };
  }, [loadFromServer]);

  // No localStorage persistence; rely on backend settings only

  const persist = useCallback(async (next: NetworkPolicy) => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;
      await apiFetch(`/orgs/${orgId}/settings`, {
        method: 'PUT',
        body: {
          ip_allowlist_enabled: next.enabled,
          ip_allowlist_ips: next.ips,
        },
      });
    } catch {}
  }, []);

  const setEnabled = useCallback((v: boolean) => setPolicy(prev => { const next = { ...prev, enabled: v }; void persist(next); return next; }), [persist]);
  const addIp = useCallback((ip: string) => setPolicy(prev => { const next = { ...prev, ips: Array.from(new Set([...prev.ips, ip.trim()])).filter(Boolean) }; void persist(next); return next; }), [persist]);
  const removeIp = useCallback((ip: string) => setPolicy(prev => { const next = { ...prev, ips: prev.ips.filter(x => x !== ip) }; void persist(next); return next; }), [persist]);
  const replaceIps = useCallback((ips: string[]) => setPolicy(prev => { const next = { ...prev, ips: Array.from(new Set(ips.map(s => s.trim()).filter(Boolean))) }; void persist(next); return next; }), [persist]);

  const getCurrentIp = useCallback(async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      return ip || '';
    } catch {
      return '';
    }
  }, []);

  const isIpAllowed = useCallback((ip: string, opts?: { bypass?: boolean }) => {
    if (!policy.enabled) return true;
    if (opts?.bypass) return true;
    return policy.ips.includes(ip);
  }, [policy]);

  const value = useMemo(() => ({ policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp, isIpAllowed }), [policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp, isIpAllowed]);
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within a SecurityProvider');
  return ctx;
}

