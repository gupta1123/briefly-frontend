"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type Department = { id: string; org_id: string; name: string; lead_user_id?: string | null; color?: string | null };

type Ctx = {
  departments: Department[];
  loading: boolean;
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const DepartmentsContext = createContext<Ctx | undefined>(undefined);

const LS_KEY = 'briefly_selected_department_id_v1';

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments`);
      setDepartments(list || []);
      // Initialize selection from localStorage or first department
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;
      if (!selectedDepartmentId) {
        if (saved && (list || []).some(d => d.id === saved)) setSelectedDepartmentId(saved);
        else if ((list || []).length) setSelectedDepartmentId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDepartmentId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => onApiContextChange(() => { setTimeout(() => void refresh(), 100); }), [refresh]);

  useEffect(() => {
    if (typeof window !== 'undefined' && selectedDepartmentId) {
      window.localStorage.setItem(LS_KEY, selectedDepartmentId);
    }
  }, [selectedDepartmentId]);

  const value = useMemo(() => ({ departments, loading, selectedDepartmentId, setSelectedDepartmentId, refresh }), [departments, loading, selectedDepartmentId]);
  return <DepartmentsContext.Provider value={value}>{children}</DepartmentsContext.Provider>;
}

export function useDepartments() {
  const ctx = useContext(DepartmentsContext);
  if (!ctx) throw new Error('useDepartments must be used within a DepartmentsProvider');
  return ctx;
}
