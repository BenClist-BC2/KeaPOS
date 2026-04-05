import { describe, it, expect, beforeEach } from 'vitest';
import { useActiveStaff } from '@/lib/store/active-staff';

// Reset store before each test
beforeEach(() => {
  useActiveStaff.setState({ staff_id: null, full_name: null, role: null });
});

describe('useActiveStaff store', () => {
  it('starts with no active staff', () => {
    const state = useActiveStaff.getState();
    expect(state.staff_id).toBeNull();
    expect(state.full_name).toBeNull();
    expect(state.role).toBeNull();
  });

  it('setStaff updates all fields', () => {
    useActiveStaff.getState().setStaff('staff-123', 'Jane Doe', 'manager');
    const state = useActiveStaff.getState();
    expect(state.staff_id).toBe('staff-123');
    expect(state.full_name).toBe('Jane Doe');
    expect(state.role).toBe('manager');
  });

  it('clearStaff resets to null', () => {
    useActiveStaff.getState().setStaff('staff-123', 'Jane Doe', 'manager');
    useActiveStaff.getState().clearStaff();
    const state = useActiveStaff.getState();
    expect(state.staff_id).toBeNull();
    expect(state.full_name).toBeNull();
    expect(state.role).toBeNull();
  });

  it('persists across state updates', () => {
    useActiveStaff.getState().setStaff('staff-456', 'John Smith', 'staff');
    // Get fresh state
    const state = useActiveStaff.getState();
    expect(state.staff_id).toBe('staff-456');
    expect(state.full_name).toBe('John Smith');
    expect(state.role).toBe('staff');
  });
});
