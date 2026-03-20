# CLAUDE.md

Project context for AI agents working on this codebase.

## What is this?

Pantry Host is a privacy-first kitchen companion for managing recipes, pantry ingredients, cookware, and grocery lists. It ships three ways: self-hosted with PostgreSQL, browser-native with PGlite, or as a static marketing page. All data stays on your hardware.

## Monorepo structure

```
pantry-host/
├── packages/
│   ├── app/          # Self-hosted Rex app (Postgres, SSR)
│   ├── shared/       # Shared types, adapters, constants, theme, components
│   ├── marketing/    # Static landing page (Vite, Cloudflare Pages)
│   └── web/          # Browser-native PWA (PGlite + IndexedDB, Vite)
├── package.json      # npm workspaces root
├── .env.local        # App env vars (DATABASE_URL, AI_PROVIDER, AI_API_KEY)
├── .claude/          # Launch configs, settings
└── CLAUDE.md
```

### npm workspaces

Root `package.json` has `"workspaces": ["packages/*"]`. Run workspace scripts via:
```bash
npm run dev                    # packages/app (Rex @ 3000)
npm run dev:graphql            # packages/app GraphQL (4001)
npm run dev:marketing          # packages/marketing (Vite @ 5173)
npm run dev:web                # packages/web (Vite @ 5174)
```

Or use `.claude/launch.json` configs: `pantry-host`, `graphql-server`, `marketing`, `web`.

## packages/app — Self-hosted (Rex + Postgres)

### Rex framework (not Next.js)

Uses **Rex** (`@limlabs/rex`), a custom React bundler built on rolldown. Mimics Next.js file-based routing but is NOT Next.js.

**Critical Rex behaviors:**
- Client bundles served from `/_rex/static/` and `/_rex/router.js`
- Stale `.rex/build` causes hydration failures. Fix: `rm -rf .rex/build` + restart
- No `<Link>` component — all `<a>` tags trigger full page loads
- Rex 0.19.2 has Tailwind v4 built into its Rust binary
- Rex's bundler doesn't follow Node module resolution up the tree. Requires React symlinks in `packages/app/node_modules/` (handled by `postinstall` script)

### Dual servers

| Server | Port | Purpose |
|--------|------|---------|
| Rex dev server | 3000 | Frontend SSR + static assets |
| GraphQL server | 4001 | API (graphql-yoga + Pothos) |

### Database

PostgreSQL 14+. `DATABASE_URL=postgres://jpdevries@localhost:5432/pantry_host`

Schema in `packages/app/schema.sql`, auto-applied on startup.

Tables: `kitchens`, `ingredients`, `recipes`, `recipe_ingredients`, `cookware`, `menus`, `menu_recipes`

### GraphQL schema

**`packages/app/lib/schema/index.ts` is the REAL schema.** Files `recipe.ts`, `ingredient.ts`, `cookware.ts`, `builder.ts` are dead code.

Uses the postgres.js tagged template API:
```typescript
const [row] = await sql`SELECT * FROM recipes WHERE slug = ${slug}`;
sql.array(tags)           // JS array → Postgres array
sql(rows, ...columns)     // bulk INSERT
```

### File structure

```
packages/app/
├── pages/               # Rex file-based routes
│   ├── _app.tsx         # App shell (Nav, OfflineBanner, SW, theme)
│   ├── _document.tsx    # SSR template (DEFAULT_THEME meta tag)
│   ├── index.tsx        # Dashboard
│   ├── list.tsx         # Grocery list
│   ├── ingredients.tsx  # Pantry
│   ├── cookware.tsx     # Cookware
│   ├── recipes/         # Recipe CRUD + import
│   ├── menus/           # Menu CRUD
│   └── kitchens/        # Multi-kitchen variants
├── components/          # React components
├── lib/
│   ├── gql.ts           # GraphQL HTTP client (POST to port 4001)
│   ├── db.ts            # Postgres connection (lazy-init proxy)
│   ├── schema/index.ts  # Pothos GraphQL schema
│   ├── cache.ts         # → @pantry-host/shared/cache
│   ├── claude.ts        # Anthropic SDK (AI recipes)
│   ├── apiStatus.ts     # API reachability polling
│   └── offlineQueue.ts  # Offline mutation queue
├── graphql-server.ts    # Standalone GraphQL server
├── schema.sql           # Database DDL
└── public/sw.js         # Service Worker
```

## packages/shared — Shared code

Exports used by all packages:

| Export | Description |
|--------|-------------|
| `@pantry-host/shared/constants` | Categories, units, common ingredients |
| `@pantry-host/shared/theme` | Theme management (system/light/dark, palettes, high contrast) |
| `@pantry-host/shared/cache` | localStorage cacheGet/cacheSet |
| `@pantry-host/shared/dailyQuote` | Seasonal daily quotes |
| `@pantry-host/shared/types` | TypeScript interfaces (Kitchen, Recipe, etc.) |
| `@pantry-host/shared/components/Footer` | Footer with conversions + theme controls |
| `@pantry-host/shared/adapters/database` | DatabaseAdapter interface |
| `@pantry-host/shared/adapters/file-storage` | FileStorageAdapter interface |

### Storage adapter pattern

```typescript
// DatabaseAdapter — Postgres (app) vs PGlite (web)
interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;
}

// FileStorageAdapter — filesystem (app) vs OPFS (web)
interface FileStorageAdapter {
  getFile(path: string): Promise<Blob>;
  putFile(path: string, file: Blob): Promise<void>;
  deleteFile(path: string): Promise<void>;
  getURL(path: string): string;
}
```

## packages/marketing — Static landing page

Vite + React + Tailwind v4. Deploys to Cloudflare Pages via `vite build` → `dist/`.

Sections: Hero, Tiers (Browser/Self-hosted/Claude Code), Features, Philosophy, Footer.

## packages/web — Browser-native PWA

Vite + React Router + PGlite + Tailwind v4. Runs entirely in-browser — no server required.

### Key architecture

- **PGlite** (`lib/db.ts`): Postgres compiled to WASM, persisted in IndexedDB (`idb://pantryhost`). Provides a tagged template wrapper mimicking the postgres.js `sql` API so the GraphQL schema resolvers work unmodified.
- **Local GraphQL** (`lib/gql.ts`): Executes GraphQL directly in-browser via `graphql()` from `graphql-js`. Same `gql<T>(query, variables)` API as the app's HTTP client.
- **Schema** (`lib/schema/index.ts`): Copy of app's schema with AI generation removed. Uses the PGlite-backed `sql` tagged template.
- **OPFS storage** (`lib/storage-opfs.ts`): File storage in Origin Private File System.
- **Data export** (`lib/export.ts`): SQL dump for backup/migration to self-hosted.
- **No guest mode** — everything is local, user owns all features.
- **No AI generation** — no server-side API key available.

### File structure

```
packages/web/
├── src/
│   ├── main.tsx         # Entry point (theme init, PGlite init)
│   ├── App.tsx          # React Router routes
│   ├── Layout.tsx       # Nav + Footer shell
│   ├── globals.css      # Theme tokens + Tailwind v4
│   └── pages/           # Page components (Home, Recipes, Ingredients, etc.)
├── lib/
│   ├── db.ts            # PGlite tagged template wrapper
│   ├── gql.ts           # Local GraphQL executor
│   ├── schema/index.ts  # GraphQL schema (no AI)
│   ├── storage-opfs.ts  # OPFS file storage
│   ├── export.ts        # Data export
│   ├── apiStatus.ts     # Stub (always online)
│   └── offlineQueue.ts  # Stub (no remote server)
├── public/
│   ├── manifest.json    # PWA manifest
│   └── sw.js            # Service worker
├── index.html           # Vite entry
└── vite.config.ts       # Vite + React + Tailwind + @/ alias
```

## Conventions

### Styling
- **Tailwind CSS v4** — `@import "tailwindcss"` + `@source` directives
- CSS custom properties for theming: `--color-bg-body`, `--color-accent`, etc.
- Palettes: default, rosé, rebecca purple, claude
- Dark mode via `.dark` class on `<html>`, managed by `@pantry-host/shared/theme`
- High contrast mode via `.high-contrast` class

### Accessibility
- **`aria-describedby` pattern**: Action buttons use `aria-label` + `aria-describedby` pointing to the item name element (better for i18n).
- **Focus management**: Delete confirmations get `autoFocus`. Inline edit forms pass `autoFocus` to first input.
- **Scroll targets**: Category headings use `scroll-mt-20` to clear sticky navs.

### Icons
Font Awesome Pro 5.15.4 **Light** SVGs as inline React components. Source: `/Users/jpdevries/Downloads/fontawesome-pro-5.15.4-web/svgs/light/`. Copy SVG `<path>` into component, don't use an icon library.

### Theme defaulting
`DEFAULT_THEME=claude` env var → `<meta name="default-palette">` in `_document.tsx` → `getThemePalette()` reads it as fallback when no localStorage preference. Set in `.claude/launch.json`.

### GraphQL patterns
- App: `gql()` POSTs to `http://localhost:4001/graphql`
- Web: `gql()` executes GraphQL locally via `graphql-js`
- Same API signature: `gql<T>(query, variables): Promise<T>`
- Queries accept `$kitchenSlug: String` for multi-kitchen filtering

## Environment variables

```bash
DATABASE_URL=postgres://jpdevries@localhost:5432/pantry_host  # required for app
AI_PROVIDER=anthropic                                             # anthropic or openclaw
AI_API_KEY=sk-ant-...                                             # optional, AI recipes
GRAPHQL_PORT=4001                                               # default 4001
DEFAULT_THEME=claude                                            # auto-set by launch.json
```

## Common tasks

### Clear stale Rex build cache
```bash
rm -rf .rex/build
```

### Install deps after monorepo changes
```bash
npm install  # from repo root, handles all workspaces
```

### Build packages
```bash
cd packages/marketing && npx vite build   # → dist/
cd packages/web && npx vite build         # → dist/
```

## Gotchas

1. **Blank pages after code changes**: Stale `.rex/build`. Delete it and restart.
2. **`react is not defined` in Rex V8**: npm workspaces hoists React to root. Rex doesn't walk up. The `postinstall` symlink script in `packages/app/package.json` fixes this.
3. **SW serving stale assets**: Bump `CACHE_NAME` version in the relevant `public/sw.js`.
4. **No `<Link>` in app**: Rex uses plain `<a>` tags. The web package uses React Router `<Link>`.
5. **Tailwind v4 in Rex**: Rex 0.19.2 has Tailwind v4 built in. Don't use `@apply` — use plain CSS in `globals.css`.
6. **Guest mode (app only)**: Non-localhost hides owner features. Not applicable to web package.
7. **PGlite WASM size**: ~2.8 MB gzipped. First load initializes schema. Subsequent loads are instant from IndexedDB.
8. **Schema sync**: `packages/web/lib/schema/index.ts` is a copy of `packages/app/lib/schema/index.ts` minus AI generation. Keep them in sync when adding queries/mutations.
