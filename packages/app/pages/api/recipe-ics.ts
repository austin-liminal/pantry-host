import type { NextApiRequest, NextApiResponse } from 'next';
import { generateRecipeICS } from '@pantry-host/shared/export-recipe';

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://localhost:4001/graphql';

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
    const gqlRes = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: RECIPE_QUERY, variables: { slug } }),
    });

    const json = await gqlRes.json() as { data?: { recipe: any }; errors?: { message: string }[] };

    if (json.errors?.length) {
      return res.status(500).send(`GraphQL error: ${json.errors[0].message}`);
    }

    if (!json.data?.recipe) return res.status(404).send('Recipe not found');

    const recipe = {
      ...json.data.recipe,
      requiredCookware: json.data.recipe.requiredCookware.map((c: { name: string }) => c.name),
    };

    const ics = generateRecipeICS(recipe);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.status(200).send(ics);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).send(`Failed to generate ICS: ${msg}`);
  }
}
