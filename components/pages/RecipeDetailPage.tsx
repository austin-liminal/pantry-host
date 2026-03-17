import Head from 'next/head';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { gql } from '@/lib/gql';
import { cacheSet, cacheGet } from '@/lib/cache';
import { enqueue } from '@/lib/offlineQueue';

interface RecipeIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
}

interface Recipe {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  instructions: string;
  servings: number | null;
  prepTime: number | null;
  cookTime: number | null;
  tags: string[];
  requiredCookware: string[];
  source: string;
  sourceUrl: string | null;
  photoUrl: string | null;
  lastMadeAt: string | null;
  queued: boolean;
  ingredients: RecipeIngredient[];
}

const RECIPE_QUERY = `
  query Recipe($id: String!) {
    recipe(id: $id) {
      id slug title description instructions servings prepTime cookTime
      tags requiredCookware source sourceUrl photoUrl lastMadeAt queued
      ingredients { ingredientName quantity unit }
    }
  }
`;

const DELETE_RECIPE = `mutation DeleteRecipe($id: String!) { deleteRecipe(id: $id) }`;
const COMPLETE_RECIPE = `mutation CompleteRecipe($id: String!, $servings: Int) { completeRecipe(id: $id, servings: $servings) { id lastMadeAt } }`;
const TOGGLE_QUEUED = `mutation ToggleQueued($id: String!) { toggleRecipeQueued(id: $id) { id queued } }`;
const PANTRY_QUERY = `query Ingredients($kitchenSlug: String) { ingredients(kitchenSlug: $kitchenSlug) { id name quantity unit alwaysOnHand } }`;
const UPDATE_INGREDIENT = `mutation UpdateIngredient($id: String!, $quantity: Float) { updateIngredient(id: $id, quantity: $quantity) { id quantity } }`;

interface PantryItem { id: string; name: string; quantity: number | null; unit: string | null; alwaysOnHand: boolean; }

interface Props { kitchen: string; recipeId: string; }

export default function RecipeDetailPage({ kitchen, recipeId }: Props) {
  const router = useRouter();
  const recipesBase = kitchen === 'home' ? '/recipes' : `/kitchens/${kitchen}/recipes`;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [notFound, setNotFound] = useState(false);

  const articleRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [servings, setServings] = useState(2);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastMadeAt, setLastMadeAt] = useState<string | null>(null);
  const [completedFlash, setCompletedFlash] = useState(false);
  const [queued, setQueued] = useState(false);
  const [togglingQueue, setTogglingQueue] = useState(false);
  const [showPantryUpdate, setShowPantryUpdate] = useState(false);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [pantryEdits, setPantryEdits] = useState<Map<string, number>>(new Map());
  const [savingPantry, setSavingPantry] = useState(false);

  useEffect(() => {
    if (!recipeId) return;
    const cacheKey = `cache:recipe:${recipeId}`;
    gql<{ recipe: Recipe | null }>(RECIPE_QUERY, { id: recipeId })
      .then((d) => {
        if (!d.recipe) { setNotFound(true); return; }
        setRecipe(d.recipe);
        setServings(d.recipe.servings ?? 2);
        setLastMadeAt(d.recipe.lastMadeAt);
        setQueued(d.recipe.queued);
        cacheSet(cacheKey, d.recipe);
      })
      .catch(() => {
        const cached = cacheGet<Recipe>(cacheKey);
        if (cached) {
          setRecipe(cached);
          setServings(cached.servings ?? 2);
          setLastMadeAt(cached.lastMadeAt);
          setQueued(cached.queued);
        }
      });
  }, [recipeId]);

  const baseServings = recipe?.servings ?? 2;
  const scaleFactor = servings / baseServings;

  const steps = (recipe?.instructions ?? '')
    .split('\n')
    .map((s) => s.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  const enterZen = useCallback(async () => {
    if (!articleRef.current) return;
    try { await articleRef.current.requestFullscreen(); } catch { /* ignored */ }
  }, []);

  const exitZen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    function onFSChange() { setIsFullscreen(Boolean(document.fullscreenElement)); }
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    let lock: WakeLockSentinel | null = null;
    async function acquire() {
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* ignored */ }
    }
    async function onVisibilityChange() {
      if (document.visibilityState === 'visible' && isFullscreen) await acquire();
    }
    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { lock?.release().catch(() => {}); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [isFullscreen]);

  async function handleToggleQueue() {
    if (!recipe) return;
    setTogglingQueue(true);
    setQueued((q) => !q);
    try {
      const data = await gql<{ toggleRecipeQueued: { queued: boolean } }>(TOGGLE_QUEUED, { id: recipe.id });
      setQueued(data.toggleRecipeQueued.queued);
    } catch {
      // If offline, the optimistic toggle stands; queue it for sync
      if (!navigator.onLine) {
        enqueue(TOGGLE_QUEUED, { id: recipe.id });
      } else {
        setQueued((q) => !q); // revert on real error
      }
    } finally {
      setTogglingQueue(false);
    }
  }

  async function handleDelete() {
    if (!recipe) return;
    setDeleting(true);
    try {
      await gql(DELETE_RECIPE, { id: recipe.id });
      router.push(`${recipesBase}#stage`);
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleComplete() {
    if (!recipe) return;
    setCompleting(true);
    try {
      const result = await gql<{ completeRecipe: { lastMadeAt: string } }>(COMPLETE_RECIPE, { id: recipe.id, servings });
      setLastMadeAt(result.completeRecipe.lastMadeAt);
      setCompletedFlash(true);
      setTimeout(() => setCompletedFlash(false), 3000);
      // Fetch pantry items and show update modal — only items relevant to this recipe
      const data = await gql<{ ingredients: PantryItem[] }>(PANTRY_QUERY, { kitchenSlug: kitchen });
      const recipeNames = recipe.ingredients.map((ri) => ri.ingredientName.toLowerCase());
      const editable = data.ingredients.filter((i) => {
        if (i.alwaysOnHand || i.quantity == null) return false;
        const lower = i.name.toLowerCase();
        return recipeNames.some((rn) => rn.includes(lower) || lower.includes(rn));
      });
      setPantryItems(editable);
      setPantryEdits(new Map());
      setShowPantryUpdate(true);
    } finally {
      setCompleting(false);
    }
  }

  async function handleSavePantry() {
    setSavingPantry(true);
    try {
      for (const [id, quantity] of pantryEdits) {
        await gql(UPDATE_INGREDIENT, { id, quantity });
      }
      setShowPantryUpdate(false);
    } finally {
      setSavingPantry(false);
    }
  }

  function toggleIngredient(idx: number) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function scaleQty(qty: number | null) {
    if (qty == null) return null;
    return Math.round(qty * scaleFactor * 100) / 100;
  }

  if (notFound) {
    return (
      <main id="stage" className="min-h-screen px-4 py-10 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Recipe not found</h1>
          <a href={`${recipesBase}#stage`} className="text-amber-600 dark:text-amber-400 hover:underline">← Back to Recipes</a>
        </div>
      </main>
    );
  }

  if (!recipe) {
    return <main id="stage" className="min-h-screen" aria-busy="true" />;
  }

  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  return (
    <>
      <Head>
        <title>{recipe.title} — Pantry List</title>
        <meta name="description" content={recipe.description ?? `Recipe: ${recipe.title}`} />
      </Head>

      <main id="stage" className="min-h-screen">
        <div className="no-print px-4 py-4 md:px-8 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 max-w-4xl mx-auto">
          <a href={`${recipesBase}#stage`} className="text-sm text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">← Recipes</a>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleToggleQueue}
              disabled={togglingQueue}
              aria-pressed={queued}
              aria-label={queued ? 'Remove from grocery list' : 'Add to grocery list'}
              className={`btn-secondary text-sm transition-colors ${queued ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''}`}
            >
              {queued ? '✓ On List' : '+ Add to List'}
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              aria-busy={completing}
              aria-label="Mark recipe as made and update pantry quantities"
              className={`btn-primary text-sm transition-colors ${completedFlash ? 'bg-green-600 dark:bg-green-500' : ''}`}
            >
              {completing ? 'Saving…' : completedFlash ? 'Done!' : 'I Made This'}
            </button>
            <button type="button" onClick={isFullscreen ? exitZen : enterZen} aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'} aria-pressed={isFullscreen} className="btn-secondary p-2">
              {isFullscreen ? <CompressIcon aria-hidden="true" /> : <ExpandIcon aria-hidden="true" />}
            </button>
            <a href={`${recipesBase}/${recipe.slug ?? recipe.id}/edit#stage`} className="btn-secondary text-sm">Edit</a>
            {deleteConfirm ? (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-zinc-500">Delete?</span>
                <button type="button" autoFocus onClick={handleDelete} disabled={deleting} aria-label="Confirm delete" className="btn-danger text-sm">{deleting ? 'Deleting…' : 'Yes'}</button>
                <button type="button" onClick={() => setDeleteConfirm(false)} className="btn-secondary text-sm">No</button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(true)} aria-label="Delete recipe" className="btn-secondary p-2 hover:text-red-500">
                <TrashIcon aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <article ref={articleRef} className="px-4 py-8 md:px-8 max-w-4xl mx-auto" aria-label={recipe.title}>
          <button type="button" onClick={exitZen} aria-label="Exit full screen" className="zen-exit fixed top-4 right-4 z-50 btn-secondary p-2 bg-white dark:bg-zinc-900 shadow-md">
            <CompressIcon aria-hidden="true" />
          </button>

          {recipe.photoUrl && (
            <div className="mb-8 aspect-[16/9] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={recipe.photoUrl} alt={recipe.title} className="w-full h-full object-cover" />
            </div>
          )}

          <header className="mb-8">
            <div className="flex flex-wrap gap-2 mb-3">
              {recipe.source === 'ai-generated' && (
                <span className="tag inline-flex items-center gap-1" title="AI-generated recipe">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true">
                    <path d="M192,416h64V384H192ZM576,224H544V192a95.99975,95.99975,0,0,0-96-96H336V16a16,16,0,0,0-32,0V96H192a95.99975,95.99975,0,0,0-96,96v32H64a31.99908,31.99908,0,0,0-32,32V384a32.00033,32.00033,0,0,0,32,32H96a95.99975,95.99975,0,0,0,96,96H448a95.99975,95.99975,0,0,0,96-96h32a32.00033,32.00033,0,0,0,32-32V256A31.99908,31.99908,0,0,0,576,224ZM96,384H64V256H96Zm416,32a64.18916,64.18916,0,0,1-64,64H192a64.18916,64.18916,0,0,1-64-64V192a63.99942,63.99942,0,0,1,64-64H448a63.99942,63.99942,0,0,1,64,64Zm64-32H544V256h32ZM416,192a64,64,0,1,0,64,64A64.07333,64.07333,0,0,0,416,192Zm0,96a32,32,0,1,1,32-32A31.97162,31.97162,0,0,1,416,288ZM384,416h64V384H384Zm-96,0h64V384H288ZM224,192a64,64,0,1,0,64,64A64.07333,64.07333,0,0,0,224,192Zm0,96a32,32,0,1,1,32-32A31.97162,31.97162,0,0,1,224,288Z" />
                  </svg>
                  <span className="sr-only">AI</span>
                </span>
              )}
              {recipe.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
            <h1 className="text-4xl font-bold mb-4">{recipe.title}</h1>
            {recipe.description && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-prose">{recipe.description}</p>
            )}

            <dl className="mt-5 flex flex-wrap gap-6 text-sm">
              {totalTime > 0 && (
                <div>
                  <dt className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">Total Time</dt>
                  <dd><time dateTime={`PT${totalTime}M`}>{totalTime} min</time></dd>
                </div>
              )}
              {recipe.prepTime != null && (
                <div>
                  <dt className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">Prep</dt>
                  <dd><time dateTime={`PT${recipe.prepTime}M`}>{recipe.prepTime} min</time></dd>
                </div>
              )}
              {recipe.cookTime != null && (
                <div>
                  <dt className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">Cook</dt>
                  <dd><time dateTime={`PT${recipe.cookTime}M`}>{recipe.cookTime} min</time></dd>
                </div>
              )}
              <div>
                <dt className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">Servings</dt>
                <dd>
                  <div className="flex items-center gap-2" aria-label="Adjust servings">
                    <button type="button" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Decrease servings" className="w-7 h-7 border border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-lg leading-none">−</button>
                    <span className="tabular-nums font-bold w-5 text-center">{servings}</span>
                    <button type="button" onClick={() => setServings((s) => s + 1)} aria-label="Increase servings" className="w-7 h-7 border border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-lg leading-none">+</button>
                  </div>
                </dd>
              </div>
              {lastMadeAt && (
                <div>
                  <dt className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">Last Made</dt>
                  <dd><time dateTime={lastMadeAt}>{new Date(lastMadeAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></dd>
                </div>
              )}
            </dl>

            {recipe.requiredCookware.length > 0 && (
              <div className="mt-5">
                <p className="font-semibold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Cookware</p>
                <div className="flex flex-wrap gap-2">
                  {recipe.requiredCookware.map((c) => <span key={c} className="tag">{c}</span>)}
                </div>
              </div>
            )}
          </header>

          <section aria-labelledby="ingredients-heading" className="mb-10">
            <h2 id="ingredients-heading" className="text-xl font-bold mb-4">Ingredients</h2>
            <ul role="list" className="space-y-2">
              {recipe.ingredients.map((ing, idx) => {
                const checked = checkedIngredients.has(idx);
                const scaledQty = scaleQty(ing.quantity);
                return (
                  <li key={idx}>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={checked} onChange={() => toggleIngredient(idx)} aria-label={ing.ingredientName} className="mt-1 w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 accent-amber-500 shrink-0" />
                      <span className={checked ? 'line-through text-zinc-400 dark:text-zinc-600' : ''}>
                        {scaledQty != null && <span className="font-semibold tabular-nums">{scaledQty}{' '}</span>}
                        {ing.unit && <span>{ing.unit} </span>}
                        {ing.ingredientName}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="instructions-heading">
            <h2 id="instructions-heading" className="text-xl font-bold mb-4">Instructions</h2>
            <ol role="list" className="space-y-6">
              {steps.map((step, idx) => (
                <li key={idx} className="flex items-baseline gap-4">
                  <span className="shrink-0 w-8 text-right text-sm tabular-nums text-zinc-400 dark:text-zinc-500 select-none" aria-hidden="true">{idx + 1}.</span>
                  <p className="leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          {recipe.sourceUrl && (
            <footer className="mt-12 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <a
                href={recipe.sourceUrl}
                target={`_${recipe.slug ?? recipe.id}`}
                rel="noopener noreferrer"
                className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
              >
                View Original Recipe →
              </a>
            </footer>
          )}
        </article>
      </main>

      {showPantryUpdate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Update pantry quantities">
          <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-lg sm:rounded-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <h2 className="font-bold text-lg">Update Pantry</h2>
              <button type="button" onClick={() => setShowPantryUpdate(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {pantryItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 text-sm truncate">{item.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={item.quantity ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setPantryEdits((prev) => {
                        const next = new Map(prev);
                        if (val === item.quantity) next.delete(item.id);
                        else next.set(item.id, isNaN(val) ? 0 : val);
                        return next;
                      });
                    }}
                    aria-label={`Quantity for ${item.name}`}
                    className="field-input w-20 text-right tabular-nums"
                  />
                  <span className="text-xs text-zinc-400 w-10">{item.unit ?? ''}</span>
                </div>
              ))}
              {pantryItems.length === 0 && (
                <p className="px-4 py-6 text-sm text-zinc-500 text-center">No pantry items with tracked quantities.</p>
              )}
            </div>
            <div className="flex gap-3 p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              <button type="button" onClick={() => setShowPantryUpdate(false)} className="btn-secondary flex-1">Skip</button>
              <button
                type="button"
                onClick={handleSavePantry}
                disabled={savingPantry || pantryEdits.size === 0}
                aria-busy={savingPantry}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPantry ? 'Saving…' : `Save${pantryEdits.size > 0 ? ` (${pantryEdits.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExpandIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>;
}
function CompressIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>;
}
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
