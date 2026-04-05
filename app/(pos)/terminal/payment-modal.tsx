'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { formatNZD } from '@/lib/types';
import { placeOrder, type PlaceOrderInput, type PlaceOrderResult } from './actions';
import type { CartLine } from '@/lib/store/cart';
import { cartTotals } from '@/lib/store/cart';

interface PaymentModalProps {
  lines: CartLine[];
  tableId: string | null;
  customerName: string;
  onSuccess: (result: PlaceOrderResult) => void;
  onClose: () => void;
}

type PaymentMethod = 'cash' | 'eftpos';

export function PaymentModal({ lines, tableId, customerName, onSuccess, onClose }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('eftpos');
  const [tenderedStr, setTenderedStr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const { subtotal_cents, gst_cents, total_cents } = cartTotals(lines);
  const tendered_cents = method === 'cash' ? Math.round(parseFloat(tenderedStr || '0') * 100) : total_cents;
  const change_cents = method === 'cash' ? Math.max(0, tendered_cents - total_cents) : 0;
  const canPay = method === 'eftpos' || tendered_cents >= total_cents;

  useEffect(() => {
    if (method === 'cash') inputRef.current?.focus();
  }, [method]);

  function handlePay() {
    setError(null);
    const input: PlaceOrderInput = {
      lines,
      table_id: tableId,
      customer_name: customerName,
      order_type: tableId ? 'dine-in' : 'takeaway',
      payment_method: method,
      tendered_cents: method === 'cash' ? tendered_cents : undefined,
      subtotal_cents,
      gst_cents,
      total_cents,
    };
    startTransition(async () => {
      const result = await placeOrder(input);
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess(result);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Order total */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span>{formatNZD(subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST (incl.)</span><span>{formatNZD(gst_cents)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200 mt-1">
              <span>Total</span><span>{formatNZD(total_cents)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Payment method</p>
            <div className="grid grid-cols-2 gap-3">
              {(['eftpos', 'cash'] as PaymentMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                    method === m
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {m === 'eftpos' ? 'EFTPOS / Card' : 'Cash'}
                </button>
              ))}
            </div>
          </div>

          {/* Cash tendered */}
          {method === 'cash' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount tendered</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-500 text-sm">$</span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.05"
                  min={total_cents / 100}
                  value={tenderedStr}
                  onChange={e => setTenderedStr(e.target.value)}
                  placeholder={(total_cents / 100).toFixed(2)}
                  className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-3 text-lg font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {tendered_cents >= total_cents && (
                <div className="mt-2 text-center">
                  <span className="text-sm text-gray-500">Change: </span>
                  <span className="text-xl font-bold text-green-600">{formatNZD(change_cents)}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={!canPay || pending}
            className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'Processing…' : `Charge ${formatNZD(total_cents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReceiptModalProps {
  orderNumber: number;
  total_cents: number;
  change_cents: number;
  onDone: () => void;
}

export function ReceiptModal({ orderNumber, total_cents, change_cents, onDone }: ReceiptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 text-center overflow-hidden">
        <div className="bg-green-500 text-white px-6 py-6">
          <div className="text-5xl mb-2">✓</div>
          <h2 className="text-xl font-bold">Payment Complete</h2>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-gray-600 text-sm">Order #{orderNumber}</p>
          <p className="text-3xl font-bold text-gray-900">{formatNZD(total_cents)}</p>
          {change_cents > 0 && (
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-sm text-gray-600">Change due</p>
              <p className="text-2xl font-bold text-green-600">{formatNZD(change_cents)}</p>
            </div>
          )}
          <button
            onClick={onDone}
            className="w-full py-3 mt-2 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            New order
          </button>
        </div>
      </div>
    </div>
  );
}
