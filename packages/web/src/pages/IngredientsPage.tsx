import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';
import { CATEGORIES } from '@pantry-host/shared/constants';

interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  alwaysOnHand: boolean;
  tags: string[];
}

const QUERY = `{ ingredients { id name category quantity unit alwaysOnHand tags } }`;

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');

  async function load() {
    const { ingredients: list } = await gql<{ ingredients: Ingredient[] }>(QUERY);
    setIngredients(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await gql(
      `mutation($name: String!, $category: String) { addIngredient(name: $name, category: $category) { id } }`,
      { name: name.trim(), category: category || null },
    );
    setName('');
    setCategory('');
    load();
  }

  async function handleDelete(id: string) {
    await gql(`mutation($id: String!) { deleteIngredient(id: $id) }`, { id });
    load();
  }

  const grouped = ingredients.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const cat = ing.category || 'Uncategorized';
    (acc[cat] ??= []).push(ing);
    return acc;
  }, {});

  return (
    <div>
      <h1
        className="text-3xl font-bold mb-6"
        style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
      >
        Pantry
      </h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add ingredient..."
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] text-sm"
        >
          <option value="">Category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-bg-body)] hover:underline"
        >
          Add
        </button>
      </form>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
          ))}
        </div>
      ) : ingredients.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          Your pantry is empty. Add some ingredients above.
        </p>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
          <div key={cat} className="mb-6">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              {cat}
            </h2>
            <div className="space-y-1">
              {items.map((ing) => (
                <div
                  key={ing.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] px-4 py-2"
                >
                  <span className="text-sm">{ing.name}</span>
                  <button
                    onClick={() => handleDelete(ing.id)}
                    className="text-xs text-red-500 hover:underline"
                    aria-label="Delete"
                    aria-describedby={`ing-${ing.id}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
