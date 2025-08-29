"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export type Role = 'systemAdmin' | 'teamLead' | 'member' | 'contentManager' | 'contentViewer' | 'guest';

type AuthUser = {
  username: string;
  email: string;
  role: Role;
  expiresAt?: string; // for guests
};

type BootstrapData = {
  user: { id: string; displayName: string | null };
  orgs: Array<{ orgId: string; role: string; name: string; expiresAt?: string }>;
  selectedOrgId: string;
  orgSettings: any;
  userSettings: any;
  permissions: Record<string, any>;
  departments: Array<{
    id: string;
    org_id: string;
    name: string;
    lead_user_id?: string | null;
    color?: string | null;
    created_at?: string;
    updated_at?: string;
    is_member?: boolean;
    is_lead?: boolean;
  }>;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: AuthUser | null;
  bootstrapData: BootstrapData | null;
  signIn: (params: { username: string; password: string; email?: string }) => Promise<boolean>;
  signOut: () => void;
  isLoading: boolean;
  hasRoleAtLeast: (role: Role) => boolean;
};

const STORAGE_KEY = 'docustore_auth_v1';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoginLoggedAt, setLastLoginLoggedAt] = useState<number>(0);
  const router = useRouter();

  // Consolidated auth initialization - single API call
  useEffect(() => {
    let mounted = true;
    
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        
        if (!token) { 
          if (mounted) setIsLoading(false); 
          return; 
        }
        
        const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
        const res = await fetch(`${base}/me/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });
        
        if (!res.ok) { 
          if (mounted) setIsLoading(false); 
          return; 
        }
        
        const bootstrap = await res.json();
        if (!mounted) return; // Component unmounted

        const now = Date.now();
        const orgs = Array.isArray(bootstrap.orgs) ? bootstrap.orgs : [];
        const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
        const firstActiveOrg = activeOrgs[0]?.orgId || '';

        // Set both user and org context in one go
        setApiContext({ orgId: firstActiveOrg });

        if (!firstActiveOrg) {
          try { router.push('/no-access'); } catch {}
          return;
        }

        const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, member: 2, contentManager: 2, teamLead: 3, orgAdmin: 4 };
        const best = activeOrgs.reduce((acc: any, r: any) => (roleOrder[r.role] > roleOrder[acc.role] ? r : acc), { role: 'guest' });
        const mapped: Role = best.role === 'orgAdmin'
          ? 'systemAdmin'
          : best.role === 'teamLead'
            ? 'teamLead'
            : (best.role === 'contentManager' || best.role === 'contentViewer')
              ? 'member'
              : (best.role as Role);
        const selectedOrg = activeOrgs.find((o: any) => o.orgId === firstActiveOrg) || best;
        const email = sess.session?.user?.email || sess.session?.user?.id || '';

        // Store bootstrap data for use by other providers
        setBootstrapData(bootstrap);
        console.log('AuthProvider bootstrap data stored:', bootstrap);

        setUser({
          username: email,
          email,
          role: mapped,
          expiresAt: selectedOrg?.expiresAt || undefined
        });

        console.log('AuthProvider user set, selectedOrgId:', firstActiveOrg);
        
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [router]);

  // Remove localStorage persistence; rely on Supabase session + /me

  const signIn = useCallback(async ({ username, password }: { username: string; password: string; email?: string }) => {
    const emailLike = username.trim();
    const pass = password.trim();
    // Use Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailLike, password: pass });
    if (error || !data.session) return false;

    // Persist auth cookie marker for middleware gating
      try {
        if (typeof document !== 'undefined') {
          const maxAge = 60 * 60 * 24 * 30; // 30 days
          document.cookie = `docustore_auth_v1=1; path=/; max-age=${maxAge}`;
        }
      } catch {}

    // Fetch bootstrap data from backend with Authorization bearer token
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
      const res = await fetch(`${base}/me/bootstrap`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (!res.ok) throw new Error('profile fetch failed');
      const bootstrap = await res.json();
      console.log('AuthProvider signIn bootstrap response:', bootstrap);
      const now = Date.now();
      const orgs = Array.isArray(bootstrap.orgs) ? bootstrap.orgs : [];
      const firstActiveOrg = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now)?.orgId || '';
      console.log('AuthProvider signIn setting orgId:', firstActiveOrg);
      setApiContext({ orgId: firstActiveOrg });
      if (!firstActiveOrg) {
        try { router.push('/no-access'); } catch {}
      }
      // Record login audit for the selected org (prevent duplicates within 60 seconds)
      // Make this non-blocking to speed up login
      if (firstActiveOrg) {
        const now = Date.now();
        const timeSinceLastLogin = now - lastLoginLoggedAt;
        if (timeSinceLastLogin > 60000) { // 60 seconds
          // Don't await - fire and forget for faster login
          fetch(`${base}/orgs/${firstActiveOrg}/audit/login`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          }).then(() => {
            setLastLoginLoggedAt(now);
          }).catch(() => {
            // non-blocking, ignore errors
          });
        }
      }
      // Map highest org role to app role
      const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, member: 2, contentManager: 2, teamLead: 3, orgAdmin: 4 };
      const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
      const best = (activeOrgs || []).reduce((acc: any, r: any) => (roleOrder[r.role] > roleOrder[acc.role] ? r : acc), { role: 'guest' });
      // Map backend role keys to UI roles
      const mapped: Role = best.role === 'orgAdmin'
        ? 'systemAdmin'
        : best.role === 'teamLead'
          ? 'teamLead'
          : (best.role === 'contentManager' || best.role === 'contentViewer')
            ? 'member'
            : (best.role as Role);
      const selectedOrg = (activeOrgs || []).find((o: any) => o.orgId === firstActiveOrg) || best;
      const signedInUser: AuthUser = { username: data.user.email || data.user.id, email: data.user.email || data.user.id, role: mapped, expiresAt: selectedOrg?.expiresAt || undefined };

      // Store bootstrap data for use by other providers
      setBootstrapData(bootstrap);
      setUser(signedInUser);
      return true;
    } catch {
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setBootstrapData(null); // Clear bootstrap data
    // Clear API org context quickly to stop org-scoped calls
    try { setApiContext({ orgId: '' }); } catch {}
    // Clear Supabase session and localStorage
    try {
      void supabase.auth.signOut();
      // Also clear any remaining Supabase localStorage keys
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch {}
    // Clear our cookie
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'docustore_auth_v1=; Max-Age=0; path=/';
      }
    } catch {}
    // Hard redirect to ensure clean state and middleware run
    try {
      if (typeof window !== 'undefined') {
        window.location.replace('/signin');
        return;
      }
    } catch {}
    try { router.replace('/signin'); } catch {}
  }, [router]);

  const hasRoleAtLeast = useCallback((role: Role) => {
    if (!user) return false;
    const order: Role[] = ['guest', 'contentViewer', 'member', 'contentManager', 'teamLead', 'systemAdmin'];
    return order.indexOf(user.role) >= order.indexOf(role);
  }, [user]);

  // Auto-logout when guest expiry passes (client-side safeguard; server should also enforce)
  // Optimized expiration check - only check when needed
  useEffect(() => {
    if (!user?.expiresAt) return;
    
    const end = new Date(user.expiresAt).getTime();
    const now = Date.now();
    
    // If already expired, sign out immediately
    if (end <= now) {
      signOut();
      return;
    }
    
    // Set timer for actual expiration
    const timeoutId = setTimeout(() => {
      signOut();
    }, end - now + 1000);
    
    return () => clearTimeout(timeoutId);
  }, [user?.expiresAt, signOut]);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: !!user,
    user,
    bootstrapData,
    signIn,
    signOut,
    isLoading,
    hasRoleAtLeast
  }), [user, bootstrapData, signIn, signOut, isLoading, hasRoleAtLeast]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
