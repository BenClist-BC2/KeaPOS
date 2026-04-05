'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PairingScreenProps {
  onPaired: () => void;
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [pairingCode, setPairingCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePair() {
    if (!pairingCode.trim()) {
      setError('Please enter a pairing code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Decode base64 pairing code
      const decoded = JSON.parse(atob(pairingCode.trim()));
      const { email, password } = decoded;

      if (!email || !password) {
        setError('Invalid pairing code format');
        setLoading(false);
        return;
      }

      // Authenticate terminal with email/password
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Success - terminal is now authenticated
      onPaired();
    } catch (err) {
      setError('Invalid pairing code');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">KeaPOS Terminal</h1>
          <p className="text-gray-500">Pair this device to your account</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pairing Code
            </label>
            <input
              type="text"
              value={pairingCode}
              onChange={e => setPairingCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePair()}
              placeholder="Paste code from admin portal"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handlePair}
            disabled={loading}
            className="w-full py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Pairing...' : 'Pair Terminal'}
          </button>

          <div className="text-center text-xs text-gray-400 mt-4">
            <p>Or scan QR code using your device camera</p>
          </div>
        </div>
      </div>
    </div>
  );
}
