/**
 * Pantry-sourced nutrition MCP tool.
 *
 * Wraps the same `aggregateNutrition` helper the recipe-detail
 * `<PantryNutritionFacts>` panel uses. Recipes whose `sourceUrl` is
 * a recipe-api.com import have authoritative nutrition available
 * via that API directly — agents that want the highest-fidelity
 * number for those should fetch from there. This tool returns the
 * per-pantry estimate that's stored locally.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';
import {
  aggregateNutrition,
  type RecipeIngredientForNutrition,
  type PantryItemForNutrition,
} from '@pantry-host/shared/nutrition-aggregate';
import { pantryIndex } from '@pantry-host/shared/grocery-status';

interface RecipeNutritionInputs {
  recipe: {
    servings: number | null;
    sourceUrl: string | null;
    groceryIngredients: RecipeIngredientForNutrition[];
  } | null;
  ingredients: PantryItemForNutrition[];
}

const FETCH_NUTRITION_INPUTS = `
  query NutritionInputs($id: String!, $kitchenSlug: String) {
    recipe(id: $id) {
      servings sourceUrl
      groceryIngredients { ingredientName quantity unit itemSize itemSizeUnit }
    }
    ingredients(kitchenSlug: $kitchenSlug) {
      name aliases productMeta alwaysOnHand
    }
  }
`;

export function registerNutritionTools(server: McpServer) {
  server.tool(
    'recipe_nutrition',
    "Per-serving nutrition estimate for a recipe, aggregated from pantry-side Open Food Facts metadata. Same numbers and coverage caveat the recipe-detail \"Estimated Nutrition\" panel renders. Returns the full NutritionPerServing shape (calories, protein_g, carbohydrates_g, fat_g, sugar_g, sodium_mg, …) plus a coverage breakdown — which ingredients contributed grams, which were skipped and why. Recipes whose `sourceUrl` is recipe-api.com have authoritative recipe-level nutrition there; this tool returns only the local pantry estimate.",
    {
      id: z.string().describe('Recipe ID (UUID) or slug'),
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async ({ id, kitchenSlug }) => {
      const data = await gql<RecipeNutritionInputs>(FETCH_NUTRITION_INPUTS, {
        id,
        kitchenSlug: kitchenSlug ?? null,
      });
      if (!data.recipe) {
        return { content: [{ type: 'text' as const, text: 'Recipe not found' }] };
      }
      const lookup = pantryIndex(data.ingredients);
      const result = aggregateNutrition({
        ingredients: data.recipe.groceryIngredients,
        lookup,
        servings: data.recipe.servings,
      });
      // Note for the agent: signal whether recipe-api would be more authoritative.
      const isRecipeApi = data.recipe.sourceUrl?.includes('recipe-api.com') ?? false;
      const payload = {
        nutrition: result.nutrition,
        coverage: {
          contributors: result.contributors,
          missing: result.missing,
          servings: result.servings,
          totalIngredients: result.totalIngredients,
        },
        isRecipeApiSource: isRecipeApi,
        ...(isRecipeApi
          ? {
              note: 'This recipe was imported from recipe-api.com. Their per-serving nutrition data is authoritative; this tool returns only what the local pantry can estimate.',
            }
          : {}),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
