import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import type { Role, UserRole } from '@/src/lib/types';
import { useAuth } from '@/src/contexts/AuthContext';

const STORAGE_KEY = 'mana_local_active_role_id';

type RoleContextValue = {
  userRoles: UserRole[];
  roles: Role[];
  activeRole: Role | null;
  setActiveRoleId: (roleId: string) => void;
  isLoading: boolean;
  refreshUserRoles: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRoles = useCallback(async () => {
    const { data } = await supabase.from('roles').select('*');
    if (data) setRoles(data as Role[]);
    return data as Role[] | undefined;
  }, []);

  const loadUserRoles = useCallback(async () => {
    if (!user?.id) {
      setUserRoles([]);
      setActiveRoleIdState(null);
      setIsLoading(false);
      return;
    }
    const rolesList = roles.length ? roles : await loadRoles();
    const { data: urData } = await supabase
      .from('user_roles')
      .select('id, user_id, role_id')
      .eq('user_id', user.id);
    const list = (urData ?? []).map((ur) => {
      const role = rolesList.find((r) => r.id === ur.role_id);
      return { ...ur, role } as UserRole;
    });
    setUserRoles(list);
    const savedId = await AsyncStorage.getItem(STORAGE_KEY);
    const validId = list.some((ur) => ur.role_id === savedId) ? savedId : list[0]?.role_id ?? null;
    setActiveRoleIdState(validId);
    if (validId) await AsyncStorage.setItem(STORAGE_KEY, validId);
    setIsLoading(false);
  }, [user?.id, roles, loadRoles]);

  useEffect(() => {
    loadUserRoles();
  }, [loadUserRoles]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const setActiveRoleId = useCallback(async (roleId: string) => {
    setActiveRoleIdState(roleId);
    await AsyncStorage.setItem(STORAGE_KEY, roleId);
  }, []);

  const activeRole = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? null,
    [roles, activeRoleId]
  );

  const refreshUserRoles = useCallback(async () => {
    setIsLoading(true);
    await loadUserRoles();
  }, [loadUserRoles]);

  const value = useMemo<RoleContextValue>(
    () => ({
      userRoles,
      roles,
      activeRole,
      setActiveRoleId,
      isLoading,
      refreshUserRoles,
    }),
    [userRoles, roles, activeRole, setActiveRoleId, isLoading, refreshUserRoles]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
