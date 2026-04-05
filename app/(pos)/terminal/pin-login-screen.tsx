'use client';

import { useState, useTransition } from 'react';
import { useActiveStaff } from '@/lib/store/active-staff';
import { verifyPIN } from './pin-actions';

interface PINLoginScreenProps {
  onLogin: () => void;
}

export function PINLoginScreen({ onLogin }: PINLoginScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { setStaff } = useActiveStaff();

  function handleDigit(digit: string) {
    if (pin.length < 6) {
      setPin(pin + digit);
    }
  }

  function handleBackspace() {
    setPin(pin.slice(0, -1));
    setError(null);
  }

  function handleClear() {
    setPin('');
    setError(null);
  }

  function handleSubmit() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    startTransition(async () => {
      const result = await verifyPIN(pin);
      if (result.error) {
        setError(result.error);
        setPin('');
      } else if (result.staff_id && result.full_name && result.role) {
        setStaff(result.staff_id, result.full_name, result.role);
        onLogin();
      }
    });
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Enter PIN</h1>
          <p className="text-sm text-gray-500">Sign in to start your session</p>
        </div>

        {/* PIN display */}
        <div className="mb-6">
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  i < pin.length ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                }`}
              />
            ))}
          </div>
          {error && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {digits.slice(0, 9).map(digit => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              disabled={pending}
              className="aspect-square text-2xl font-semibold text-gray-900 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={pending}
            className="aspect-square text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            disabled={pending}
            className="aspect-square text-2xl font-semibold text-gray-900 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={pending}
            className="aspect-square text-xl font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            ⌫
          </button>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || pending}
          className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {pending ? 'Verifying...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}
