'use client';

import { useState, useTransition } from 'react';
import type { Location } from '@/lib/types';
import { createLocation, updateLocation } from './actions';

const NZ_TIMEZONES = [
  'Pacific/Auckland',
  'Pacific/Chatham',
];

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

interface LocationFormProps {
  location?: Location;
  onDone: () => void;
}

function LocationForm({ location, onDone }: LocationFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = location
        ? await updateLocation(location.id, fd)
        : await createLocation(fd);
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Location name *</label>
          <input
            name="name"
            defaultValue={location?.name}
            required
            placeholder="e.g. Cuba Street"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <input
            name="address"
            defaultValue={location?.address ?? ''}
            placeholder="e.g. 123 Cuba Street, Te Aro, Wellington 6011"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={location?.phone ?? ''}
            placeholder="e.g. 04 801 0001"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Timezone</label>
          <select
            name="timezone"
            defaultValue={location?.timezone ?? 'Pacific/Auckland'}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {NZ_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        {location && (
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="active"
              value="true"
              id="loc-active"
              defaultChecked={location.active}
            />
            <label htmlFor="loc-active" className="text-sm text-gray-700">Active</label>
            <input type="hidden" name="active" value="false" />
          </div>
        )}
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : location ? 'Update location' : 'Add location'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface LocationsClientProps {
  locations: Location[];
}

export function LocationsClient({ locations }: LocationsClientProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Add form */}
      {adding ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">New location</h2>
          <LocationForm onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700"
        >
          + Add location
        </button>
      )}

      {/* Location list */}
      <div className="space-y-3">
        {locations.map(loc => (
          <div key={loc.id} className="bg-white rounded-lg border border-gray-200 p-6">
            {editingId === loc.id ? (
              <>
                <h2 className="font-semibold text-gray-900 mb-4">Edit location</h2>
                <LocationForm location={loc} onDone={() => setEditingId(null)} />
              </>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{loc.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      loc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {loc.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {loc.address && (
                    <p className="text-sm text-gray-600 mt-1">{loc.address}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    {loc.phone && <span>Phone: {loc.phone}</span>}
                    <span>Timezone: {loc.timezone}</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(loc.id)}
                  className="text-sm text-gray-500 hover:text-gray-900"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}

        {locations.length === 0 && !adding && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm">No locations yet. Add your first venue above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
