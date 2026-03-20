import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gql } from '@/lib/gql';

interface Recipe {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  queued: boolean;
  createdAt: string;
}

const RECIPES_QUERY = `{
  recipes { id slug title description tags queued createdAt }
}`;

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gql<{ recipes: Recipe[] }>(RECIPES_QUERY)
      .then((d) => setRecipes(d.recipes))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
        >
          Recipes
        </h1>
        <Link
          to="/recipes/new"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-bg-body)] hover:underline transition-colors"
        >
          New recipe
        </Link>
      </div>

      <input
        type="search"
        placeholder="Search recipes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 mb-6 rounded-lg border border-[var(--color-border-card)] bg-[var(--color-bg-card)] text-sm"
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          {recipes.length === 0
            ? 'No recipes yet. Create your first one!'
            : 'No recipes match your search.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to={`/recipes/${r.slug || r.id}`}
              className="block rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-4 hover:underline transition-colors"
            >
              <h3 className="font-semibold">{r.title}</h3>
              {r.description && (
                <p className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                  {r.description}
                </p>
              )}
              {r.tags.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {r.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-text-secondary)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
