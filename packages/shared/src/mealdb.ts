/**
 * TheMealDB API client and recipe converter.
 *
 * Free CORS-enabled JSON API for recipe search and import.
 * https://www.themealdb.com/api.php
 */

const BASE = 'https://www.themealdb.com/api/json/v1/1';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strMealThumb: string | null;
  strTags: string | null;
  strYoutube: string | null;
  strSource: string | null;
  [key: string]: string | null | undefined; // strIngredient1-20, strMeasure1-20
}

export interface MealDBSearchResult {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
  strCategory?: string | null;
  strArea?: string | null;
}

export interface MealDBCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}

// ── API functions ────────────────────────────────────────────────────────────

export async function searchMealDB(query: string): Promise<MealDBMeal[]> {
  const res = await fetch(`${BASE}/search.php?s=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`MealDB search failed: ${res.status}`);
  const data = await res.json() as { meals: MealDBMeal[] | null };
  return data.meals ?? [];
}

export async function filterByCategory(category: string): Promise<MealDBSearchResult[]> {
  const res = await fetch(`${BASE}/filter.php?c=${encodeURIComponent(category)}`);
  if (!res.ok) throw new Error(`MealDB filter failed: ${res.status}`);
  const data = await res.json() as { meals: MealDBSearchResult[] | null };
  return data.meals ?? [];
}

export async function getMealDBRecipe(id: string): Promise<MealDBMeal | null> {
  const res = await fetch(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`MealDB lookup failed: ${res.status}`);
  const data = await res.json() as { meals: MealDBMeal[] | null };
  return data.meals?.[0] ?? null;
}

export async function getMealDBCategories(): Promise<MealDBCategory[]> {
  const res = await fetch(`${BASE}/categories.php`);
  if (!res.ok) throw new Error(`MealDB categories failed: ${res.status}`);
  const data = await res.json() as { categories: MealDBCategory[] };
  return data.categories ?? [];
}

// ── Conversion ───────────────────────────────────────────────────────────────

/** Parse fraction strings like "1/4", "1 1/2", "3" */
function parseFraction(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  // Mixed: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // Simple fraction: "1/4"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  // Plain number
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Convert a TheMealDB meal to Pantry Host recipe format */
export function mealToRecipe(meal: MealDBMeal): {
  title: string;
  instructions: string;
  tags: string[];
  photoUrl: string | null;
  sourceUrl: string | null;
  ingredients: { ingredientName: string; quantity: number | null; unit: string | null }[];
} {
  const ingredients: { ingredientName: string; quantity: number | null; unit: string | null }[] = [];

  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] as string | null)?.trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${i}`] as string | null)?.trim() || '';

    // Try to parse "1/4 cup", "2 tbsp", "1 1/2 pounds"
    const match = measure.match(/^([\d\s/]+)\s+(.+)$/);
    if (match) {
      ingredients.push({
        ingredientName: name,
        quantity: parseFraction(match[1]),
        unit: match[2].trim(),
      });
    } else if (measure) {
      // No clear qty/unit split — try as pure number
      const qty = parseFraction(measure);
      if (qty !== null) {
        ingredients.push({ ingredientName: name, quantity: qty, unit: null });
      } else {
        // Freeform measure like "sprinkling", "to taste"
        ingredients.push({ ingredientName: name, quantity: null, unit: measure });
      }
    } else {
      ingredients.push({ ingredientName: name, quantity: null, unit: null });
    }
  }

  const tags: string[] = [];
  if (meal.strTags) tags.push(...meal.strTags.split(',').map((t) => t.trim()).filter(Boolean));
  if (meal.strCategory) tags.push(meal.strCategory.toLowerCase());
  if (meal.strArea) tags.push(meal.strArea.toLowerCase());
  tags.push('themealdb');

  return {
    title: meal.strMeal,
    instructions: meal.strInstructions ?? '',
    tags: [...new Set(tags)],
    photoUrl: meal.strMealThumb ?? null,
    sourceUrl: meal.strSource ?? null,
    ingredients,
  };
}
