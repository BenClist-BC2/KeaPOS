import { createClient } from '@/lib/supabase/server';
import { TerminalsClient } from './terminals-client';
import type { Location } from '@/lib/types';

interface Terminal {
  id: string;
  company_id: string;
  location_id: string;
  name: string;
  active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export default async function TerminalsPage() {
  const supabase = await createClient();

  const [{ data: terminals }, { data: locations }] = await Promise.all([
    supabase.from('terminals').select('*').order('name'),
    supabase.from('locations').select('*').eq('active', true).order('name'),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Terminals</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage POS terminal devices. Each terminal is paired to a specific location.
        </p>
      </div>

      <TerminalsClient
        terminals={(terminals as Terminal[]) ?? []}
        locations={(locations as Location[]) ?? []}
      />
    </div>
  );
}
