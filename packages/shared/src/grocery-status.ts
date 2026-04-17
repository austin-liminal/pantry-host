/**
 * Pantry-aware ingredient status resolution.
 *
 * Given a recipe ingredient and the user's pantry (matched by
 * case-insensitive exact name), returns one of four states:
 *
 *   - 'have'           — pantry has enough (alwaysOnHand OR quantity >= needed)
 *   - 'need_more'      — pantry has some, but not enough
 *   - 'check_pantry'   — pantry has the item but can't compare quantities
 *                        (missing on one side, or cross-category units)
 *   - 'buy'            — not in the pantry at all
 *
 * Two-dimension quantity: rows can carry an optional `itemSize` +
 * `itemSizeUnit` pair in addition to `quantity` + `unit`. When set, the
 * row's effective *total* is `quantity × itemSize` measured in
 * `itemSizeUnit`. Lets the user express "3 jars × 12 fl_oz" on the
 * pantry side and "2 16oz steaks" on the recipe side.
 *
 * Used by:
 *   - Grocery list (status chips + grey-out)
 *   - Recipe detail (auto-check ingredients that resolve to 'have')
 *   - Future surfaces (meal planner, recipe card indicators)
 */

import { convert, normalizeUnit } from './units';

export type GroceryStatus = 'have' | 'need_more' | 'check_pantry' | 'buy';

export interface PantryItemForStatus {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  itemSize?: number | null;
  itemSizeUnit?: string | null;
  alwaysOnHand: boolean;
}

export interface RecipeIngredientForStatus {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
  itemSize?: number | null;
  itemSizeUnit?: string | null;
}

/**
 * Collapse a (quantity, unit, itemSize, itemSizeUnit) row into a single
 * (total, totalUnit) pair. When itemSize is set, the total is expressed
 * in itemSizeUnit — i.e., "3 whole × 12 fl_oz" collapses to "36 fl_oz".
 * When itemSize is null, the row collapses to its (quantity, unit) as-is.
 */
function toTotal(row: {
  quantity?: number | null;
  unit?: string | null;
  itemSize?: number | null;
  itemSizeUnit?: string | null;
}): { total: number | null; unit: string | null } {
  if (row.itemSize != null) {
    const qty = row.quantity ?? 1; // no outer count → one pack
    return { total: qty * row.itemSize, unit: row.itemSizeUnit ?? null };
  }
  return { total: row.quantity ?? null, unit: row.unit ?? null };
}

/**
 * Build a lowercase-keyed lookup from a pantry list. Callers usually
 * cache this at the top of a render/effect so every ingredient in the
 * loop does a cheap Map.get().
 */
export function pantryIndex<T extends PantryItemForStatus>(pantry: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of pantry) {
    if (!item?.name) continue;
    map.set(item.name.toLowerCase(), item);
  }
  return map;
}

export function resolveGroceryStatus(
  pantryItem: PantryItemForStatus | undefined,
  ing: RecipeIngredientForStatus,
): GroceryStatus {
  if (!pantryItem) return 'buy';
  if (pantryItem.alwaysOnHand) return 'have';

  const pantry = toTotal(pantryItem);
  const recipe = toTotal(ing);

  // Pantry has no measured total — user is tracking presence, not amount.
  // Treat as on-hand (same semantics as alwaysOnHand).
  // Follow-up: surface this as a visually-distinct "assumed on-hand" state
  // (e.g., asterisk next to the checkbox) so users know which auto-checks
  // were inferred vs. measured.
  if (pantry.total == null) return 'have';

  // Recipe-side ambiguity — can't compare.
  if (recipe.total == null) return 'check_pantry';

  // Same unit (or both missing a unit): direct compare.
  const pantryUnit = normalizeUnit(pantry.unit);
  const recipeUnit = normalizeUnit(recipe.unit);
  if (pantryUnit === recipeUnit) {
    return pantry.total >= recipe.total ? 'have' : 'need_more';
  }

  // Different units: try conversion (volume↔volume, weight↔weight).
  // Cross-category or unknown-unit returns null → fall back to check_pantry.
  const converted = convert(pantry.total, pantry.unit, recipe.unit);
  if (converted == null) return 'check_pantry';
  return converted >= recipe.total ? 'have' : 'need_more';
}
