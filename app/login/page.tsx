import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">KeaPOS</h1>
          <p className="text-gray-500 mt-1 text-sm">Restaurant & Bar Point of Sale</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign in</h2>
          <LoginForm searchParams={searchParams} />
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          KeaPOS — Made for New Zealand hospitality
        </p>
      </div>
    </div>
  );
}
