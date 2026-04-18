/**
 * Allergen warning chips for a recipe. Sources unioned and deduped:
 *   1. `contains-*` recipe tags (user-asserted)
 *   2. `allergens_tags` from each ingredient's pantry-side OFF metadata
 *
 * Renders a row of amber chips using the same `--color-warning` token as
 * the `breastfeeding-alert` chip on the recipe detail page. Hidden when
 * there are no allergens to surface — consistent with the silent-hide
 * policy elsewhere on the page.
 */
import { useMemo } from 'react';
import { Warning } from '@phosphor-icons/react';
import { pantryIndex } from '../grocery-status';
import {
  aggregateAllergens,
  type RecipeIngredientForNutrition,
  type PantryItemForNutrition,
} from '../nutrition-aggregate';
import { getAllergenIcon } from './allergen-icons';

interface Props {
  ingredients: RecipeIngredientForNutrition[];
  pantry: PantryItemForNutrition[];
  /** Recipe tags — `contains-*` get folded into the chip set. */
  recipeTags?: readonly string[];
}

/** Title-case for display. "tree nuts" → "Tree Nuts". */
function toTitle(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AllergensLine({ ingredients, pantry, recipeTags }: Props) {
  const allergens = useMemo(() => {
    const lookup = pantryIndex(pantry);
    return aggregateAllergens({ ingredients, lookup, recipeTags });
  }, [ingredients, pantry, recipeTags]);

  if (allergens.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 mt-6 mb-2"
      aria-label="Allergens — based on recipe tags and pantry metadata"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        <Warning size={14} aria-hidden weight="bold" style={{ color: 'var(--color-warning)' }} />
        Contains:
      </span>
      {allergens.map((substance) => {
        const Icon = getAllergenIcon(substance);
        return (
          <span
            key={substance}
            className="tag inline-flex items-center gap-1"
            style={{ color: 'var(--color-warning)' }}
            title={`Contains ${substance}`}
          >
            <Icon size={12} aria-hidden weight="bold" />
            {toTitle(substance)}
          </span>
        );
      })}
    </div>
  );
}
