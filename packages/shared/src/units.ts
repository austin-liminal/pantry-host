/**
 * Small unit conversion table for pantry ↔ recipe quantity matching.
 *
 * Covers volume (base = ml) and weight (base = g). Cross-category
 * conversions (volume ↔ weight) return null — callers fall back to
 * 'check_pantry' in that case.
 *
 * Freeform user input is normalized via the ALIASES map before lookup,
 * so "Tablespoon", "Tbsp", "tbsp", "T" all resolve to the canonical
 * "tbsp" key.
 *
 * Bare "oz" is treated as weight ounce. Use "fl_oz" (or "fluid ounce")
 * for fluid ounces — they're not interconvertible without density.
 */

// Base unit per category. Values are "N base units per 1 input unit".
const VOLUME_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  fl_oz: 29.5735,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

const WEIGHT_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.3495,
  lb: 453.592,
};

/**
 * Common user-input variants → canonical key. Applied before lookup.
 * Keep flat and obvious — this is a matching aid, not a locale parser.
 */
const ALIASES: Record<string, string> = {
  // volume
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  't': 'tbsp', // lowercase form of capital T (bare "T" would also map via case-insensitive norm)
  tbsps: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsps: 'tsp',
  'fluid ounce': 'fl_oz',
  'fluid ounces': 'fl_oz',
  'fl. oz.': 'fl_oz',
  'fl oz': 'fl_oz',
  floz: 'fl_oz',
  cups: 'cup',
  pints: 'pint',
  quarts: 'quart',
  gallons: 'gallon',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  // weight — note bare "oz" means weight ounce here
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  milligram: 'mg',
  milligrams: 'mg',
};

export function normalizeUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const key = u.toLowerCase().trim().replace(/\s+/g, ' ');
  return ALIASES[key] ?? key;
}

/**
 * Convert `qty` from one unit to another.
 *
 * Returns `null` when:
 *   - either unit is missing/unknown,
 *   - the units are in different categories (volume vs weight — no density table).
 *
 * Same-unit conversions return `qty` unchanged even if the unit isn't in
 * the known set (e.g., "whole" → "whole" just returns qty; callers can
 * still compare counts without help from this module).
 */
export function convert(qty: number, fromUnit: string | null | undefined, toUnit: string | null | undefined): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return qty;
  if (from in VOLUME_ML && to in VOLUME_ML) {
    return (qty * VOLUME_ML[from]) / VOLUME_ML[to];
  }
  if (from in WEIGHT_G && to in WEIGHT_G) {
    return (qty * WEIGHT_G[from]) / WEIGHT_G[to];
  }
  return null;
}

/**
 * True if two units can be meaningfully compared. Useful as a pre-check
 * before computing totals.
 */
export function unitsComparable(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const an = normalizeUnit(a);
  const bn = normalizeUnit(b);
  if (an === bn) return true;
  const aVol = an && an in VOLUME_ML;
  const bVol = bn && bn in VOLUME_ML;
  const aWt = an && an in WEIGHT_G;
  const bWt = bn && bn in WEIGHT_G;
  return (aVol && bVol) || (aWt && bWt) ? true : false;
}
