"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAudit } from './use-audit';
import { useAuth } from './use-auth';
import type { StoredDocument } from '@/lib/types';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { parseFlexibleDate } from '@/lib/utils';

// Backend-powered documents provider with a backward-compatible API

type DocumentsContextValue = {
  documents: StoredDocument[];
  folders: string[][];
  refresh: () => Promise<void>;
  addDocument: (doc: Partial<StoredDocument>) => Promise<StoredDocument>;
  removeDocument: (id: string) => Promise<void>;
  removeDocuments: (ids: string[]) => Promise<{ deleted: number; storage_cleaned: number }>;
  updateDocument: (
    id: string,
    patchOrUpdater: Partial<StoredDocument> | ((prev: StoredDocument) => Partial<StoredDocument>)
  ) => Promise<StoredDocument>;
  getDocumentById: (id: string) => StoredDocument | undefined;
  clearAll: () => void;
  // folders
  createFolder: (parentPath: string[], name: string) => Promise<any>;
  deleteFolder: (path: string[], mode?: 'move_to_root' | 'delete_all') => Promise<any>;
  listFolders: (path: string[]) => string[][];
  getDocumentsInPath: (path: string[]) => StoredDocument[];
  moveDocumentsToPath: (ids: string[], destPath: string[]) => Promise<void>;
  // versioning
  linkAsNewVersion: (baseId: string, draft: Partial<StoredDocument>) => Promise<StoredDocument>;
  unlinkFromVersionGroup: (id: string) => Promise<void>;
  setCurrentVersion: (id: string) => Promise<void>;
};

const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [folders, setFolders] = useState<string[][]>([]);
  const { user } = useAuth();
  const { log } = useAudit();

  const getOrgId = () => getApiContext().orgId || '';

  const deriveFolders = useCallback((docs: StoredDocument[], prevFolders: string[][]) => {
    const derived = new Set<string>(prevFolders.map(p => p.join('/')));
    for (const d of docs) {
      const p = (d.folderPath || (d as any).folder_path || []) as string[];
      for (let i = 1; i <= p.length; i++) derived.add(p.slice(0, i).join('/'));
    }
    return Array.from(derived).filter(Boolean).map(s => s.split('/'));
  }, []);

  const refresh = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;
    const list = await apiFetch<any[]>(`/orgs/${orgId}/documents`);
    const revived = (list || []).map((d) => ({ 
      ...d, 
      uploadedAt: new Date(d.uploadedAt || d.uploaded_at),
    })) as StoredDocument[];
    setDocuments(revived);
    setFolders(prev => deriveFolders(revived, prev));
  }, [deriveFolders]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const off = onApiContextChange(() => { void refresh(); });
    return () => { off(); };
  }, [refresh]);

  const addDocument = useCallback(async (doc: Partial<StoredDocument>) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    console.log('addDocument called with doc:', doc);
    console.log('doc.folderPath:', doc.folderPath, 'Type:', typeof doc.folderPath, 'Is Array:', Array.isArray(doc.folderPath));
    const created: any = await apiFetch(`/orgs/${orgId}/documents`, { method: 'POST', body: doc });
    const revived = { 
      ...created, 
      uploadedAt: new Date(created.uploadedAt || created.uploaded_at || Date.now()),
    } as StoredDocument;
    setDocuments(prev => [revived, ...prev]);
    setFolders(prev => deriveFolders([revived], prev));
    try { log({ actor: user?.username || 'system', type: 'create', docId: created.id, title: created.title || created.name, note: 'uploaded' }); } catch {}
    return revived;
  }, [user, log, deriveFolders]);

  const removeDocument = useCallback(async (id: string) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/${id}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const removeDocuments = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { deleted: 0, storage_cleaned: 0 };
    if (ids.length === 1) {
      await removeDocument(ids[0]);
      return { deleted: 1, storage_cleaned: 0 }; // Single deletion doesn't return storage info
    }
    
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    
    const result = await apiFetch(`/orgs/${orgId}/documents`, { 
      method: 'DELETE',
      body: { ids }
    });
    
    setDocuments(prev => prev.filter(d => !ids.includes(d.id)));
    return result;
  }, [removeDocument]);

  const updateDocument = useCallback(async (id: string, patchOrUpdater: Partial<StoredDocument> | ((prev: StoredDocument) => Partial<StoredDocument>)) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    const current = documents.find(d => d.id === id);
    const patch = typeof patchOrUpdater === 'function' && current ? (patchOrUpdater as any)(current) : patchOrUpdater;
    // Transform client fields to API/DB fields and omit empty strings
    const body: any = {};
    const put = (k: string, v: any) => { if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) body[k] = v; };
    put('title', (patch as any).title);
    put('filename', (patch as any).filename);
    put('type', (patch as any).documentType || (patch as any).type);
    put('subject', (patch as any).subject);
    put('description', (patch as any).description);
    put('category', (patch as any).category);
    if (Array.isArray((patch as any).tags)) body.tags = (patch as any).tags;
    if (Array.isArray((patch as any).keywords)) body.keywords = (patch as any).keywords;
    put('sender', (patch as any).sender);
    put('receiver', (patch as any).receiver);
    if ((patch as any).documentDate !== undefined) {
      const raw = (patch as any).documentDate as string;
      const dt = parseFlexibleDate(raw);
      if (dt) {
        // yyyy-MM-dd
        const iso = dt.toISOString().slice(0, 10);
        body.document_date = iso;
      }
    }
    if (Array.isArray((patch as any).folderPath)) body.folder_path = (patch as any).folderPath;
    if ((patch as any).isCurrentVersion !== undefined) body.is_current_version = (patch as any).isCurrentVersion;

    if (Object.keys(body).length === 0) {
      // nothing to update; return current state
      return current as any;
    }

    const updated: any = await apiFetch(`/orgs/${orgId}/documents/${id}`, { method: 'PATCH', body });
    const mappedUpdated = {
      ...updated,
      uploadedAt: new Date(updated.uploadedAt || updated.uploaded_at || Date.now()),
    };
    setDocuments(prev => prev.map(d => d.id === id ? ({ ...d, ...mappedUpdated } as any) : d));
    return mappedUpdated as StoredDocument;
  }, [documents]);

  const getDocumentById = useCallback((id: string) => documents.find(d => d.id === id), [documents]);

  const clearAll = useCallback(() => { setDocuments([]); setFolders([]); }, []);

  const createFolder = useCallback(async (parentPath: string[], name: string) => {
    const clean = name.trim(); 
    if (!clean) throw new Error('Folder name cannot be empty');
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    
    try {
      const result = await apiFetch(`/orgs/${orgId}/folders`, { 
        method: 'POST', 
        body: { parentPath, name: clean } 
      });
      
      // Update local state
      const newPath = result.fullPath;
      setFolders(prev => (prev.some(p => JSON.stringify(p) === JSON.stringify(newPath)) ? prev : [...prev, newPath]));
      
      return result;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, [getOrgId]);

  const listFolders = useCallback((path: string[]) => folders.filter(p => p.length === path.length + 1 && path.every((seg, i) => seg === p[i])), [folders]);

  const deleteFolder = useCallback(async (path: string[], mode: 'move_to_root' | 'delete_all' = 'move_to_root') => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    
    try {
      const result = await apiFetch(`/orgs/${orgId}/folders`, { 
        method: 'DELETE', 
        body: { path, mode } 
      });
      
      // Update local state - remove the folder and any subfolders
      setFolders(prev => prev.filter(p => {
        // Remove the exact path and any paths that start with it
        return !(p.length >= path.length && path.every((seg, i) => seg === p[i]));
      }));
      
      // If documents were moved to root, refresh to update their paths
      if (mode === 'move_to_root' && result.documentsHandled > 0) {
        void refresh();
      } else if (mode === 'delete_all') {
        // Remove deleted documents from local state
        const docsInFolder = documents.filter(d => 
          JSON.stringify(d.folderPath || []) === JSON.stringify(path)
        );
        setDocuments(prev => prev.filter(d => 
          JSON.stringify(d.folderPath || []) !== JSON.stringify(path)
        ));
      }
      
      return result;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }, [getOrgId, refresh, documents]);

  const getDocumentsInPath = useCallback((path: string[]) => documents.filter(d => JSON.stringify(d.folderPath || []) === JSON.stringify(path)), [documents]);

  const moveDocumentsToPath = useCallback(async (ids: string[], destPath: string[]) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/move`, { method: 'POST', body: { ids, destPath } });
    setDocuments(prev => prev.map(d => ids.includes(d.id) ? { ...d, folderPath: destPath } : d));
    setFolders(prev => (prev.some(p => JSON.stringify(p) === JSON.stringify(destPath)) || destPath.length === 0) ? prev : [...prev, destPath]);
  }, []);

  const linkAsNewVersion = useCallback(async (baseId: string, draft: Partial<StoredDocument>) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    const created: any = await apiFetch(`/orgs/${orgId}/documents/${baseId}/version`, { method: 'POST', body: { draft } });
    const mappedCreated = {
      ...created,
      uploadedAt: new Date(created.uploadedAt || created.uploaded_at || Date.now()),
    };
    setDocuments(prev => prev.map(d => ((d as any).version_group_id || (d as any).versionGroupId || d.id) === ((created as any).version_group_id || created.id) ? { ...d, isCurrentVersion: false } : d).concat(mappedCreated as any));
    return mappedCreated as StoredDocument;
  }, []);

  const unlinkFromVersionGroup = useCallback(async (id: string) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/${id}/unlink`, { method: 'POST' });
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, versionGroupId: d.id, versionNumber: 1, isCurrentVersion: true, supersedesId: undefined } : d));
  }, []);

  const setCurrentVersion = useCallback(async (id: string) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/${id}/set-current`, { method: 'POST' });
    setDocuments(prev => {
      const target = prev.find(d => d.id === id); if (!target) return prev;
      const groupId = (target as any).version_group_id || (target as any).versionGroupId || target.id;
      return prev.map(d => (((d as any).version_group_id || (d as any).versionGroupId) === groupId) ? { ...d, isCurrentVersion: d.id === id } : d);
    });
  }, []);

  const value = useMemo(() => ({
    documents,
    folders,
    refresh,
    addDocument,
    removeDocument,
    removeDocuments,
    updateDocument,
    getDocumentById,
    clearAll,
    createFolder,
    deleteFolder,
    listFolders,
    getDocumentsInPath,
    moveDocumentsToPath,
    linkAsNewVersion,
    unlinkFromVersionGroup,
    setCurrentVersion,
  }), [documents, folders, refresh, addDocument, removeDocument, removeDocuments, updateDocument, getDocumentById, clearAll, createFolder, deleteFolder, listFolders, getDocumentsInPath, moveDocumentsToPath, linkAsNewVersion, unlinkFromVersionGroup, setCurrentVersion]);

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error('useDocuments must be used within a DocumentsProvider');
  return ctx;
}


