import { create } from 'zustand';
import type { AdminPermission } from '@moshina/shared';
import type { AdminProfile } from '@moshina/api-types';

type Status = 'unknown' | 'authenticated' | 'anonymous';

interface AdminAuthState {
  status: Status;
  /** Kept in memory only (never localStorage); the refresh token lives in an httpOnly cookie. */
  accessToken: string | null;
  admin: AdminProfile | null;
  setSession: (accessToken: string, admin: AdminProfile) => void;
  clear: () => void;
  can: (...permissions: AdminPermission[]) => boolean;
}

export const useAdminAuth = create<AdminAuthState>((set, get) => ({
  status: 'unknown',
  accessToken: null,
  admin: null,
  setSession: (accessToken, admin) => set({ status: 'authenticated', accessToken, admin }),
  clear: () => set({ status: 'anonymous', accessToken: null, admin: null }),
  can: (...permissions) => {
    const admin = get().admin;
    return !!admin && permissions.every((p) => admin.permissions.includes(p));
  },
}));
