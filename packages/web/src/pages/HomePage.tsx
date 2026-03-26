import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gql } from '@/lib/gql';

interface Stats {
  recipes: { id: string }[];
  ingredients: { id: string }[];
  cookware: { id: string }[];
}

const STATS_QUERY = `{
  recipes { id }
  ingredients { id }
  cookware { id }
}`;

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    gql<Stats>(STATS_QUERY).then(setStats).catch(console.error);
  }, []);

  const cards = [
    { label: 'Recipes', count: stats?.recipes.length ?? 0, to: '/recipes' },
    { label: 'Ingredients', count: stats?.ingredients.length ?? 0, to: '/ingredients' },
    { label: 'Cookware', count: stats?.cookware.length ?? 0, to: '/cookware' },
  ];

  return (
    <div>
      <h1
        className="text-3xl font-bold mb-8"
        style={{ fontFamily: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
      >
        Your Kitchen
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, count, to }) => (
          <Link
            key={to}
            to={to}
            className="rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-6 hover:underline transition-colors"
          >
            <p className="text-3xl font-bold">{stats ? count : '—'}</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{label}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-6">
        <h2 className="font-semibold mb-2">Browser-native mode</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          All your data is stored locally in your browser using PGlite. No server required.
          Your recipes, ingredients, and cookware persist across sessions.
        </p>
      </div>
    </div>
  );
}
