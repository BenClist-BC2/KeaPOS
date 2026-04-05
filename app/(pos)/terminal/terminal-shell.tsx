'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveStaff } from '@/lib/store/active-staff';
import { PairingScreen } from './pairing-screen';
import { PINLoginScreen } from './pin-login-screen';
import { TerminalMain } from './terminal-main';

/**
 * Terminal shell handles authentication routing:
 * 1. Not paired → show pairing screen
 * 2. Paired but no staff logged in → show PIN login
 * 3. Staff logged in → show main POS
 */
export function TerminalShell() {
  const [terminalAuthenticated, setTerminalAuthenticated] = useState<boolean | null>(null);
  const { staff_id } = useActiveStaff();

  useEffect(() => {
    const supabase = createClient();

    // Check if terminal is authenticated (must be role='terminal')
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setTerminalAuthenticated(false);
        return;
      }

      // Check if user has terminal role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      setTerminalAuthenticated(profile?.role === 'terminal');
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setTerminalAuthenticated(false);
        return;
      }

      // Check if user has terminal role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      setTerminalAuthenticated(profile?.role === 'terminal');
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading state while checking auth
  if (terminalAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Not paired → show pairing screen
  if (!terminalAuthenticated) {
    return <PairingScreen onPaired={() => setTerminalAuthenticated(true)} />;
  }

  // Paired but no staff → show PIN login
  if (!staff_id) {
    return <PINLoginScreen onLogin={() => {/* state updates automatically via Zustand */}} />;
  }

  // Staff logged in → show main POS
  return <TerminalMain />;
}
