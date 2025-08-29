"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type Department = {
  id: string;
  org_id: string;
  name: string;
  lead_user_id?: string | null;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
  // Bootstrap endpoint includes these membership flags
  is_member?: boolean;
  is_lead?: boolean;
};

type Ctx = {
  departments: Department[];
  loading: boolean;
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const DepartmentsContext = createContext<Ctx | undefined>(undefined);

const LS_KEY = 'briefly_selected_department_id_v1';

export function DepartmentsProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: { departments: Department[] }
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      // Use bootstrap data if available, otherwise fetch from API with includeMine=1
      let list: Department[];
      if (bootstrapData?.departments) {
        list = bootstrapData.departments;
        console.log('Using bootstrap departments:', list?.map(d => ({ id: d.id, name: d.name, is_member: d.is_member, is_lead: d.is_lead })));
      } else {
        list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?includeMine=1`);
        console.log('Departments loaded with membership flags:', list?.map(d => ({ id: d.id, name: d.name, is_member: d.is_member, is_lead: d.is_lead })));
      }
      setDepartments(list || []);

      // Initialize selection from localStorage or user's department membership flags
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;

      // Only auto-select if no department is currently selected
      if (!selectedDepartmentId) {
        if (saved && (list || []).some(d => d.id === saved)) {
          console.log('Using saved department selection:', saved);
          setSelectedDepartmentId(saved);
        } else {
          // Use membership flags from bootstrap or API response
          const memberDepts = (list || []).filter(d => d.is_member);
          if (memberDepts.length > 0) {
            // Prefer department where user is a lead, then first membership
            const leadDept = memberDepts.find(d => d.is_lead);
            const primaryDeptId = leadDept ? leadDept.id : memberDepts[0].id;
            console.log('Selected primary department from membership flags:', primaryDeptId);
            setSelectedDepartmentId(primaryDeptId);
          } else if ((list || []).length) {
            console.log('No department memberships, using first available');
            setSelectedDepartmentId(list[0].id);
          }
        }
      } else {
        // Validate existing selection is still valid
        if (selectedDepartmentId && !(list || []).some(d => d.id === selectedDepartmentId)) {
          console.warn('Selected department no longer exists, resetting selection');
          setSelectedDepartmentId(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [bootstrapData]);

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
