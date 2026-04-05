import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { gql } from '@/lib/gql';

interface Recipe {
  id: string;
  slug: string | null;
  title: string;
  cookTime: number | null;
  prepTime: number | null;
  servings: number | null;
  tags: string[];
  photoUrl: string | null;
}

interface CookwareItem {
  id: string;
  name: string;
  brand: string | null;
  notes: string | null;
  tags: string[];
  recipes: Recipe[];
}

const COOKWARE_ITEM_QUERY = `
  query CookwareItem($id: String!) {
    cookwareItem(id: $id) {
      id name brand notes tags
      recipes { id slug title cookTime prepTime servings tags photoUrl }
    }
  }
`;

export default function CookwareDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<CookwareItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    gql<{ cookwareItem: CookwareItem | null }>(COOKWARE_ITEM_QUERY, { id })
      .then((d) => setItem(d.cookwareItem))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="h-40 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />;
  if (!item) return <p className="text-[var(--color-text-secondary)]">Cookware item not found.</p>;

  return (
    <div>
      <Link to="/cookware#stage" className="text-sm text-[var(--color-text-secondary)] hover:underline mb-4 inline-block">
        &larr; Cookware
      </Link>

      <h1 className="text-3xl font-bold mb-1">{item.name}</h1>
      {item.brand && (
        <p className="text-[var(--color-text-secondary)]">{item.brand}</p>
      )}
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}
      {item.notes && (
        <p className="mt-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-line">{item.notes}</p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recipes using this cookware</h2>

        {item.recipes.length === 0 ? (
          <p className="text-[var(--color-text-secondary)] text-sm">No recipes require this cookware yet.</p>
        ) : (
          <ul className="space-y-2">
            {item.recipes.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recipes/${r.slug}#stage`}
                  className="block card rounded-xl p-4 hover:underline"
                >
                  <span className="font-semibold text-sm">{r.title}</span>
                  <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                    {[
                      r.prepTime && `${r.prepTime}m prep`,
                      r.cookTime && `${r.cookTime}m cook`,
                      r.servings && `${r.servings} servings`,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
