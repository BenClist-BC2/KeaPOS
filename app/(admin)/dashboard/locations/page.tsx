import { createClient } from '@/lib/supabase/server';
import { LocationsClient } from './locations-client';
import type { Location } from '@/lib/types';

export default async function LocationsPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .order('name');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage the physical venues where your POS terminals operate.
        </p>
      </div>

      <LocationsClient locations={(locations as Location[]) ?? []} />
    </div>
  );
}
