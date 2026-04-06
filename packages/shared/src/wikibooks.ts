/**
 * Wikibooks Cookbook — fetch, normalize, and search ~3,900 CC-BY-SA recipes
 * from the gossminn/wikibooks-cookbook dataset on Hugging Face.
 *
 * License: CC-BY-SA-4.0 (attribution required)
 * Source: https://huggingface.co/datasets/gossminn/wikibooks-cookbook
 */

const HF_API = 'https://datasets-server.huggingface.co/rows';
const DATASET = 'gossminn/wikibooks-cookbook';
const BATCH_SIZE = 100;

// ── Types ────────────────────────────────────────────────────────────────────

export interface WikibooksEntry {
  slug: string;
  title: string;
  tags: string[];
  servings: number | null;
  time: string | null;
  difficulty: number | null;
  sourceUrl: string;
  ingredients: string[];
  instructions: string;
}

interface RawTextLine {
  line_type: string;
  section: string | null;
  text: string;
}

interface RawInfobox {
  category?: string;
  difficulty?: number | null;
  servings?: string | null;
  time?: string;
}

interface RawRecipeData {
  infobox: RawInfobox;
  text_lines: RawTextLine[];
  title: string;
  url: string;
}

interface RawRow {
  row: { recipe_data: RawRecipeData; filename: string };
}

interface HFResponse {
  rows: RawRow[];
  num_rows_total: number;
}

// ── Normalization ────────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractTags(infobox: RawInfobox): string[] {
  const tags: string[] = ['wikibooks'];
  if (infobox.category) {
    const cat = infobox.category
      // "/wiki/Category:Salad_dressing_recipes" → "Salad_dressing_recipes"
      .replace(/^\/wiki\/Category:/i, '')
      // "/w/index.php?title=Category:Flatbread_recipes&..." → "Flatbread_recipes"
      .replace(/^\/w\/index\.php\?title=Category:/i, '')
      .replace(/&.*$/, '')
      // Strip "Cookbook:" prefix variants
      .replace(/^Cookbook:Cuisine of\s*/i, '')
      .replace(/^Cookbook:\s*/i, '')
      // Underscores to spaces, trim "_recipes" suffix
      .replace(/_/g, ' ')
      .replace(/\s*recipes$/i, '')
      .trim();
    if (cat) tags.push(cat.toLowerCase());
  }
  return tags;
}

export function normalizeRow(raw: RawRecipeData): WikibooksEntry {
  const ingredients = raw.text_lines
    .filter((l) => l.section === 'Ingredients' && l.text.trim())
    .map((l) => l.text.trim());

  const instructions = raw.text_lines
    .filter((l) => l.section === 'Procedure' && l.text.trim())
    .map((l, i) => `${i + 1}. ${l.text.trim()}`)
    .join('\n');

  return {
    slug: toSlug(raw.title),
    title: raw.title,
    tags: extractTags(raw.infobox),
    servings: raw.infobox.servings ? parseInt(raw.infobox.servings) || null : null,
    time: raw.infobox.time || null,
    difficulty: raw.infobox.difficulty ?? null,
    sourceUrl: raw.url,
    ingredients,
    instructions: instructions || raw.text_lines
      .filter((l) => l.section && l.section !== 'Ingredients' && l.text.trim())
      .map((l) => l.text.trim())
      .join('\n'),
  };
}

// ── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Download the full dataset in paginated batches.
 * Calls `onProgress(done, total)` after each batch.
 * Returns all normalized entries.
 */
export async function fetchWikibooksDataset(
  onProgress?: (done: number, total: number) => void,
): Promise<WikibooksEntry[]> {
  // First request to get total count
  const firstUrl = `${HF_API}?dataset=${DATASET}&config=default&split=main&offset=0&length=${BATCH_SIZE}`;
  const firstRes = await fetch(firstUrl);
  if (!firstRes.ok) throw new Error(`Hugging Face API error: ${firstRes.status}`);
  const firstData: HFResponse = await firstRes.json();

  const totalRows = firstData.num_rows_total;
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
  const entries: WikibooksEntry[] = [];

  // Process first batch
  for (const row of firstData.rows) {
    try { entries.push(normalizeRow(row.row.recipe_data)); } catch { /* skip malformed */ }
  }
  onProgress?.(1, totalBatches);

  // Fetch remaining batches
  for (let batch = 1; batch < totalBatches; batch++) {
    const offset = batch * BATCH_SIZE;
    const url = `${HF_API}?dataset=${DATASET}&config=default&split=main&offset=${offset}&length=${BATCH_SIZE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hugging Face API error: ${res.status} at offset ${offset}`);
    const data: HFResponse = await res.json();

    for (const row of data.rows) {
      try { entries.push(normalizeRow(row.row.recipe_data)); } catch { /* skip malformed */ }
    }
    onProgress?.(batch + 1, totalBatches);
  }

  return entries;
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * Instant client-side search across title, tags, and ingredients.
 */
export function searchWikibooks(query: string, data: WikibooksEntry[]): WikibooksEntry[] {
  if (!query.trim()) return data;
  const q = query.toLowerCase();
  return data.filter((r) =>
    r.title.toLowerCase().includes(q) ||
    r.tags.some((t) => t.includes(q)) ||
    r.ingredients.some((i) => i.toLowerCase().includes(q))
  );
}

// ── Ingredient Parsing (for import) ──────────────────────────────────────────

/** Parse fraction strings: "1/4", "1 1/2", "3" */
function parseFraction(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse a raw ingredient line into structured data for GraphQL import.
 * e.g. "2 cups flour" → { ingredientName: "flour", quantity: 2, unit: "cup" }
 */
export function parseIngredientLine(line: string): { ingredientName: string; quantity: number | null; unit: string | null } {
  const match = line.match(/^([\d\s/]+)?\s*(\w+)?\s+(.+)$/);
  if (match) {
    const qty = parseFraction(match[1]?.trim() || '');
    const unit = match[2]?.trim() || null;
    const name = match[3]?.trim() || line.trim();
    return { ingredientName: name, quantity: qty, unit };
  }
  return { ingredientName: line.trim(), quantity: null, unit: null };
}
