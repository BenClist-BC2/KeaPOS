/**
 * GST (Goods and Services Tax) helpers for KeaPOS.
 *
 * Storage convention:
 *   - ALL monetary values in the database are stored ex-GST.
 *   - Sell prices displayed to customers are shown inc-GST.
 *   - Cost prices (stock, ingredients) are always shown ex-GST.
 *   - The GST rate is configurable per company (companies.default_gst_rate)
 *     and snapshotted onto each order line at time of sale.
 *
 * NZ GST maths (rate = 15):
 *   inc = ex × 1.15
 *   ex  = inc / 1.15  =  inc × 100 / 115
 *   gst = inc / 11    =  ex  × 0.15
 */

import { formatNZD } from './types';

/** Convert ex-GST cents to inc-GST cents. */
export function exToInc(exCents: number, rate: number): number {
  return Math.round(exCents * (100 + rate) / 100);
}

/** Convert inc-GST cents to ex-GST cents (for storage). */
export function incToEx(incCents: number, rate: number): number {
  return Math.round(incCents * 100 / (100 + rate));
}

/** GST component on an ex-GST amount (i.e. the tax portion). */
export function gstOnEx(exCents: number, rate: number): number {
  return Math.round(exCents * rate / 100);
}

/** GST component on an inc-GST amount. */
export function gstOnInc(incCents: number, rate: number): number {
  return Math.round(incCents * rate / (100 + rate));
}

/**
 * Parse a dollar string entered inc-GST (e.g. "11.50") and return
 * the ex-GST value in cents for storage.
 *
 * @example parseIncGSTCents("11.50", 15) → 1000  ($10.00 ex-GST)
 */
export function parseIncGSTCents(dollars: string, rate: number): number {
  const incCents = Math.round(parseFloat(dollars) * 100);
  return incToEx(incCents, rate);
}

/**
 * Format an ex-GST cent value as an inc-GST NZD string for display to customers.
 *
 * @example formatExAsInc(1000, 15) → "$11.50"
 */
export function formatExAsInc(exCents: number, rate: number): string {
  return formatNZD(exToInc(exCents, rate));
}

/**
 * Format an ex-GST cent value as an ex-GST NZD string (for cost/purchase display).
 *
 * @example formatEx(1000) → "$10.00"
 */
export function formatEx(exCents: number): string {
  return formatNZD(exCents);
}

/**
 * Given an ex-GST cent value, return the inc-GST dollar string suitable for
 * pre-filling a price input (user edits inc-GST prices).
 *
 * @example incGSTInputValue(1000, 15) → "11.50"
 */
export function incGSTInputValue(exCents: number, rate: number): string {
  return (exToInc(exCents, rate) / 100).toFixed(2);
}
