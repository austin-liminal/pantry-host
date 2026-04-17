/**
 * URL import page — web package (PGlite).
 *
 * Handles /http/* and /https/* routes. Reconstructs the full URL from
 * the wildcard segments, scrapes the page via feed.pantryhost.app's
 * fetch-recipe endpoint, and renders the shared UrlRecipeDetail preview
 * with an Import CTA.
 */
import { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import UrlRecipeDetail from '@pantry-host/shared/components/UrlRecipeDetail';
import type { ParsedRecipe } from '@pantry-host/shared/bluesky';
import { gql } from '@/lib/gql';

const FEED_FETCH_URL = 'https://feed.pantryhost.app/api/fetch-recipe';

const CREATE_RECIPE = `
  mutation CreateRecipe(
    $title: String!, $description: String, $instructions: String!,
    $servings: Int, $prepTime: Int, $cookTime: Int,
    $tags: [String!], $photoUrl: String, $sourceUrl: String,
    $ingredients: [RecipeIngredientInput!]!
  ) {
    createRecipe(
      title: $title, description: $description, instructions: $instructions,
      servings: $servings, prepTime: $prepTime, cookTime: $cookTime,
      tags: $tags, photoUrl: $photoUrl, sourceUrl: $sourceUrl,
      ingredients: $ingredients
    ) { id slug }
  }
`;

const RECIPES_QUERY = `{ recipes { id slug sourceUrl } }`;

/** Decode each path segment so percent-encoded slashes/colons round-trip. */
function decodeSegments(path: string): string {
  return path.split('/').map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  }).join('/');
}

/** Reconstruct the original URL from wildcard segments, preserving query + hash. */
function buildUrl(scheme: 'http' | 'https', wildcard: string, search: string, hash: string): string {
  return `${scheme}://${decodeSegments(wildcard)}${search}${hash}`;
}

export default function UrlImportPage({ scheme }: { scheme: 'http' | 'https' }) {
  const { '*': wildcard } = useParams();

  if (!wildcard) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <p className="text-[var(--color-text-secondary)]">No URL provided.</p>
      </div>
    );
  }

  const sourceUrl = buildUrl(scheme, wildcard, window.location.search, window.location.hash);

  // Validate via the URL constructor; bail early on malformed input.
  try { new URL(sourceUrl); } catch {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="card p-6">
          <p className="font-semibold mb-1">Invalid URL</p>
          <p className="text-sm text-[var(--color-text-secondary)] break-all">{sourceUrl}</p>
        </div>
      </div>
    );
  }

  const fetcher = useCallback(async (url: string) => {
    const res = await fetch(FEED_FETCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  const handleImport = useCallback(async (recipe: ParsedRecipe) => {
    const data = await gql<{ createRecipe: { id: string; slug: string } }>(CREATE_RECIPE, {
      title: recipe.title,
      description: recipe.description ?? null,
      instructions: recipe.instructions,
      servings: recipe.servings ?? null,
      prepTime: recipe.prepTime ?? null,
      cookTime: recipe.cookTime ?? null,
      tags: recipe.tags,
      photoUrl: recipe.photoUrl ?? null,
      sourceUrl: recipe.sourceUrl,
      ingredients: recipe.ingredients.map((i) => ({
        ingredientName: i.ingredientName,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
      })),
    });
    return { slug: data.createRecipe.slug };
  }, []);

  const checkDuplicate = useCallback(async (url: string) => {
    const data = await gql<{ recipes: { id: string; slug: string; sourceUrl: string | null }[] }>(RECIPES_QUERY);
    const match = data.recipes.find((r) => r.sourceUrl === url);
    return match?.slug ?? null;
  }, []);

  const renderRecipeLink = useCallback((slug: string, children: React.ReactNode) => (
    <Link to={`/recipes/${slug}#stage`}>{children}</Link>
  ), []);

  const renderManualImportLink = useCallback((url: string, children: React.ReactNode) => (
    <Link to={`/recipes/import?url=${encodeURIComponent(url)}#stage`}>{children}</Link>
  ), []);

  return (
    <UrlRecipeDetail
      sourceUrl={sourceUrl}
      fetcher={fetcher}
      onImport={handleImport}
      checkDuplicate={checkDuplicate}
      renderRecipeLink={renderRecipeLink}
      renderManualImportLink={renderManualImportLink}
    />
  );
}
