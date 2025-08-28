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
      console.log('Departments loaded:', list?.map(d => ({ id: d.id, name: d.name })));
      setDepartments(list || []);
      
      // Initialize selection from localStorage or user's department
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;
      
      // Only auto-select if no department is currently selected
      if (!selectedDepartmentId) {
        if (saved && (list || []).some(d => d.id === saved)) {
          console.log('Using saved department selection:', saved);
          setSelectedDepartmentId(saved);
        } else {
          // Try to determine user's primary department from their memberships
          try {
            const userDepts = await apiFetch<{department_id: string, role: string}[]>(`/orgs/${orgId}/user/departments`);
            console.log('User departments:', userDepts);
            if (userDepts && userDepts.length > 0) {
              // Prefer department where user is a lead, then first membership
              const leadDept = userDepts.find(d => d.role === 'lead');
              const primaryDeptId = leadDept ? leadDept.department_id : userDepts[0].department_id;
              console.log('Selected primary department:', primaryDeptId);
              
              // Verify this department exists in the list
              if ((list || []).some(d => d.id === primaryDeptId)) {
                setSelectedDepartmentId(primaryDeptId);
              } else if ((list || []).length) {
                console.log('Primary department not found, using first available');
                setSelectedDepartmentId(list[0].id);
              }
            } else if ((list || []).length) {
              console.log('No user departments, using first available');
              setSelectedDepartmentId(list[0].id);
            }
          } catch (error) {
            console.warn('Failed to fetch user departments:', error);
            // Fallback to first department if user departments query fails
            if ((list || []).length) setSelectedDepartmentId(list[0].id);
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
  }, []);

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
