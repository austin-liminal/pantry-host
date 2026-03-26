import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';

interface CookwareItem {
  id: string;
  name: string;
  brand: string | null;
  tags: string[];
}

const QUERY = `{ cookware { id name brand tags } }`;

export default function CookwarePage() {
  const [items, setItems] = useState<CookwareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');

  async function load() {
    const { cookware } = await gql<{ cookware: CookwareItem[] }>(QUERY);
    setItems(cookware);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await gql(`mutation($name: String!) { addCookware(name: $name) { id } }`, { name: name.trim() });
    setName('');
    load();
  }

  async function handleDelete(id: string) {
    await gql(`mutation($id: String!) { deleteCookware(id: $id) }`, { id });
    load();
  }

  return (
    <div>
      <h1
        className="text-3xl font-bold mb-6"
      >
        Cookware
      </h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add cookware..."
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-bg-body)] hover:underline"
        >
          Add
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">No cookware yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] px-4 py-2"
            >
              <div>
                <span className="text-sm font-medium">{item.name}</span>
                {item.brand && <span className="text-xs text-[var(--color-text-secondary)] ml-2">{item.brand}</span>}
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-xs text-red-500 hover:underline"
                aria-label="Delete"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
