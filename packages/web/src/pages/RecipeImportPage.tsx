import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { gql } from '@/lib/gql';
import {
  searchFederationRecipes,
  getFederationRecipe,
  cooklangToRecipe,
  type FederationSearchResult,
  type FederationPagination,
} from '@pantry-host/shared/cooklang';
import {
  searchMealDB,
  filterByCategory,
  getMealDBRecipe,
  getMealDBCategories,
  mealToRecipe,
  type MealDBMeal,
  type MealDBSearchResult,
  type MealDBCategory,
} from '@pantry-host/shared/mealdb';
import { MagnifyingGlass } from '@phosphor-icons/react';

const CREATE_MUTATION = `mutation(
  $title: String!, $description: String, $instructions: String!,
  $servings: Int, $prepTime: Int, $cookTime: Int,
  $tags: [String!], $photoUrl: String, $sourceUrl: String,
  $ingredients: [RecipeIngredientInput!]!
) {
  createRecipe(
    title: $title, description: $description, instructions: $instructions,
    servings: $servings, prepTime: $prepTime, cookTime: $cookTime,
    tags: $tags, photoUrl: $photoUrl, sourceUrl: $sourceUrl, ingredients: $ingredients
  ) { id slug }
}`;

type Tab = 'cooklang' | 'mealdb';

// ── Cooklang Tab ────────────────────────────────────────────────────────────

function CooklangTab({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FederationSearchResult[]>([]);
  const [pagination, setPagination] = useState<FederationPagination | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string, page = 1, append = false) => {
    if (!q.trim()) { setResults([]); setPagination(null); return; }
    if (page === 1) setSearching(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const data = await searchFederationRecipes(q.trim(), page, 12);
      setResults((prev) => append ? [...prev, ...data.results] : data.results);
      setPagination(data.pagination);
    } catch (err) {
      setError(`Search failed: ${(err as Error).message}`);
    } finally { setSearching(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setPagination(null); return; }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  async function handleImport() {
    if (selected.size === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: selected.size });
    setError(null);
    const ids = Array.from(selected);
    let done = 0, failed = 0;
    for (const id of ids) {
      try {
        const full = await getFederationRecipe(id);
        const recipe = cooklangToRecipe(full);
        await gql(CREATE_MUTATION, {
          title: recipe.title, description: recipe.description || null, instructions: recipe.instructions,
          servings: recipe.servings ?? null, prepTime: recipe.prepTime ?? null, cookTime: recipe.cookTime ?? null,
          tags: recipe.tags ?? [], photoUrl: recipe.photoUrl ?? null, sourceUrl: recipe.sourceUrl ?? null,
          ingredients: recipe.ingredients,
        });
      } catch (err) { console.error(`Failed to import recipe ${id}:`, err); failed++; }
      done++;
      setImportProgress({ done, total: ids.length });
      if (done < ids.length) await new Promise((r) => setTimeout(r, 1200));
    }
    setImporting(false); setImportProgress(null);
    if (failed > 0 && failed === ids.length) setError('All imports failed. Try again in a minute.');
    else if (failed > 0) setError(`${done - failed} of ${ids.length} imported. ${failed} failed.`);
    else navigate('/recipes#stage');
  }

  return (
    <>
      <div className="relative mb-6">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Cooklang recipes (e.g. pasta, chicken)..." className="field-input w-full pl-9" autoFocus />
      </div>
      {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}
      {searching && results.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map((i) => <div key={i} className="h-28 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />)}</div>
      )}
      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {results.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <label key={r.id} className={`card rounded-xl p-4 cursor-pointer transition-colors ${isSel ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={isSel} onChange={() => { setSelected((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }); }} className="mt-1 w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug">{r.title}</p>
                      {r.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{r.tags.slice(0, 4).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {pagination && pagination.page < pagination.total_pages && (
            <div className="text-center mb-6">
              <button type="button" onClick={() => search(query, pagination.page + 1, true)} disabled={loadingMore} className="btn-secondary">
                {loadingMore ? 'Loading\u2026' : `Load More (${results.length} of ${pagination.total})`}
              </button>
            </div>
          )}
          {selected.size > 0 && (
            <div className="sticky bottom-4 z-10 flex justify-center">
              <button type="button" onClick={handleImport} disabled={importing} className="btn-primary shadow-lg">
                {importing && importProgress ? `Importing ${importProgress.done}/${importProgress.total}\u2026` : `Import Selected (${selected.size})`}
              </button>
            </div>
          )}
        </>
      )}
      {!searching && query.trim() && results.length === 0 && <p className="text-[var(--color-text-secondary)] text-sm text-center py-12">No recipes found for "{query}".</p>}
      {!query.trim() && <p className="text-[var(--color-text-secondary)] text-sm text-center py-12">Search the Cooklang Federation's {'\u2248'}3,500 community recipes.</p>}
    </>
  );
}

// ── TheMealDB Tab ───────────────────────────────────────────────────────────

function MealDBTab({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<MealDBCategory[]>([]);
  const [results, setResults] = useState<(MealDBMeal | MealDBSearchResult)[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getMealDBCategories().then(setCategories).catch(() => {});
  }, []);

  const searchByName = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true); setError(null); setCategory('');
    try {
      const meals = await searchMealDB(q.trim());
      setResults(meals);
    } catch (err) { setError(`Search failed: ${(err as Error).message}`); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { if (!category) setResults([]); return; }
    debounceRef.current = setTimeout(() => searchByName(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, searchByName]);

  async function handleCategoryFilter(cat: string) {
    setCategory(cat); setQuery(''); setSearching(true); setError(null);
    try {
      const meals = await filterByCategory(cat);
      setResults(meals);
    } catch (err) { setError(`Filter failed: ${(err as Error).message}`); }
    finally { setSearching(false); }
  }

  async function handleImport() {
    if (selected.size === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: selected.size });
    setError(null);
    const ids = Array.from(selected);
    let done = 0, failed = 0;
    for (const id of ids) {
      try {
        // Search results have full data; filter results need lookup
        let meal = results.find((r) => r.idMeal === id) as MealDBMeal | undefined;
        if (!meal || !('strInstructions' in meal)) {
          meal = await getMealDBRecipe(id) ?? undefined;
        }
        if (!meal) throw new Error('Meal not found');
        const recipe = mealToRecipe(meal);
        await gql(CREATE_MUTATION, {
          title: recipe.title, description: null, instructions: recipe.instructions,
          servings: null, prepTime: null, cookTime: null,
          tags: recipe.tags, photoUrl: recipe.photoUrl, sourceUrl: recipe.sourceUrl,
          ingredients: recipe.ingredients,
        });
      } catch (err) { console.error(`Failed to import meal ${id}:`, err); failed++; }
      done++;
      setImportProgress({ done, total: ids.length });
    }
    setImporting(false); setImportProgress(null);
    if (failed > 0 && failed === ids.length) setError('All imports failed.');
    else if (failed > 0) setError(`${done - failed} of ${ids.length} imported. ${failed} failed.`);
    else navigate('/recipes#stage');
  }

  return (
    <>
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search TheMealDB (e.g. chicken, pasta)..." className="field-input w-full pl-9" />
        </div>
        <select value={category} onChange={(e) => { if (e.target.value) handleCategoryFilter(e.target.value); }} className="field-select w-auto">
          <option value="">Category</option>
          {categories.map((c) => <option key={c.idCategory} value={c.strCategory}>{c.strCategory}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}

      {searching && results.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map((i) => <div key={i} className="h-40 rounded-xl bg-[var(--color-bg-card)] animate-pulse" />)}</div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {results.map((r) => {
              const isSel = selected.has(r.idMeal);
              const thumb = r.strMealThumb;
              const cat = 'strCategory' in r ? (r as MealDBMeal).strCategory : null;
              const area = 'strArea' in r ? (r as MealDBMeal).strArea : null;
              return (
                <label key={r.idMeal} className={`card rounded-xl overflow-hidden cursor-pointer transition-colors ${isSel ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : ''}`}>
                  {thumb && (
                    <div className="aspect-[16/9] overflow-hidden bg-[var(--color-bg-card)]">
                      <picture>
                        <source media="(prefers-reduced-data: reduce)" srcSet={`${thumb}/preview`} />
                        <source media="(monochrome)" srcSet={`${thumb}/preview`} />
                        <img src={`${thumb}/preview`} srcSet={`${thumb} 2x`} alt={r.strMeal} className="w-full h-full object-cover" loading="lazy" />
                      </picture>
                    </div>
                  )}
                  <div className="p-3 flex items-start gap-3">
                    <input type="checkbox" checked={isSel} onChange={() => { setSelected((p) => { const n = new Set(p); n.has(r.idMeal) ? n.delete(r.idMeal) : n.add(r.idMeal); return n; }); }} className="mt-1 w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-snug">{r.strMeal}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cat && <span className="tag">{cat}</span>}
                        {area && <span className="tag">{area}</span>}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="sticky bottom-4 z-10 flex justify-center">
              <button type="button" onClick={handleImport} disabled={importing} className="btn-primary shadow-lg">
                {importing && importProgress ? `Importing ${importProgress.done}/${importProgress.total}\u2026` : `Import Selected (${selected.size})`}
              </button>
            </div>
          )}
        </>
      )}

      {!searching && !query.trim() && !category && (
        <p className="text-[var(--color-text-secondary)] text-sm text-center py-12">Search or pick a category to browse TheMealDB recipes.</p>
      )}
      {!searching && (query.trim() || category) && results.length === 0 && (
        <p className="text-[var(--color-text-secondary)] text-sm text-center py-12">No results found.</p>
      )}
    </>
  );
}

// ── Main Import Page ────────────────────────────────────────────────────────

export default function RecipeImportPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('cooklang');

  return (
    <div>
      <Link to="/recipes" className="text-sm text-[var(--color-text-secondary)] hover:underline mb-4 inline-block">
        &larr; Back to recipes
      </Link>

      <h1 className="text-3xl font-bold mb-2">Import Recipes</h1>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 legible pretty">
        Search community recipe databases and import into your local pantry.
      </p>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-6 border-b border-[var(--color-border-card)]" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'cooklang'}
          onClick={() => setTab('cooklang')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'cooklang' ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
        >
          Cooklang
        </button>
        <button
          role="tab"
          aria-selected={tab === 'mealdb'}
          onClick={() => setTab('mealdb')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'mealdb' ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
        >
          TheMealDB
        </button>
      </div>

      {tab === 'cooklang' && <CooklangTab navigate={navigate} />}
      {tab === 'mealdb' && <MealDBTab navigate={navigate} />}
    </div>
  );
}
