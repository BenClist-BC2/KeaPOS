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

    console.log('[Terminal] Setting up auth...');

    // Subscribe to auth changes (fires immediately with current session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Terminal] Auth state change:', event, session?.user?.id);
      try {
        if (!session?.user) {
          console.log('[Terminal] No user session');
          setTerminalAuthenticated(false);
          return;
        }

        // Check if user has terminal role
        console.log('[Terminal] Checking profile for user:', session.user.id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        console.log('[Terminal] Profile result:', { role: profile?.role, error: profileError });
        setTerminalAuthenticated(profile?.role === 'terminal');
      } catch (err) {
        console.error('[Terminal] Auth change handler error:', err);
        setTerminalAuthenticated(false);
      }
    });

    return () => {
      console.log('[Terminal] Cleaning up auth subscription');
      subscription.unsubscribe();
    };
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
