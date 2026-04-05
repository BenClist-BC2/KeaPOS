import { createClient } from '@/lib/supabase/server';
import { StaffClient } from './staff-client';
import type { Profile, Location } from '@/lib/types';

export default async function StaffPage() {
  const supabase = await createClient();

  const [{ data: staff }, { data: locations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .order('full_name'),
    supabase
      .from('locations')
      .select('*')
      .eq('active', true)
      .order('name'),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage your team. Invited staff receive an email to set their password.
        </p>
      </div>

      <StaffClient
        staff={(staff as Profile[]) ?? []}
        locations={(locations as Location[]) ?? []}
      />
    </div>
  );
}
