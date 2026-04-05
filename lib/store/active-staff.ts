import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActiveStaffState {
  staff_id: string | null;
  full_name: string | null;
  role: string | null;

  setStaff: (staff_id: string, full_name: string, role: string) => void;
  clearStaff: () => void;
}

/**
 * Tracks the currently logged-in staff member on the POS terminal.
 * Persisted to localStorage so the session survives page refresh.
 */
export const useActiveStaff = create<ActiveStaffState>()(
  persist(
    (set) => ({
      staff_id: null,
      full_name: null,
      role: null,

      setStaff: (staff_id, full_name, role) => set({ staff_id, full_name, role }),
      clearStaff: () => set({ staff_id: null, full_name: null, role: null }),
    }),
    {
      name: 'keapos-active-staff',
    }
  )
);
