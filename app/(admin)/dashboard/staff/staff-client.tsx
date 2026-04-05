'use client';

import { useState, useTransition } from 'react';
import type { Profile, Location, UserRole } from '@/lib/types';
import { inviteStaff, updateStaffRole } from './actions';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'owner',   label: 'Owner'   },
  { value: 'manager', label: 'Manager' },
  { value: 'staff',   label: 'Staff'   },
];

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

function RoleBadge({ role }: { role: UserRole }) {
  const colours: Record<UserRole, string> = {
    owner:   'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    staff:   'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${colours[role]}`}>
      {role}
    </span>
  );
}

interface InviteFormProps {
  locations: Location[];
  onDone: () => void;
}

function InviteForm({ locations, onDone }: InviteFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ hasEmail: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const hasEmail = !!(fd.get('email') as string)?.trim();

    startTransition(async () => {
      const result = await inviteStaff(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess({ hasEmail });
      }
    });
  }

  if (success) {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-4">
        <p className="font-medium">
          {success.hasEmail ? 'Invitation sent!' : 'Staff member added!'}
        </p>
        <p className="mt-1 text-green-600">
          {success.hasEmail
            ? 'They will receive an email invitation to set their password and access the admin portal.'
            : 'They can now log in to any terminal with their PIN.'}
        </p>
        <button
          onClick={() => { setSuccess(null); onDone(); }}
          className="mt-3 text-sm text-green-700 underline"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
        <p className="font-medium">Two types of team members:</p>
        <ul className="mt-1 ml-4 list-disc space-y-1 text-blue-700">
          <li><strong>With email:</strong> Can access admin portal + use terminal with PIN (Owner/Manager)</li>
          <li><strong>Without email:</strong> Terminal access only with PIN (Staff)</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Full name *</label>
          <input
            name="full_name"
            required
            placeholder="e.g. Jane Smith"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">PIN * <span className="text-gray-400 font-normal">(for terminal login)</span></label>
          <input
            name="pin"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            required
            placeholder="4-6 digits"
            maxLength={6}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email <span className="text-gray-400 font-normal">(optional - for admin portal)</span>
          </label>
          <input
            name="email"
            type="email"
            placeholder="jane@example.co.nz"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Role *</label>
          <select
            name="role"
            defaultValue="staff"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Default location</label>
          <select
            name="location_id"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Any location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add team member'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface EditStaffFormProps {
  staff: Profile;
  locations: Location[];
  onDone: () => void;
}

function EditStaffForm({ staff, locations, onDone }: EditStaffFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateStaffRole(staff.id, fd);
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-wrap">
      <select
        name="role"
        defaultValue={staff.role}
        className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        {ROLES.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <select
        name="location_id"
        defaultValue={staff.location_id ?? ''}
        className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        <option value="">Any location</option>
        {locations.map(loc => (
          <option key={loc.id} value={loc.id}>{loc.name}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-gray-700">
        <input type="checkbox" name="active" value="true" defaultChecked={staff.active} />
        Active
        <input type="hidden" name="active" value="false" />
      </label>
      {error && <ErrorMsg message={error} />}
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
      >
        {pending ? '…' : 'Save'}
      </button>
      <button type="button" onClick={onDone} className="text-sm text-gray-500 hover:text-gray-900">
        Cancel
      </button>
    </form>
  );
}

interface StaffClientProps {
  staff: Profile[];
  locations: Location[];
}

export function StaffClient({ staff, locations }: StaffClientProps) {
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const locationName = (id: string | null) =>
    id ? (locations.find(l => l.id === id)?.name ?? 'Unknown') : 'Any location';

  return (
    <div className="space-y-4">
      {/* Add team member panel */}
      {inviting ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Add team member</h2>
          <InviteForm locations={locations} onDone={() => setInviting(false)} />
        </div>
      ) : (
        <button
          onClick={() => setInviting(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700"
        >
          + Add team member
        </button>
      )}

      {/* Staff table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {staff.map(member => (
              <tr key={member.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === member.id ? null : <RoleBadge role={member.role} />}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {editingId !== member.id && locationName(member.location_id)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId !== member.id && (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      member.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {member.active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {editingId === member.id ? (
                    <EditStaffForm
                      staff={member}
                      locations={locations}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingId(member.id)}
                      className="text-sm text-gray-500 hover:text-gray-900"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                  No staff members yet. Invite someone above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
