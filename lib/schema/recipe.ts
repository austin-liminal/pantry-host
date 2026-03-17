import { builder } from './builder';
import sql from '../db';
import { generateRecipes as aiGenerateRecipes } from '../claude';

const RecipeIngredientType = builder.objectType('RecipeIngredient', {
  fields: (t) => ({
    ingredientName: t.string({ resolve: (r) => r.ingredient_name }),
    quantity: t.float({ nullable: true, resolve: (r) => r.quantity }),
    unit: t.string({ nullable: true, resolve: (r) => r.unit }),
    sourceRecipeId: t.string({ nullable: true, resolve: (r) => r.source_recipe_id ?? null }),
  }),
});

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = toSlug(title);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = excludeId
      ? await sql`SELECT id FROM recipes WHERE slug = ${candidate} AND id != ${excludeId}`
      : await sql`SELECT id FROM recipes WHERE slug = ${candidate}`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

const RecipeType = builder.objectType('Recipe', {
  fields: (t) => ({
    id: t.exposeString('id'),
    slug: t.string({ nullable: true, resolve: (r) => r.slug ?? null }),
    title: t.exposeString('title'),
    description: t.string({ nullable: true, resolve: (r) => r.description }),
    instructions: t.exposeString('instructions'),
    servings: t.int({ nullable: true, resolve: (r) => r.servings }),
    prepTime: t.int({ nullable: true, resolve: (r) => r.prep_time }),
    cookTime: t.int({ nullable: true, resolve: (r) => r.cook_time }),
    tags: t.stringList({ resolve: (r) => r.tags ?? [] }),
    requiredCookware: t.stringList({ resolve: (r) => r.required_cookware ?? [] }),
    source: t.exposeString('source'),
    sourceUrl: t.string({ nullable: true, resolve: (r) => r.source_url ?? null }),
    photoUrl: t.string({ nullable: true, resolve: (r) => r.photo_url }),
    lastMadeAt: t.string({ nullable: true, resolve: (r) => r.last_made_at?.toISOString() ?? null }),
    queued: t.boolean({ resolve: (r) => r.queued ?? false }),
    ingredients: t.field({
      type: [RecipeIngredientType],
      resolve: async (recipe) => {
        return sql`SELECT * FROM recipe_ingredients WHERE recipe_id = ${recipe.id} ORDER BY id`;
      },
    }),
    createdAt: t.string({ resolve: (r) => r.created_at?.toISOString() ?? '' }),
  }),
});

const RecipeIngredientInputType = builder.inputType('RecipeIngredientInput', {
  fields: (t) => ({
    ingredientName: t.string({ required: true }),
    quantity: t.float(),
    unit: t.string(),
    sourceRecipeId: t.string(), // optional: another recipe used as an ingredient
  }),
});

builder.queryField('recipes', (t) =>
  t.field({
    type: [RecipeType],
    args: {
      tags: t.arg.stringList(),
      cookware: t.arg.stringList(),
      queued: t.arg.boolean(),
    },
    resolve: async (_, { tags, cookware, queued }) => {
      if (tags?.length && cookware?.length) {
        return sql`SELECT * FROM recipes WHERE tags && ${sql.array(tags)} AND required_cookware && ${sql.array(cookware)} ORDER BY created_at DESC`;
      }
      if (tags?.length) {
        return sql`SELECT * FROM recipes WHERE tags && ${sql.array(tags)} ORDER BY created_at DESC`;
      }
      if (cookware?.length) {
        return sql`SELECT * FROM recipes WHERE required_cookware && ${sql.array(cookware)} ORDER BY created_at DESC`;
      }
      if (queued != null) {
        return sql`SELECT * FROM recipes WHERE queued = ${queued} ORDER BY created_at DESC`;
      }
      return sql`SELECT * FROM recipes ORDER BY created_at DESC`;
    },
  }),
);

builder.queryField('recipe', (t) =>
  t.field({
    type: RecipeType,
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      const [row] = await sql`SELECT * FROM recipes WHERE id = ${id} OR slug = ${id}`;
      return row ?? null;
    },
  }),
);

async function insertRecipe(
  data: {
    title: string;
    description?: string | null;
    instructions: string;
    servings?: number | null;
    prepTime?: number | null;
    cookTime?: number | null;
    tags?: string[] | null;
    requiredCookware?: string[] | null;
    source?: string;
    sourceUrl?: string | null;
    photoUrl?: string | null;
  },
  ingredients: { ingredientName: string; quantity?: number | null; unit?: string | null; sourceRecipeId?: string | null }[],
) {
  const slug = await uniqueSlug(data.title);
  const [recipe] = await sql`
    INSERT INTO recipes (title, slug, description, instructions, servings, prep_time, cook_time, tags, required_cookware, source, source_url, photo_url)
    VALUES (
      ${data.title},
      ${slug},
      ${data.description ?? null},
      ${data.instructions},
      ${data.servings ?? 2},
      ${data.prepTime ?? null},
      ${data.cookTime ?? null},
      ${sql.array(data.tags ?? [])},
      ${sql.array(data.requiredCookware ?? [])},
      ${data.source ?? 'manual'},
      ${data.sourceUrl ?? null},
      ${data.photoUrl ?? null}
    )
    RETURNING *
  `;

  if (ingredients.length > 0) {
    await sql`
      INSERT INTO recipe_ingredients ${sql(
        ingredients.map((i) => ({
          recipe_id: recipe.id,
          ingredient_name: i.ingredientName,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          source_recipe_id: i.sourceRecipeId ?? null,
        })),
        'recipe_id',
        'ingredient_name',
        'quantity',
        'unit',
        'source_recipe_id',
      )}
    `;
  }

  return recipe;
}

builder.mutationField('createRecipe', (t) =>
  t.field({
    type: RecipeType,
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string(),
      instructions: t.arg.string({ required: true }),
      servings: t.arg.int(),
      prepTime: t.arg.int(),
      cookTime: t.arg.int(),
      tags: t.arg.stringList(),
      requiredCookware: t.arg.stringList(),
      photoUrl: t.arg.string(),
      sourceUrl: t.arg.string(),
      ingredients: t.arg({ type: [RecipeIngredientInputType], required: true }),
    },
    resolve: async (_, args) => {
      return insertRecipe(
        {
          title: args.title,
          description: args.description,
          instructions: args.instructions,
          servings: args.servings,
          prepTime: args.prepTime,
          cookTime: args.cookTime,
          tags: args.tags,
          requiredCookware: args.requiredCookware,
          photoUrl: args.photoUrl,
          sourceUrl: args.sourceUrl,
          source: args.sourceUrl ? 'url-import' : 'manual',
        },
        args.ingredients,
      );
    },
  }),
);

builder.mutationField('updateRecipe', (t) =>
  t.field({
    type: RecipeType,
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      description: t.arg.string(),
      instructions: t.arg.string(),
      servings: t.arg.int(),
      prepTime: t.arg.int(),
      cookTime: t.arg.int(),
      tags: t.arg.stringList(),
      requiredCookware: t.arg.stringList(),
      photoUrl: t.arg.string(),
      ingredients: t.arg({ type: [RecipeIngredientInputType] }),
    },
    resolve: async (_, args) => {
      const newSlug = args.title ? await uniqueSlug(args.title, args.id) : null;
      const [recipe] = await sql`
        UPDATE recipes SET
          title = COALESCE(${args.title ?? null}, title),
          slug  = COALESCE(${newSlug}, slug),
          description = COALESCE(${args.description ?? null}, description),
          instructions = COALESCE(${args.instructions ?? null}, instructions),
          servings = COALESCE(${args.servings ?? null}, servings),
          prep_time = COALESCE(${args.prepTime ?? null}, prep_time),
          cook_time = COALESCE(${args.cookTime ?? null}, cook_time),
          tags = COALESCE(${args.tags ? sql.array(args.tags) : null}, tags),
          required_cookware = COALESCE(${args.requiredCookware ? sql.array(args.requiredCookware) : null}, required_cookware),
          photo_url = COALESCE(${args.photoUrl ?? null}, photo_url)
        WHERE id = ${args.id}
        RETURNING *
      `;

      if (args.ingredients) {
        await sql`DELETE FROM recipe_ingredients WHERE recipe_id = ${args.id}`;
        if (args.ingredients.length > 0) {
          await sql`
            INSERT INTO recipe_ingredients ${sql(
              args.ingredients.map((i) => ({
                recipe_id: args.id,
                ingredient_name: i.ingredientName,
                quantity: i.quantity ?? null,
                unit: i.unit ?? null,
              })),
              'recipe_id',
              'ingredient_name',
              'quantity',
              'unit',
            )}
          `;
        }
      }

      return recipe;
    },
  }),
);

builder.mutationField('deleteRecipe', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      await sql`DELETE FROM recipes WHERE id = ${id}`;
      return true;
    },
  }),
);

builder.mutationField('completeRecipe', (t) =>
  t.field({
    type: RecipeType,
    args: {
      id: t.arg.string({ required: true }),
      servings: t.arg.int(), // actual servings made; defaults to recipe's base servings
    },
    resolve: async (_, { id, servings: madeServings }) => {
      const [recipe] = await sql`SELECT * FROM recipes WHERE id = ${id}`;
      if (!recipe) throw new Error('Recipe not found');

      const recipeIngredients = await sql`
        SELECT * FROM recipe_ingredients WHERE recipe_id = ${id}
      `;

      const baseServings = recipe.servings ?? 2;
      const scale = (madeServings ?? baseServings) / baseServings;

      // Decrement pantry quantities for each recipe ingredient (case-insensitive match)
      for (const ri of recipeIngredients) {
        if (ri.quantity == null) continue;
        const decrement = ri.quantity * scale;
        await sql`
          UPDATE ingredients
          SET
            quantity = GREATEST(0, quantity - ${decrement}),
            updated_at = NOW()
          WHERE
            LOWER(name) = LOWER(${ri.ingredient_name})
            AND always_on_hand = false
            AND quantity IS NOT NULL
        `;
      }

      const [updated] = await sql`
        UPDATE recipes SET last_made_at = NOW() WHERE id = ${id} RETURNING *
      `;
      return updated;
    },
  }),
);

builder.mutationField('toggleRecipeQueued', (t) =>
  t.field({
    type: RecipeType,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      const [updated] = await sql`
        UPDATE recipes SET queued = NOT queued WHERE id = ${id} RETURNING *
      `;
      if (!updated) throw new Error('Recipe not found');
      return updated;
    },
  }),
);

builder.mutationField('generateRecipes', (t) =>
  t.field({
    type: [RecipeType],
    resolve: async () => {
      const ingredients = await sql`SELECT * FROM ingredients ORDER BY name`;
      const cookware = await sql`SELECT * FROM cookware ORDER BY name`;

      const generated = await aiGenerateRecipes(ingredients, cookware);

      const recipes = await Promise.all(
        generated.map((r) =>
          insertRecipe(
            {
              title: r.title,
              description: r.description,
              instructions: r.instructions,
              servings: r.servings ?? 2,
              prepTime: r.prepTime,
              cookTime: r.cookTime,
              tags: r.tags,
              requiredCookware: r.requiredCookware,
              source: 'ai-generated',
            },
            r.ingredients,
          ),
        ),
      );

      return recipes;
    },
  }),
);
