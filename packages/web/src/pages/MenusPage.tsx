import { useState, useEffect } from 'react';
import { gql } from '@/lib/gql';

interface Menu {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  active: boolean;
  category: string | null;
}

const QUERY = `{ menus { id slug title description active category } }`;

export default function MenusPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gql<{ menus: Menu[] }>(QUERY)
      .then((d) => setMenus(d.menus))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1
        className="text-3xl font-bold mb-6"
        style={{ fontFamily: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
      >
        Menus
      </h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />
          ))}
        </div>
      ) : menus.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No menus yet. Menus let you organize recipes into courses and meal plans.
        </p>
      ) : (
        <div className="space-y-3">
          {menus.map((menu) => (
            <div
              key={menu.id}
              className="rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-4"
            >
              <h3 className="font-semibold">{menu.title}</h3>
              {menu.description && (
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">{menu.description}</p>
              )}
              <div className="flex gap-2 mt-2">
                {menu.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-text-secondary)]">
                    {menu.category}
                  </span>
                )}
                {!menu.active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-text-secondary)]">
                    inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
