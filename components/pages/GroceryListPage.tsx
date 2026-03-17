import Head from 'next/head';
import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';
import { cacheSet, cacheGet } from '@/lib/cache';
import { enqueue } from '@/lib/offlineQueue';

interface RecipeIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
}

interface QueuedRecipe {
  id: string;
  slug: string | null;
  title: string;
  ingredients: RecipeIngredient[];
}

interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  alwaysOnHand: boolean;
}

type ItemStatus = 'buy' | 'need_more' | 'check_pantry' | 'have';

interface LineItem {
  key: string;
  ingredientName: string;
  unit: string | null;
  totalQuantity: number | null;
  recipeNames: string[];
  status: ItemStatus;
  deficit: number | null;
  pantryQuantity: number | null;
}

const TOGGLE_QUEUED = `mutation ToggleQueued($id: String!) { toggleRecipeQueued(id: $id) { id queued } }`;

const QUEUED_RECIPES_QUERY = `
  query QueuedRecipes($kitchenSlug: String) {
    recipes(queued: true, kitchenSlug: $kitchenSlug) {
      id slug title
      ingredients { ingredientName quantity unit }
    }
  }
`;

const INGREDIENTS_QUERY = `
  query Ingredients($kitchenSlug: String) {
    ingredients(kitchenSlug: $kitchenSlug) { id name quantity unit alwaysOnHand }
  }
`;

function buildGroceryList(recipes: QueuedRecipe[], pantry: PantryItem[]): LineItem[] {
  const agg = new Map<string, { ingredientName: string; unit: string | null; totalQuantity: number | null; recipeNames: string[] }>();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = `${ing.ingredientName.toLowerCase()}::${ing.unit ?? ''}`;
      const existing = agg.get(key);
      if (existing) {
        if (!existing.recipeNames.includes(recipe.title)) existing.recipeNames.push(recipe.title);
        if (existing.totalQuantity != null && ing.quantity != null) {
          existing.totalQuantity += ing.quantity;
        } else {
          existing.totalQuantity = null;
        }
      } else {
        agg.set(key, {
          ingredientName: ing.ingredientName,
          unit: ing.unit,
          totalQuantity: ing.quantity,
          recipeNames: [recipe.title],
        });
      }
    }
  }

  const pantryByName = new Map<string, PantryItem>();
  for (const item of pantry) {
    pantryByName.set(item.name.toLowerCase(), item);
  }

  const items: LineItem[] = [];
  for (const [key, entry] of agg) {
    const pantryItem = pantryByName.get(entry.ingredientName.toLowerCase());
    let status: ItemStatus;
    let deficit: number | null = null;
    let pantryQuantity: number | null = null;

    if (!pantryItem) {
      status = 'buy';
    } else if (pantryItem.alwaysOnHand) {
      status = 'have';
      pantryQuantity = null;
    } else {
      pantryQuantity = pantryItem.quantity;
      if (pantryItem.quantity == null || entry.totalQuantity == null) {
        status = 'check_pantry';
      } else if (pantryItem.unit != null && entry.unit != null && pantryItem.unit !== entry.unit) {
        status = 'check_pantry';
      } else if (pantryItem.quantity >= entry.totalQuantity) {
        status = 'have';
      } else {
        status = 'need_more';
        deficit = entry.totalQuantity - pantryItem.quantity;
      }
    }

    items.push({ key, ingredientName: entry.ingredientName, unit: entry.unit, totalQuantity: entry.totalQuantity, recipeNames: entry.recipeNames, status, deficit, pantryQuantity });
  }

  const order: Record<ItemStatus, number> = { buy: 0, need_more: 1, check_pantry: 2, have: 3 };
  items.sort((a, b) => order[a.status] - order[b.status] || a.ingredientName.localeCompare(b.ingredientName));
  return items;
}

function fmtQty(qty: number | null, unit: string | null): string {
  if (qty == null) return unit ?? '';
  const n = Math.round(qty * 100) / 100;
  return unit ? `${n} ${unit}` : `${n}`;
}

interface Props { kitchen: string; }

export default function GroceryListPage({ kitchen }: Props) {
  const [recipes, setRecipes] = useState<QueuedRecipe[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('groceryChecked');
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [haveExpanded, setHaveExpanded] = useState(false);

  const recipesBase = kitchen === 'home' ? '/recipes' : `/kitchens/${kitchen}/recipes`;

  const cacheKey = `cache:groceryList:${kitchen}`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      gql<{ recipes: QueuedRecipe[] }>(QUEUED_RECIPES_QUERY, { kitchenSlug: kitchen }),
      gql<{ ingredients: PantryItem[] }>(INGREDIENTS_QUERY, { kitchenSlug: kitchen }),
    ])
      .then(([rd, id]) => {
        setRecipes(rd.recipes);
        setPantry(id.ingredients);
        cacheSet(cacheKey, { recipes: rd.recipes, pantry: id.ingredients });
      })
      .catch(() => {
        const cached = cacheGet<{ recipes: QueuedRecipe[]; pantry: PantryItem[] }>(cacheKey);
        if (cached) { setRecipes(cached.recipes); setPantry(cached.pantry); }
      })
      .finally(() => setLoading(false));
  }, [kitchen]);

  async function handleDequeue(recipeId: string) {
    // Optimistically remove from list
    setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    try {
      await gql(TOGGLE_QUEUED, { id: recipeId });
    } catch {
      // Offline — queue for later sync
      enqueue(TOGGLE_QUEUED, { id: recipeId });
    }
  }

  function toggleChecked(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem('groceryChecked', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const lineItems = buildGroceryList(recipes, pantry);
  const needItems = lineItems.filter((i) => i.status === 'buy' || i.status === 'need_more');
  const checkItems = lineItems.filter((i) => i.status === 'check_pantry');
  const haveItems = lineItems.filter((i) => i.status === 'have');
  const shopItems = [...needItems, ...checkItems];

  return (
    <>
      <Head><title>List — Pantry List</title></Head>
      <main id="stage" className="min-h-screen px-4 py-10 md:px-8 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Grocery List</h1>

        {/* Cooking queue chips */}
        <section aria-labelledby="queue-heading" className="mb-10">
          <h2 id="queue-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
            Cooking Queue
          </h2>
          {loading ? (
            <p className="text-zinc-500 dark:text-zinc-400" aria-busy="true">Loading…</p>
          ) : recipes.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              No recipes queued.{' '}
              <a href={`${recipesBase}#stage`} className="underline hover:text-amber-600 dark:hover:text-amber-400">
                Add from Recipes →
              </a>
            </p>
          ) : (
            <ul role="list" className="flex flex-wrap gap-2" aria-label="Queued recipes">
              {recipes.map((r) => (
                <li key={r.id} className="flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-1 text-sm font-medium">
                  <a href={`${recipesBase}/${r.slug ?? r.id}#stage`} className="hover:underline">{r.title}</a>
                  <button
                    type="button"
                    onClick={() => handleDequeue(r.id)}
                    aria-label={`Remove ${r.title} from queue`}
                    className="ml-1 leading-none text-base hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Grocery list */}
        {!loading && recipes.length > 0 && (
          <section aria-labelledby="grocery-heading">
            <h2 id="grocery-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
              Ingredients
            </h2>

            {lineItems.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">No ingredients listed for queued recipes.</p>
            ) : (
              <>
                {shopItems.length > 0 && (
                  <ul role="list" className="space-y-3 mb-6">
                    {shopItems.map((item) => (
                      <li key={item.key}>
                        <label className={`flex items-start gap-3 cursor-pointer ${checked.has(item.key) ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked.has(item.key)}
                            onChange={() => toggleChecked(item.key)}
                            className="mt-0.5 w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 accent-amber-500 shrink-0"
                          />
                          <span className={`flex-1 leading-snug ${checked.has(item.key) ? 'line-through text-zinc-400 dark:text-zinc-600' : ''}`}>
                            <span className="font-medium">
                              {item.status === 'need_more' && item.deficit != null
                                ? fmtQty(item.deficit, item.unit)
                                : fmtQty(item.totalQuantity, item.unit)}{' '}
                              {item.ingredientName}
                            </span>
                            {item.status === 'need_more' && item.pantryQuantity != null && (
                              <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">(have {fmtQty(item.pantryQuantity, item.unit)})</span>
                            )}
                            {item.status === 'check_pantry' && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">check pantry</span>
                            )}
                            <span className="block text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                              {item.recipeNames.join(', ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {haveItems.length > 0 && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setHaveExpanded((v) => !v)}
                      className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      aria-expanded={haveExpanded}
                    >
                      <span className={`inline-block transition-transform ${haveExpanded ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                      Already have ({haveItems.length})
                    </button>

                    {haveExpanded && (
                      <ul role="list" className="mt-3 space-y-2">
                        {haveItems.map((item) => (
                          <li key={item.key} className="flex items-start gap-3 text-zinc-400 dark:text-zinc-500">
                            <span className="mt-0.5 w-5 h-5 flex items-center justify-center text-amber-500 shrink-0 text-sm" aria-hidden="true">✓</span>
                            <span className="leading-snug">
                              <span className="line-through">{fmtQty(item.totalQuantity, item.unit)} {item.ingredientName}</span>
                              {item.pantryQuantity != null && (
                                <span className="ml-2 text-xs">(pantry: {fmtQty(item.pantryQuantity, item.unit)})</span>
                              )}
                              <span className="block text-xs mt-0.5">{item.recipeNames.join(', ')}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}
