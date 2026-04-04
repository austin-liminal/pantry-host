import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gql } from '@/lib/gql';

interface RecipeIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
}

interface Recipe {
  id: string;
  slug: string;
  title: string;
  groceryIngredients: RecipeIngredient[];
}

const QUERY = `{ recipes(queued: true) { id slug title groceryIngredients { ingredientName quantity unit } } }`;
const TOGGLE_QUEUED = `mutation($id: String!) { toggleRecipeQueued(id: $id) { id queued } }`;

const STORAGE_KEY = 'groceryChecked';

function loadChecked(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveChecked(checked: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked]));
}

export default function GroceryListPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [checked, setChecked] = useState<Set<string>>(() => loadChecked());
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { recipes: list } = await gql<{ recipes: Recipe[] }>(QUERY);
      setRecipes(list);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveChecked(next);
      return next;
    });
  }

  async function dequeue(id: string) {
    await gql(TOGGLE_QUEUED, { id });
    load();
  }

  const totalIngredients = new Set(
    recipes.flatMap((r) => r.groceryIngredients.map((i) => i.ingredientName.toLowerCase()))
  ).size;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Grocery List</h1>

      {loading ? (
        <div className="h-40 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
      ) : recipes.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No recipes queued. Add recipes to your grocery list from the <Link to="/recipes" className="underline">recipes page</Link>.
        </p>
      ) : (
        <>
          {/* Cooking Queue */}
          <section className="mb-8">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">Cooking Queue</h2>
            <ul className="flex flex-wrap gap-2" role="list" aria-label="Queued recipes">
              {recipes.map((r) => (
                <li key={r.id} className="flex items-center gap-1 text-[var(--color-accent)] px-3 py-1 text-sm font-medium border border-[var(--color-border-card)]">
                  <Link to={`/recipes/${r.slug}`} className="hover:underline">{r.title}</Link>
                  <button
                    type="button"
                    onClick={() => dequeue(r.id)}
                    aria-label={`Remove ${r.title} from queue`}
                    className="ml-1 leading-none text-base hover:underline"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Summary */}
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} &middot; {totalIngredients} ingredient{totalIngredients !== 1 ? 's' : ''}
          </p>

          {/* Ingredients grouped by recipe */}
          <div className="space-y-6">
            {recipes.map((recipe) => (
              <fieldset key={recipe.id} className="border border-[var(--color-border-card)] rounded-lg p-4">
                <legend className="px-2 font-semibold text-sm">
                  <Link to={`/recipes/${recipe.slug}`} className="hover:underline">{recipe.title}</Link>
                </legend>
                <ul className="space-y-1">
                  {[...recipe.groceryIngredients]
                    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName))
                    .map((ing) => {
                      const key = `${recipe.id}::${ing.ingredientName.toLowerCase()}`;
                      const isChecked = checked.has(key);
                      return (
                        <li key={key}>
                          <label
                            className={`grocery-item flex items-center gap-3 py-1.5 cursor-pointer select-none transition-opacity ${isChecked ? 'opacity-50 line-through' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggle(key)}
                              className="w-4 h-4 accent-[var(--color-accent)]"
                            />
                            <span className="text-sm">
                              {ing.quantity != null && <span className="font-semibold tabular-nums">{ing.quantity}</span>}
                              {ing.unit && <span className="text-[var(--color-text-secondary)]"> {ing.unit}</span>}
                              {' '}{ing.ingredientName}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </fieldset>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
