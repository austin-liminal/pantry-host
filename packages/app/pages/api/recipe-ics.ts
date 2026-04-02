import type { NextApiRequest, NextApiResponse } from 'next';
import { gql } from '@/lib/gql';
import { generateRecipeICS } from '@pantry-host/shared/export-recipe';

const RECIPE_QUERY = `
  query Recipe($slug: String!) {
    recipe(slug: $slug) {
      title slug description instructions
      servings prepTime cookTime tags
      source sourceUrl photoUrl
      requiredCookware { name }
      ingredients { ingredientName quantity unit }
    }
  }
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).send('Missing slug parameter');

  try {
    const data = await gql<{ recipe: any }>(RECIPE_QUERY, { slug });
    if (!data.recipe) return res.status(404).send('Recipe not found');

    const recipe = {
      ...data.recipe,
      requiredCookware: data.recipe.requiredCookware.map((c: { name: string }) => c.name),
    };

    const ics = generateRecipeICS(recipe);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.status(200).send(ics);
  } catch (err) {
    res.status(500).send('Failed to generate ICS');
  }
}
