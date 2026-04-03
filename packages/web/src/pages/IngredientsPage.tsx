import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';
import { CATEGORIES } from '@pantry-host/shared/constants';
import { Trash } from '@phosphor-icons/react';
import BatchScanSession from '../components/BatchScanSession';

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
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isSecure, setIsSecure] = useState(false);

  useEffect(() => {
    setIsSecure(window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  }, []);

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
    setDeleteConfirm(null);
    load();
  }

  const grouped = ingredients.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const cat = ing.category || 'Uncategorized';
    (acc[cat] ??= []).push(ing);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">Pantry</h1>
        <div className="flex gap-2">
          {isSecure && (
            <button type="button" onClick={() => setScanning(true)} className="btn-secondary">
              Batch Scan
            </button>
          )}
        </div>
      </div>

      {scanning && (
        <BatchScanSession
          open={scanning}
          onComplete={() => { setScanning(false); load(); }}
          onCancel={() => setScanning(false)}
        />
      )}

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add ingredient..."
          className="field-input flex-1"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field-select w-auto"
        >
          <option value="">Category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Add</button>
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
            <ul className="divide-y divide-[var(--color-border-card)]">
              {items.map((ing) => (
                <li key={ing.id} className="flex items-center gap-3 py-3">
                  <span id={`ing-${ing.id}`} className="flex-1 min-w-0 text-sm">{ing.name}</span>
                  {deleteConfirm === ing.id ? (
                    <div className="flex gap-1 items-center shrink-0">
                      <span className="text-xs text-[var(--color-text-secondary)] mr-1">Delete?</span>
                      <button type="button" autoFocus onClick={() => handleDelete(ing.id)} className="btn-danger text-xs px-2 py-1" style={{ minHeight: 'auto' }} aria-label="Confirm delete" aria-describedby={`ing-${ing.id}`}>Yes</button>
                      <button type="button" onClick={() => setDeleteConfirm(null)} className="btn-secondary text-xs px-2 py-1" style={{ minHeight: 'auto' }} aria-label="Cancel delete" aria-describedby={`ing-${ing.id}`}>No</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(ing.id)}
                      className="text-[var(--color-text-secondary)] hover:text-red-500 p-2 shrink-0"
                      aria-label="Delete"
                      aria-describedby={`ing-${ing.id}`}
                    >
                      <Trash size={16} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
