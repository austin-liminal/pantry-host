/**
 * Public Domain Recipes — client-side search + GitHub raw fetch.
 *
 * 408 Unlicense recipes from publicdomainrecipes.com.
 * Index is bundled statically — search is instant, no API calls.
 * Full recipe content fetched from raw.githubusercontent.com on import.
 */

import index from './publicdomainrecipes-index.json';

const RAW_BASE = 'https://raw.githubusercontent.com/ronaldl29/public-domain-recipes/master';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PDREntry {
  slug: string;
  title: string;
  tags: string[];
  hasImage: boolean;
}

// ── Search (client-side, instant) ────────────────────────────────────────────

export function searchPublicDomainRecipes(query: string): PDREntry[] {
  if (!query.trim()) return index as PDREntry[];
  const q = query.toLowerCase();
  return (index as PDREntry[]).filter(
    (r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function getPublicDomainImageUrl(slug: string): string {
  return `${RAW_BASE}/static/pix/${encodeURIComponent(slug)}.webp`;
}

// ── Fetch + Parse (on import) ────────────────────────────────────────────────

export async function fetchPublicDomainRecipe(slug: string): Promise<{
  title: string;
  instructions: string;
  tags: string[];
  imageUrl: string | null;
  sourceUrl: string;
  ingredients: { ingredientName: string; quantity: number | null; unit: string | null }[];
}> {
  const res = await fetch(`${RAW_BASE}/content/${encodeURIComponent(slug)}.md`);
  if (!res.ok) throw new Error(`Failed to fetch recipe: ${res.status}`);
  const text = await res.text();

  // Parse YAML frontmatter
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch?.[1] ?? '';
  const titleMatch = fm.match(/title:\s*["']?([^"'\n]+)/);
  const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);

  const title = titleMatch ? titleMatch[1].trim().replace(/["']$/, '') : slug;
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map((t) => t.trim().replace(/["']/g, '')).filter(Boolean)
    : [];

  // Parse body — split on ## headings
  const body = text.replace(/^---[\s\S]*?---\n*/, '');
  const ingredientsMatch = body.match(/## Ingredients\s*\n([\s\S]*?)(?=\n## |\n*$)/);
  const directionsMatch = body.match(/## Directions\s*\n([\s\S]*?)(?=\n## |\n*$)/);

  // Parse ingredients: "- 1 pound (500g) spaghetti" or "- salt"
  const ingredients = (ingredientsMatch?.[1] ?? '')
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((line) => {
      const text = line.replace(/^-\s*/, '').trim();
      const match = text.match(/^([\d./]+(?:\s+[\d./]+)?)\s+(\w+)\s+(.+)$/);
      if (match) {
        const qtyStr = match[1].trim();
        let qty: number | null = null;
        const fracMatch = qtyStr.match(/^(\d+)\/(\d+)$/);
        const mixedMatch = qtyStr.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (mixedMatch) qty = parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
        else if (fracMatch) qty = parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
        else qty = parseFloat(qtyStr) || null;
        return { ingredientName: match[3].trim(), quantity: qty, unit: match[2] };
      }
      // Try simpler: "2 eggs"
      const simpleMatch = text.match(/^([\d./]+)\s+(.+)$/);
      if (simpleMatch) {
        const qty = parseFloat(simpleMatch[1]) || null;
        return { ingredientName: simpleMatch[2].trim(), quantity: qty, unit: null };
      }
      return { ingredientName: text, quantity: null, unit: null };
    });

  // Parse directions: numbered list or bullet list
  const instructions = (directionsMatch?.[1] ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .map((step, i) => `${i + 1}. ${step}`)
    .join('\n');

  // Check if image exists in the index
  const entry = (index as PDREntry[]).find((r) => r.slug === slug);
  const imageUrl = entry?.hasImage ? getPublicDomainImageUrl(slug) : null;

  return {
    title,
    instructions,
    tags: [...tags, 'public-domain'],
    imageUrl,
    sourceUrl: `https://publicdomainrecipes.com/${slug}/`,
    ingredients,
  };
}
