/**
 * Pantry-aware ingredient status resolution.
 *
 * Given a recipe ingredient and the user's pantry (matched by
 * case-insensitive exact name), returns one of four states:
 *
 *   - 'have'           — pantry has enough (alwaysOnHand OR quantity >= needed)
 *   - 'need_more'      — pantry has some, but not enough
 *   - 'check_pantry'   — pantry has the item but can't compare quantities
 *                        (missing on one side, or unit mismatch)
 *   - 'buy'            — not in the pantry at all
 *
 * Used by:
 *   - Grocery list (status chips + grey-out)
 *   - Recipe detail (auto-check ingredients that resolve to 'have')
 *   - Future surfaces (meal planner, recipe card indicators)
 */

export type GroceryStatus = 'have' | 'need_more' | 'check_pantry' | 'buy';

export interface PantryItemForStatus {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  alwaysOnHand: boolean;
}

export interface RecipeIngredientForStatus {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
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

  // Pantry item exists but has no measured quantity — user is tracking
  // its presence, not its amount. Treat as on-hand (same as alwaysOnHand).
  // Follow-up: surface this as a visually-distinct "assumed on-hand" state
  // (e.g., asterisk next to the checkbox) so users know which auto-checks
  // were inferred vs. measured.
  if (pantryItem.quantity == null) return 'have';

  // Pantry has a quantity but the recipe doesn't — can't compare.
  if (ing.quantity == null) return 'check_pantry';

  if (pantryItem.unit != null && ing.unit != null && pantryItem.unit !== ing.unit) {
    return 'check_pantry';
  }
  if (pantryItem.quantity >= ing.quantity) return 'have';
  return 'need_more';
}
