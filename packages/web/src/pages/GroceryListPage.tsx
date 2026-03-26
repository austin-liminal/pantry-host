import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';

interface RecipeIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
}

interface Recipe {
  id: string;
  title: string;
  groceryIngredients: RecipeIngredient[];
}

const QUERY = `{ recipes(queued: true) { id title groceryIngredients { ingredientName quantity unit } } }`;

export default function GroceryListPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gql<{ recipes: Recipe[] }>(QUERY)
      .then((d) => setRecipes(d.recipes))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Consolidate ingredients across queued recipes
  const consolidated = new Map<string, { quantity: number | null; unit: string | null }>();
  for (const r of recipes) {
    for (const ing of r.groceryIngredients) {
      const key = ing.ingredientName.toLowerCase();
      const existing = consolidated.get(key);
      if (existing && existing.quantity != null && ing.quantity != null && existing.unit === ing.unit) {
        existing.quantity += ing.quantity;
      } else if (!existing) {
        consolidated.set(key, { quantity: ing.quantity, unit: ing.unit });
      }
    }
  }

  function toggle(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div>
      <h1
        className="text-3xl font-bold mb-6"
        style={{ fontFamily: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
      >
        Grocery List
      </h1>

      {loading ? (
        <div className="h-40 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
      ) : recipes.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No recipes queued. Add recipes to your grocery list from the recipe detail page.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} queued &middot;{' '}
            {consolidated.size} ingredient{consolidated.size !== 1 ? 's' : ''}
          </p>
          <div className="space-y-1">
            {[...consolidated.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, { quantity, unit }]) => (
                <label
                  key={name}
                  className={`flex items-center gap-3 rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] px-4 py-2.5 cursor-pointer select-none ${
                    checked.has(name) ? 'opacity-50 line-through' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(name)}
                    onChange={() => toggle(name)}
                    className="w-4 h-4 accent-[var(--color-accent)]"
                  />
                  <span className="text-sm">
                    {quantity != null && <span className="font-medium">{quantity}</span>}
                    {unit && <span className="text-[var(--color-text-secondary)]"> {unit}</span>}
                    {' '}{name}
                  </span>
                </label>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
