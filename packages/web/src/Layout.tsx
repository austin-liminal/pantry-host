import { Outlet, NavLink } from 'react-router-dom';
import Footer from '@pantry-host/shared/components/Footer';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/ingredients', label: 'Pantry' },
  { to: '/list', label: 'Grocery List' },
  { to: '/cookware', label: 'Cookware' },
  { to: '/menus', label: 'Menus' },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-body)] text-[var(--color-text-primary)] transition-colors">
      <nav className="bg-[var(--color-bg-nav)] border-b border-[var(--color-border-card)] px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-6 overflow-x-auto">
          <span
            className="font-bold text-lg shrink-0"
            style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
          >
            Pantry Host
          </span>
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-[var(--color-accent)] font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:underline'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
