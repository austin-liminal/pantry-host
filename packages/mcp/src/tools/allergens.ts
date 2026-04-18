/**
 * Allergen-aware MCP tools.
 *
 * Wraps the same `aggregateAllergens` helper the recipe-detail
 * `<AllergensLine>` uses, so agents and the UI agree on what a
 * recipe "contains" without re-implementing matching, alias lookup,
 * sub-recipe recursion, or OFF metadata parsing.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';
import {
  aggregateAllergens,
  type RecipeIngredientForNutrition,
  type PantryItemForNutrition,
} from '@pantry-host/shared/nutrition-aggregate';
import { pantryIndex } from '@pantry-host/shared/grocery-status';

interface RecipeAllergenInputs {
  recipe: {
    tags: string[];
    /** Recursively unfurled — sub-recipe ingredients are flattened. */
    groceryIngredients: RecipeIngredientForNutrition[];
  } | null;
  ingredients: PantryItemForNutrition[];
}

const FETCH_ALLERGEN_INPUTS = `
  query AllergenInputs($id: String!, $kitchenSlug: String) {
    recipe(id: $id) {
      tags
      groceryIngredients { ingredientName quantity unit itemSize itemSizeUnit }
    }
    ingredients(kitchenSlug: $kitchenSlug) {
      name aliases productMeta alwaysOnHand
    }
  }
`;

/** Compute the allergen rollup + a source split (tag- vs metadata-derived).
 *  Exposed as a function so the search filter can reuse it without
 *  re-fetching; not exported on the MCP wire. */
export async function computeRecipeAllergens(
  recipeId: string,
  kitchenSlug?: string,
): Promise<{
  allergens: string[];
  sources: { tag: string[]; metadata: string[] };
}> {
  const data = await gql<RecipeAllergenInputs>(FETCH_ALLERGEN_INPUTS, {
    id: recipeId,
    kitchenSlug: kitchenSlug ?? null,
  });
  if (!data.recipe) return { allergens: [], sources: { tag: [], metadata: [] } };

  const lookup = pantryIndex(data.ingredients);

  // Tag-only pass: compute substances from `contains-*` tags alone.
  const tagOnly = aggregateAllergens({
    ingredients: [],
    lookup,
    recipeTags: data.recipe.tags,
  });
  // Metadata-only pass: compute substances from pantry meta with no tag input.
  const metaOnly = aggregateAllergens({
    ingredients: data.recipe.groceryIngredients,
    lookup,
    recipeTags: [],
  });
  // Union, sorted, deduped via aggregateAllergens itself.
  const all = aggregateAllergens({
    ingredients: data.recipe.groceryIngredients,
    lookup,
    recipeTags: data.recipe.tags,
  });

  return { allergens: all, sources: { tag: tagOnly, metadata: metaOnly } };
}

export function registerAllergenTools(server: McpServer) {
  server.tool(
    'recipe_allergens',
    "Allergens that surface for a recipe — the union of any `contains-*` recipe tag and the OFF `allergens_tags` from each ingredient's matching pantry row, recursing through sub-recipes via groceryIngredients. Returns deduped, lowercase substance strings (e.g. \"peanuts\", \"tree nuts\", \"milk\"). The `sources` split lets you explain why a substance appears: `tag` = author-asserted, `metadata` = derived from a pantry row's stored Open Food Facts data. Same logic as the AllergensLine UI on the recipe detail page.",
    {
      id: z.string().describe('Recipe ID (UUID) or slug'),
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async ({ id, kitchenSlug }) => {
      const result = await computeRecipeAllergens(id, kitchenSlug);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
