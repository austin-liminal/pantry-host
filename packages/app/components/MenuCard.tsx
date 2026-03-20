interface Menu {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  recipes: { id: string }[];
}

interface Props {
  menu: Menu;
  menusBase?: string;
}

export default function MenuCard({ menu, menusBase = '/menus' }: Props) {
  const count = menu.recipes.length;
  return (
    <a
      href={`${menusBase}/${menu.slug ?? menu.id}#stage`}
      className="card group overflow-hidden block hover:ring-1 hover:ring-accent transition-all"
    >
      <div className="p-4">
        <span className="font-bold text-base leading-snug group-hover:text-accent transition-colors">
          {menu.title}
        </span>
        {menu.description && (
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-2 pretty">{menu.description}</p>
        )}
        <p className="text-xs text-[var(--color-text-secondary)] mt-2">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </p>
      </div>
    </a>
  );
}
