import { createClient } from '@/lib/supabase/server';
import type { Company } from '@/lib/types';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .single() as { data: Company | null };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 text-sm mt-1">Company and system configuration.</p>
      </div>

      {company && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Company details</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Company name</dt>
              <dd className="mt-1 text-sm text-gray-900">{company.name}</dd>
            </div>
            {company.nzbn && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">NZBN</dt>
                <dd className="mt-1 text-sm text-gray-900">{company.nzbn}</dd>
              </div>
            )}
            {company.gst_number && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">GST number</dt>
                <dd className="mt-1 text-sm text-gray-900">{company.gst_number}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="mt-4 bg-white rounded-lg border border-gray-200 p-12 text-center max-w-lg">
        <p className="text-gray-500 font-medium">More settings coming soon</p>
        <p className="text-gray-400 text-sm mt-2">
          Payment terminal configuration, receipt printer setup, and GST settings will appear here.
        </p>
      </div>
    </div>
  );
}
