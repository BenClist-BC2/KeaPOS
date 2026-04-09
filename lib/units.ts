/**
 * Unit conversion helpers for KeaPOS recipe and stock management.
 *
 * All recipe costs are calculated in a canonical base unit per dimension:
 *   Weight  → grams (g)
 *   Volume  → millilitres (ml)
 *   Count   → each
 *
 * Supported units and their multiplier to base unit:
 *   g    × 1      → g
 *   kg   × 1000   → g
 *   ml   × 1      → ml
 *   L    × 1000   → ml
 *   each × 1      → each
 *   dozen × 12    → each
 */

export type Unit = 'g' | 'kg' | 'ml' | 'L' | 'each' | 'dozen';

export type UnitDimension = 'weight' | 'volume' | 'count';

export const UNIT_LABELS: Record<Unit, string> = {
  g:     'g',
  kg:    'kg',
  ml:    'ml',
  L:     'L',
  each:  'each',
  dozen: 'dozen',
};

/** Multiplier to convert one of this unit to its base unit. */
const MULTIPLIERS: Record<Unit, number> = {
  g:     1,
  kg:    1000,
  ml:    1,
  L:     1000,
  each:  1,
  dozen: 12,
};

const DIMENSIONS: Record<Unit, UnitDimension> = {
  g:     'weight',
  kg:    'weight',
  ml:    'volume',
  L:     'volume',
  each:  'count',
  dozen: 'count',
};

/** Convert a quantity from one unit to base units (g, ml, or each). */
export function toBaseUnits(quantity: number, unit: Unit): number {
  return quantity * MULTIPLIERS[unit];
}

/** Convert a quantity from base units back to a given unit. */
export function fromBaseUnits(baseQuantity: number, unit: Unit): number {
  return baseQuantity / MULTIPLIERS[unit];
}

/** Return the dimension (weight / volume / count) for a unit. */
export function dimensionOf(unit: Unit): UnitDimension {
  return DIMENSIONS[unit];
}

/** Return true if two units can be used interchangeably (same dimension). */
export function areCompatible(a: Unit, b: Unit): boolean {
  return DIMENSIONS[a] === DIMENSIONS[b];
}

/** All units belonging to each dimension — useful for building select options. */
export const UNITS_BY_DIMENSION: Record<UnitDimension, Unit[]> = {
  weight: ['g', 'kg'],
  volume: ['ml', 'L'],
  count:  ['each', 'dozen'],
};

export const ALL_UNITS: Unit[] = ['g', 'kg', 'ml', 'L', 'each', 'dozen'];

/**
 * Convert a cost-per-invoice-unit to a cost-per-base-unit.
 *
 * Example: supplier charges $5.00/kg (500 cents/kg).
 *   costPerBaseUnit(500, 'kg') → 0.5 cents/g
 *
 * @param unitCostCents  Ex-GST cost per invoice unit (integer cents).
 * @param invoiceUnit    The unit on the supplier invoice.
 * @returns              Cost in cents per base unit (may be fractional — round at display).
 */
export function costPerBaseUnit(unitCostCents: number, invoiceUnit: Unit): number {
  return unitCostCents / MULTIPLIERS[invoiceUnit];
}
