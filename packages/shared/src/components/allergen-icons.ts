/**
 * Map a normalized allergen substance string to a Phosphor icon component.
 *
 * Substance strings are the same shape `aggregateAllergens` returns —
 * lowercased, hyphens-as-spaces, no `contains-` prefix:
 *   "milk" / "eggs" / "fish" / "shellfish" /
 *   "tree nuts" / "peanuts" / "wheat" / "soy" / "sesame"
 *
 * Returns `Warning` (the generic ExclamationTriangle replacement) for
 * any substance we don't have a specific icon for, so the chip always
 * carries some kind of marker.
 */
import {
  Drop,
  Egg,
  Fish,
  Shrimp,
  Acorn,
  TreeEvergreen,
  Grains,
  Plant,
  Warning,
  type Icon,
} from '@phosphor-icons/react';

// Phosphor's `Nut` is a hex-bolt fastener — wrong silhouette. The only
// true nut-shape Phosphor ships is `Acorn`; we use it for peanuts (no
// dedicated peanut glyph) and `TreeEvergreen` for tree nuts to hint at
// the tree origin.
const ALLERGEN_ICONS: Record<string, Icon> = {
  milk: Drop,
  eggs: Egg,
  egg: Egg,
  fish: Fish,
  shellfish: Shrimp,
  crustacean: Shrimp,
  crustaceans: Shrimp,
  'tree nuts': TreeEvergreen,
  'tree-nuts': TreeEvergreen,
  nuts: Acorn,
  peanuts: Acorn,
  peanut: Acorn,
  wheat: Grains,
  gluten: Grains,
  soy: Plant,
  soybeans: Plant,
  sesame: Plant,
};

export function getAllergenIcon(substance: string): Icon {
  const key = substance.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  return ALLERGEN_ICONS[key] ?? Warning;
}

/** Convenience: derive substance from a `contains-*` recipe tag. */
export function substanceFromContainsTag(tag: string): string {
  return tag.toLowerCase().replace(/^contains-/, '').replace(/-/g, ' ');
}
