"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export type Role = 'systemAdmin' | 'contentManager' | 'contentViewer' | 'guest';

type AuthUser = {
  username: string;
  email: string;
  role: Role;
  expiresAt?: string; // for guests
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: AuthUser | null;
  signIn: (params: { username: string; password: string; email?: string }) => Promise<boolean>;
  signOut: () => void;
  isLoading: boolean;
  hasRoleAtLeast: (role: Role) => boolean;
};

const STORAGE_KEY = 'docustore_auth_v1';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoginLoggedAt, setLastLoginLoggedAt] = useState<number>(0);
  const router = useRouter();

  // On initial mount, restore session → set user
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) { setIsLoading(false); return; }
        const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
        const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { setIsLoading(false); return; }
        const me = await res.json();
        const now = Date.now();
        const orgs = Array.isArray(me.orgs) ? me.orgs : [];
        const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
        const firstActiveOrg = activeOrgs[0]?.orgId || '';
        setApiContext({ orgId: firstActiveOrg });
        if (!firstActiveOrg) {
          try { router.push('/no-access'); } catch {}
        }
        const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, contentManager: 2, orgAdmin: 3 };
        const best = (activeOrgs || []).reduce((acc: any, r: any) => (roleOrder[r.role] > roleOrder[acc.role] ? r : acc), { role: 'guest' });
        const mapped: Role = best.role === 'orgAdmin' ? 'systemAdmin' : (best.role as Role);
        const selectedOrg = (activeOrgs || []).find((o: any) => o.orgId === firstActiveOrg) || best;
        const email = sess.session?.user?.email || sess.session?.user?.id || '';
        setUser({ username: email, email, role: mapped, expiresAt: selectedOrg?.expiresAt || undefined });
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // On mount or when user changes, re-resolve org context from backend using persisted Supabase session
  useEffect(() => {
    (async () => {
      if (!user) {
        setApiContext({ orgId: '' });
        return;
      }
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
        const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const me = await res.json();
        const now = Date.now();
        const orgs = Array.isArray(me.orgs) ? me.orgs : [];
        const firstActiveOrg = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now)?.orgId || '';
        setApiContext({ orgId: firstActiveOrg });
        if (!firstActiveOrg) {
          try { router.push('/no-access'); } catch {}
        }
      } catch {
        // ignore; UI will remain gated until a successful API call
      }
    })();
  }, [user]);

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

    // Fetch memberships from backend with Authorization bearer token
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
      const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (!res.ok) throw new Error('profile fetch failed');
      const me = await res.json();
      const now = Date.now();
      const orgs = Array.isArray(me.orgs) ? me.orgs : [];
      const firstActiveOrg = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now)?.orgId || '';
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
      const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, contentManager: 2, orgAdmin: 3 };
      const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
      const best = (activeOrgs || []).reduce((acc: any, r: any) => (roleOrder[r.role] > roleOrder[acc.role] ? r : acc), { role: 'guest' });
      const mapped: Role = best.role === 'orgAdmin' ? 'systemAdmin' : (best.role as Role);
      const selectedOrg = (activeOrgs || []).find((o: any) => o.orgId === firstActiveOrg) || best;
      const signedInUser: AuthUser = { username: data.user.email || data.user.id, email: data.user.email || data.user.id, role: mapped, expiresAt: selectedOrg?.expiresAt || undefined };
      setUser(signedInUser);
      return true;
    } catch {
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
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
    const order: Role[] = ['guest', 'contentViewer', 'contentManager', 'systemAdmin'];
    return order.indexOf(user.role) >= order.indexOf(role);
  }, [user]);

  // Auto-logout when guest expiry passes (client-side safeguard; server should also enforce)
  useEffect(() => {
    if (!user?.expiresAt) return;
    const end = new Date(user.expiresAt).getTime();
    const now = Date.now();
    if (now >= end) {
      (async () => {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (!token) { signOut(); return; }
          const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
          const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) { signOut(); return; }
          const me = await res.json();
          const now2 = Date.now();
          const orgs = Array.isArray(me.orgs) ? me.orgs : [];
          const nextActive = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now2);
          if (nextActive) {
            setApiContext({ orgId: nextActive.orgId });
            setUser(prev => prev ? { ...prev, expiresAt: nextActive.expiresAt || undefined } : prev);
            return;
          }
          signOut();
        } catch {
          signOut();
        }
      })();
      return;
    }
    const id = setTimeout(() => {
      (async () => {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (!token) { signOut(); return; }
          const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
          const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) { signOut(); return; }
          const me = await res.json();
          const now2 = Date.now();
          const orgs = Array.isArray(me.orgs) ? me.orgs : [];
          const nextActive = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now2);
          if (nextActive) {
            setApiContext({ orgId: nextActive.orgId });
            setUser(prev => prev ? { ...prev, expiresAt: nextActive.expiresAt || undefined } : prev);
            return;
          }
          signOut();
        } catch {
          signOut();
        }
      })();
    }, end - now + 1000);
    return () => clearTimeout(id);
  }, [user?.expiresAt, signOut]);

  const value = useMemo<AuthContextValue>(() => ({ isAuthenticated: !!user, user, signIn, signOut, isLoading, hasRoleAtLeast }), [user, signIn, signOut, isLoading, hasRoleAtLeast]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}


