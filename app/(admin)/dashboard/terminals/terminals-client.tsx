'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import type { Location } from '@/lib/types';
import { createTerminal, updateTerminal, type CreateTerminalResult } from './actions';

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

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

// ─── QR Code generation ──────────────────────────────────────

function QRCodeDisplay({ data }: { data: string }) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      import('qrcode').then(QRCode => {
        QRCode.toCanvas(canvasRef.current, data, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
      });
    }
  }, [data]);

  function copyToClipboard() {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-100 rounded-lg p-6 text-center">
        <p className="text-xs text-gray-500 mb-2">Scan to pair terminal</p>
        <div className="bg-white p-4 inline-block rounded border border-gray-300">
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">Or enter manually:</p>
        <div className="relative">
          <input
            type="text"
            value={data}
            readOnly
            className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-xs font-mono text-gray-900 pr-20"
          />
          <button
            onClick={copyToClipboard}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-gray-900 text-white text-xs rounded hover:bg-gray-700"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pairing modal ──────────────────────────────────────────

interface PairingModalProps {
  result: CreateTerminalResult;
  onClose: () => void;
}

function PairingModal({ result, onClose }: PairingModalProps) {
  if (!result.pairing_code) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Terminal Pairing Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Scan this QR code on your terminal device, or enter the pairing code manually.
          </p>

          <QRCodeDisplay data={result.pairing_code} />

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              ⚠️ Save this code now. It won't be shown again.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create terminal form ───────────────────────────────────

interface CreateFormProps {
  locations: Location[];
  onDone: () => void;
  onSuccess: (result: CreateTerminalResult) => void;
}

function CreateForm({ locations, onDone, onSuccess }: CreateFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTerminal(fd);
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess(result);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Terminal name *</label>
          <input
            name="name"
            required
            placeholder="e.g. Front Counter"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Location *</label>
          <select
            name="location_id"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select location...</option>
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
          {pending ? 'Creating...' : 'Generate Terminal'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Edit terminal form ─────────────────────────────────────

interface EditFormProps {
  terminal: Terminal;
  onDone: () => void;
}

function EditForm({ terminal, onDone }: EditFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateTerminal(terminal.id, fd);
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Terminal name *</label>
        <input
          name="name"
          defaultValue={terminal.name}
          required
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          value="true"
          id="term-active"
          defaultChecked={terminal.active}
        />
        <label htmlFor="term-active" className="text-sm text-gray-700">Active</label>
        <input type="hidden" name="active" value="false" />
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main terminals client ──────────────────────────────────

interface TerminalsClientProps {
  terminals: Terminal[];
  locations: Location[];
}

export function TerminalsClient({ terminals, locations }: TerminalsClientProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pairingResult, setPairingResult] = useState<CreateTerminalResult | null>(null);

  function handleCreateSuccess(result: CreateTerminalResult) {
    setAdding(false);
    setPairingResult(result);
  }

  const locationName = (id: string) => locations.find(l => l.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-4">
      {/* Add form */}
      {adding ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">New terminal</h2>
          <CreateForm
            locations={locations}
            onDone={() => setAdding(false)}
            onSuccess={handleCreateSuccess}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700"
        >
          + Add Terminal
        </button>
      )}

      {/* Terminal list */}
      <div className="space-y-3">
        {terminals.map(term => (
          <div key={term.id} className="bg-white rounded-lg border border-gray-200 p-6">
            {editingId === term.id ? (
              <>
                <h2 className="font-semibold text-gray-900 mb-4">Edit terminal</h2>
                <EditForm terminal={term} onDone={() => setEditingId(null)} />
              </>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{term.name}</h3>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        term.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {term.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>Location: {locationName(term.location_id)}</span>
                    {term.last_seen_at && (
                      <span>Last seen: {new Date(term.last_seen_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(term.id)}
                  className="text-sm text-gray-500 hover:text-gray-900"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}

        {terminals.length === 0 && !adding && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm">No terminals yet. Add your first terminal above.</p>
          </div>
        )}
      </div>

      {/* Pairing modal */}
      {pairingResult && (
        <PairingModal result={pairingResult} onClose={() => setPairingResult(null)} />
      )}
    </div>
  );
}
