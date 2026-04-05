'use client';

import { useActionState, use } from 'react';
import { signIn } from '@/lib/auth/actions';

interface LoginFormProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export function LoginForm({ searchParams }: LoginFormProps) {
  const { redirectTo } = use(searchParams);
  const [error, action, pending] = useActionState(signIn, null);

  return (
    <form action={action} className="space-y-4">
      {/* Pass redirectTo through the form */}
      <input type="hidden" name="redirectTo" value={redirectTo ?? '/dashboard'} />

      {error && (
        <div
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                     disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                     disabled:opacity-50"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium
                   hover:bg-gray-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
